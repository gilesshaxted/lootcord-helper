const { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs } = require('firebase/firestore');
const { EmbedBuilder } = require('discord.js');

const STICKY_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

/**
 * Creates and stores a new sticky message entry in Firestore.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} channelId The ID of the channel where the sticky message is.
 * @param {string} userId The ID of the user who activated the solo command.
 * @param {string} mobChannelOriginalName The original name of the channel before renaming (for revert trigger).
 * @returns {Promise<string|null>} The ID of the newly created sticky message in Discord, or null on failure.
 */
async function createStickyMessage(client, db, channelId, userId, mobChannelOriginalName) {
    const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);
    const stickyDocRef = doc(soloStickyMessagesRef, channelId); // Document ID is channelId

    try {
        // Create the embed for the sticky message
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color
            .setTitle('THIS MOB IS SOLO')
            .setDescription(`<@${userId}> has chosen to take this mob solo.\nPlease do not attack this mob.`)
            .setFooter({ text: `Thanks the Lemon Team - ${new Date().toLocaleString()}` });

        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Sticky Message Manager: Channel ${channelId} not found or not text-based for sticky message.`);
            return null;
        }

        const stickyDiscordMessage = await channel.send({ embeds: [embed] });

        const expirationTimestamp = Date.now() + STICKY_DURATION_MS;
        await setDoc(stickyDocRef, {
            userId: userId,
            stickyMessageId: stickyDiscordMessage.id, // Store the ID of the bot's message
            channelId: channelId,
            guildId: channel.guild.id,
            expirationTimestamp: expirationTimestamp,
            mobChannelOriginalName: mobChannelOriginalName, // Store original name for revert trigger
            isActive: true,
            lastPostedTimestamp: Date.now()
        }, { merge: true });

        console.log(`Sticky Message Manager: Created sticky message ${stickyDiscordMessage.id} for channel ${channelId}.`);
        return stickyDiscordMessage.id;

    } catch (error) {
        console.error(`Sticky Message Manager: Error creating sticky message for channel ${channelId}:`, error);
        return null;
    }
}

/**
 * Reposts an existing sticky message to keep it at the bottom.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {object} stickyMessageData The data of the sticky message from Firestore.
 */
async function repostStickyMessage(client, db, stickyMessageData) {
    const channelId = stickyMessageData.channelId;
    const oldStickyMessageId = stickyMessageData.stickyMessageId;
    const userId = stickyMessageData.userId; // User who activated solo
    const mobChannelOriginalName = stickyMessageData.mobChannelOriginalName;

    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
        console.warn(`Sticky Message Manager: Channel ${channelId} not found or not text-based for repost. Attempting to remove sticky entry.`);
        await removeStickyMessage(client, db, channelId); // Pass client to removeStickyMessage
        return;
    }

    try {
        // Try to delete the old sticky message
        const oldMessage = await channel.messages.fetch(oldStickyMessageId).catch(() => null);
        if (oldMessage) {
            await oldMessage.delete();
            console.log(`Sticky Message Manager: Deleted old sticky message ${oldStickyMessageId} in #${channel.name}.`);
        } else {
            console.warn(`Sticky Message Manager: Old Discord sticky message ${oldStickyMessageId} not found or already deleted during repost attempt.`);
        }

        // Recreate the embed for the new sticky message
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color
            .setTitle('THIS MOB IS SOLO')
            .setDescription(`<@${userId}> has chosen to take this mob solo.\nPlease do not attack this mob.`)
            .setFooter({ text: `Thanks the Lemon Team - ${new Date().toLocaleString()}` });

        const newStickyDiscordMessage = await channel.send({ embeds: [embed] });
        console.log(`Sticky Message Manager: Reposted sticky message ${newStickyDiscordMessage.id} in #${channel.name}.`);

        // Update Firestore with the new message ID and last posted timestamp
        const stickyDocRef = doc(collection(db, `SoloStickyMessages`), channelId);
        await updateDoc(stickyDocRef, { // Firestore Write #1
            stickyMessageId: newStickyDiscordMessage.id,
            lastPostedTimestamp: Date.now(),
            expirationTimestamp: Date.now() + STICKY_DURATION_MS 
        });
        console.log(`Sticky Message Manager: Updated Firestore with new sticky message ID for channel ${channelId}.`);

    } catch (error) {
        console.error(`Sticky Message Manager: Error reposting sticky message in #${channel.name}:`, error);
        // If reposting fails, it might be best to remove the sticky entry to prevent further errors
        await removeStickyMessage(client, db, channelId); // Pass client to removeStickyMessage
    }
}

/**
 * Removes a sticky message entry from Firestore and attempts to delete the Discord message.
 * Also clears the user's activeChannelId in SoloCooldowns.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} channelId The ID of the channel.
 */
async function removeStickyMessage(client, db, channelId) {
    const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);
    const stickyDocRef = doc(soloStickyMessagesRef, channelId);
    const soloCooldownsRef = collection(db, `SoloCooldowns`);

    try {
        const docSnap = await getDoc(stickyDocRef);
        if (docSnap.exists()) {
            const stickyData = docSnap.data();
            const stickyMessageId = stickyData.stickyMessageId;
            const userId = stickyData.userId; // Get userId from stickyData

            const channel = client.channels.cache.get(channelId);
            if (channel && channel.isTextBased()) {
                const oldMessage = await channel.messages.fetch(stickyMessageId).catch(() => null);
                if (oldMessage) {
                    await oldMessage.delete();
                    console.log(`Sticky Message Manager: Deleted Discord sticky message ${stickyMessageId} in #${channel.name}.`);
                } else {
                    console.warn(`Sticky Message Manager: Discord sticky message ${stickyMessageId} not found or already deleted during removal.`);
                }
            } else {
                console.warn(`Sticky Message Manager: Channel ${channelId} not found or not text-based for sticky message deletion.`);
            }

            await deleteDoc(stickyDocRef); // Delete the sticky message entry from Firestore
            console.log(`Sticky Message Manager: Removed sticky message entry for channel ${channelId} from Firestore.`);

            // --- NEW: Clear user's active solo channel and reset cooldown for this specific channel ---
            const userCooldownDocRef = doc(soloCooldownsRef, userId);
            const userCooldownSnap = await getDoc(userCooldownDocRef);
            if (userCooldownSnap.exists() && userCooldownSnap.data().activeChannelId === channelId) {
                await updateDoc(userCooldownDocRef, {
                    activeChannelId: null, // Clear the active channel
                    lastUsedTimestamp: 0 // Reset cooldown completely, or set to Date.now() if a new cooldown should start
                });
                console.log(`Sticky Message Manager: Cleared active channel and reset cooldown for user ${userId}.`);
            } else {
                console.log(`Sticky Message Manager: User ${userId} cooldown not found or not linked to channel ${channelId}.`);
            }
            return true;
        } else {
            console.log(`Sticky Message Manager: No sticky message entry found for channel ${channelId} to remove.`);
            return false;
        }
    } catch (error) {
        console.error(`Sticky Message Manager: Error removing sticky message for channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Checks all active sticky messages and removes expired ones.
 * This should be called periodically (e.g., via setInterval in index.js).
 * @param {object} db The Firestore database instance.
 * @param {Client} client The Discord client instance.
 */
async function cleanupExpiredStickyMessages(db, client) {
    console.log('Sticky Message Manager: Running cleanup for expired sticky messages...');
    if (!db) {
        console.warn('Sticky Message Manager: Firestore DB not ready for cleanup. Skipping.');
        return;
    }

    const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);
    const q = query(soloStickyMessagesRef, where('isActive', '==', true)); // Query for active sticky messages

    try {
        const querySnapshot = await getDocs(q);
        const now = Date.now();
        let cleanedCount = 0;

        for (const docSnap of querySnapshot.docs) {
            const stickyData = docSnap.data();
            if (stickyData.expirationTimestamp <= now) {
                console.log(`Sticky Message Manager: Expired sticky message found for channel ${stickyData.channelId}. Cleaning up.`);
                await removeStickyMessage(client, db, stickyData.channelId); // Pass client here
                cleanedCount++;
            }
        }
        console.log(`Sticky Message Manager: Cleanup complete. Removed ${cleanedCount} expired sticky messages.`);
    } catch (error) {
        console.error('Sticky Message Manager: Error during cleanup of expired sticky messages:', error);
    }
}


module.exports = {
    createStickyMessage,
    repostStickyMessage,
    removeStickyMessage,
    cleanupExpiredStickyMessages
};
