const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

const TARGET_GAME_BOT_ID = '493316754689359874';
const COOLDOWN_DEBUG_CHANNEL_ID = '1307628841799254026';

async function sendDebugMessage(client, messageContent) {
    const debugChannel = client.channels.cache.get(COOLDOWN_DEBUG_CHANNEL_ID);
    if (debugChannel && debugChannel.isTextBased()) {
        try {
            await debugChannel.send(`**MobDetect Debug:** ${messageContent}`);
            // Do not log to console to avoid excessive clutter.
        } catch (error) {
            console.error(`[MobDetect Debug] Failed to send debug message to channel #${debugChannel.name}:`, error);
        }
    }
}

const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;
// Removed the old regex in favor of more flexible string includes
// const MOB_KILLED_MESSAGE_REGEX = /You killed the \*\*(.*?)\*\*!/i;
// const MOB_ESCAPED_MESSAGE_REGEX = /The \*\*(.*?)\*\* has escaped!/i;

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Log to console to confirm the listener is active
        console.log(`[MobDetect Debug] Listener active for message from ${message.author.tag} in #${message.channel.name}`);

        if (message.author.id !== TARGET_GAME_BOT_ID) {
            await sendDebugMessage(client, `Ignoring message from non-target bot: \`${message.author.tag}\`. Expected bot ID: \`${TARGET_GAME_BOT_ID}\``);
            return;
        }
        if (message.author.id === client.user.id) {
            await sendDebugMessage(client, `Ignoring message from self.`);
            return;
        }

        if (!isFirestoreReady) {
            await sendDebugMessage(client, `⚠️ **Firestore is not ready.** Skipping message processing for mob events.`);
            return;
        }
        
        const guildId = message.guild.id;
        const channelId = message.channel.id;
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelConfigDocRef = doc(guildChannelsRef, channelId);

        // --- Detect Mob Spawn ---
        const mobSpawnMatch = message.content.match(MOB_MESSAGE_REGEX);
        if (mobSpawnMatch) {
            const mobName = mobSpawnMatch[1];
            let newName = null;
            if (mobName.includes('Heavy Scientist')) {
                newName = '🐻╏heavy';
            } else if (mobName.includes('Scientist')) {
                newName = '🥼╏scientist';
            } else if (mobName.includes('Tunnel Dweller')) {
                newName = '🧟╏dweller';
            } else if (mobName.includes('Patrol Helicopter')) {
                newName = '🚁╏heli';
            } else if (mobName.includes('Bradley APC')) {
                newName = '🚨╏brad';
            }

            if (newName && message.channel.name !== newName) {
                const oldChannelName = message.channel.name;
                await sendDebugMessage(client, `**Mob Spawn Detected:** \`${mobName}\` in channel <#${channelId}>. Attempting rename from \`${oldChannelName}\` to \`${newName}\`.`);

                try {
                    const channelConfigSnap = await getDoc(channelConfigDocRef);
                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {
                        await setDoc(channelConfigDocRef, {
                            originalChannelName: oldChannelName
                        }, { merge: true });
                        await sendDebugMessage(client, `Saved original name \`${oldChannelName}\` to Firestore.`)
                    } else {
                        await sendDebugMessage(client, `Original name already exists in Firestore: \`${channelConfigSnap.data().originalChannelName}\`. Not overwriting.`);
                    }
                    
                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);
                    await sendDebugMessage(client, `✅ Channel name change successful. New name is \`${newName}\`.`);
                } catch (error) {
                    if (error.code === 50013) {
                        await sendDebugMessage(client, `❌ **Failed to rename channel.** Bot lacks **Manage Channels** permission in <#${channelId}>.`);
                    } else {
                        await sendDebugMessage(client, `❌ **Failed to rename channel.** Unexpected error: \`\`\`${error.message}\`\`\``);
                    }
                }
            } else {
                await sendDebugMessage(client, `Mob spawn detected (${mobName}) in <#${channelId}>, but name is already correct or no new name was matched.`);
            }
        }

        // --- Detect Mob Killed or Escaped (Updated Logic) ---
        const embed = message.embeds.length > 0 ? message.embeds[0] : null;
        const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
        const embedDescriptionKilledMobRevert = embed && embed.description && embed.description.includes('killed a mob');
        const contentDiedRevert = message.content.includes(':deth: The **') && message.content.includes('DIED!**');
        const embedDescriptionDiedRevert = embed && embed.description && embed.description.includes('DIED!');
        const embedDescriptionDethRevert = embed && embed.description && embed.description.includes(':deth:');
        const revertCondition = embedTitleRevert || embedDescriptionKilledMobRevert || contentDiedRevert || embedDescriptionDiedRevert || embedDescriptionDethRevert;

        if (revertCondition) {
            const eventType = embedTitleRevert ? 'left' : 'killed'; // Infer event type for debug message
            await sendDebugMessage(client, `**Mob Revert Condition Met:** Detected a mob was killed or left in channel <#${channelId}>. Attempting to revert name and remove sticky message.`);

            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        const oldChannelName = message.channel.name;
                        await message.channel.setName(originalChannelName, `Automated revert: mob ${eventType}.`);
                        await sendDebugMessage(client, `✅ Channel reverted successfully: \`${oldChannelName}\` -> \`${originalChannelName}\`.`);
                    } else {
                         await sendDebugMessage(client, `Channel name is already at its original name: \`${originalChannelName}\`. No revert needed.`);
                    }
                } else {
                    await sendDebugMessage(client, `⚠️ **No original channel name found** in Firestore for <#${channelId}>. Skipping revert.`);
                }
            } catch (error) {
                if (error.code === 50013) {
                     await sendDebugMessage(client, `❌ **Failed to revert channel name.** Bot lacks **Manage Channels** permission.`);
                } else {
                     await sendDebugMessage(client, `❌ **Failed to revert channel name.** Unexpected error: \`\`\`${error.message}\`\`\``);
                }
            }
            
            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
                await sendDebugMessage(client, `✅ Sticky message removal attempted. Check channel for confirmation.`);
            } catch (error) {
                await sendDebugMessage(client, `❌ **Failed to remove sticky message.** Unexpected error: \`\`\`${error.message}\`\`\``);
            }
        }
    },
};
