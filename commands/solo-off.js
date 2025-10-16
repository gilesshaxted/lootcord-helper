const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { doc, collection, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');

// Removed COOLDOWN_DURATION_MS constant as it is not used in this file but should be inferred or defined elsewhere
// Note: Sticky message cleanup logic (which is the primary reset) is in stickyMessageManager.js
// We aim to align with the manager's logic to reset the cooldown completely.

module.exports = {
    data: new SlashCommandBuilder()
        .setName('solo-off')
        .setDescription('Removes an active sticky "mob solo" message from the current channel.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        // --- NEW: Very early log to confirm command execution start ---
        console.log(`[Solo-Off Command - Debug] START: Command /solo-off received by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name}).`);

        try {
            await interaction.deferReply({ ephemeral: false }); // Reply publicly

            // Permissions Check
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                console.warn(`[Solo-Off Command] User ${interaction.user.tag} tried to use /solo-off without Manage Channels permission.`);
                return await interaction.editReply({
                    content: '❌ You need "Manage Channels" permission to use this command.',
                    ephemeral: true,
                });
            }
            console.log(`[Solo-Off Command - Debug] User has required permissions.`);

            if (!db) {
                console.error('[Solo-Off Command] Firestore DB not initialized.');
                return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
            }
            console.log(`[Solo-Off Command - Debug] Firestore DB is ready.`);

            const userId = interaction.user.id;
            const channelId = interaction.channel.id;

            const soloCooldownsRef = collection(db, `SoloCooldowns`);
            const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);

            const userCooldownDocRef = doc(soloCooldownsRef, userId);
            const channelStickyDocRef = doc(soloStickyMessagesRef, channelId);

            // --- Check for active sticky message in this channel ---
            const channelStickySnap = await getDoc(channelStickyDocRef);
            if (!channelStickySnap.exists() || !channelStickySnap.data().isActive) {
                console.log(`[Solo-Off Command] No active solo message found in #${interaction.channel.name}.`);
                return await interaction.editReply({
                    content: 'ℹ️ There is no active solo message in this channel to remove.',
                    ephemeral: false,
                });
            }

            const stickyData = channelStickySnap.data();
            const stickyMessageId = stickyData.stickyMessageId;
            const soloingUserId = stickyData.userId; // User who originally activated solo

            // --- Remove sticky message from Discord and Firestore ---
            try {
                const channel = client.channels.cache.get(channelId);
                if (channel && channel.isTextBased()) {
                    const oldMessage = await channel.messages.fetch(stickyMessageId).catch(() => null);
                    if (oldMessage) {
                        await oldMessage.delete();
                        console.log(`[Solo-Off Command] Deleted Discord sticky message ${stickyMessageId} in #${channel.name}.`);
                    } else {
                        console.warn(`[Solo-Off Command] Discord sticky message ${stickyMessageId} not found or already deleted.`);
                    }
                } else {
                    console.warn(`[Solo-Off Command] Channel ${channelId} not found or not text-based for sticky message deletion.`);
                }

                await deleteDoc(channelStickyDocRef); // Delete the sticky message entry from Firestore
                console.log(`[Solo-Off Command] Removed sticky message entry for channel ${channelId} from Firestore.`);

                // --- Clear user's active solo channel and reset cooldown for this specific channel ---
                const userCooldownSnap = await getDoc(userCooldownDocRef);
                if (userCooldownSnap.exists()) {
                    const cooldownData = userCooldownSnap.data();
                    // Only update the cooldown if the user's *active* channel is this channel
                    if (cooldownData.activeChannelId === channelId) {
                        await updateDoc(userCooldownDocRef, {
                            activeChannelId: null, // Clear the active channel
                            lastUsedTimestamp: 0 // Reset cooldown completely to allow immediate re-use, aligning with manager
                        });
                        console.log(`[Solo-Off Command] Cleared active channel and reset cooldown for user ${soloingUserId}.`);
                    }
                }

                await interaction.editReply({ content: `✅ Solo message removed from <#${channelId}>.`, ephemeral: false });
                // statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Uncomment if you want to track solo-off command usage as a help
                console.log(`Solo-Off Command: Command executed successfully by ${interaction.user.tag} in #${interaction.channel.name}.`);

            } catch (error) {
                console.error('Solo-Off Command: Error removing sticky message:', error);
                await interaction.editReply({ content: '❌ An error occurred while trying to remove the solo message. Please check logs.', ephemeral: false });
            }

        } catch (error) {
            console.error('Solo-Off Command: An unexpected error occurred during execution:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An unexpected error occurred while trying to remove the solo message. Please check logs.', ephemeral: false });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ An unexpected error occurred while trying to remove the solo message. Please check logs.', ephemeral: false });
            }
        }
        console.log(`[Solo-Off Command - Debug] END: Command /solo-off execution for ${interaction.user.tag}.`);
    },
};
