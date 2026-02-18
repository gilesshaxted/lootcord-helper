const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

// --- Configuration ---
const TARGET_GAME_BOT_IDS = ['493316754689359874'];
const COOLDOWN_DEBUG_CHANNEL_ID = '1307628841799254026';
const BOT_ID = '1393708735104422040';

/**
 * Sends a debug message to the configured debug channel.
 * @param {Client} client The Discord client instance.
 * @param {string} messageContent The content of the message to send.
 */
async function sendDebugMessage(client, messageContent) {
    const debugChannel = client.channels.cache.get(COOLDOWN_DEBUG_CHANNEL_ID);
    if (debugChannel && debugChannel.isTextBased()) {
        try {
            await debugChannel.send(`**MobDetect Debug:** ${messageContent}`);
        } catch (error) {
            console.error(`[MobDetect Debug] Failed to send debug message to channel #${debugChannel.name}:`, error);
        }
    }
}

// Regex to detect mob spawn messages
const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from this bot, in the debug channel, or from a non-target bot.
        if (message.channel.id === COOLDOWN_DEBUG_CHANNEL_ID || message.author.id === BOT_ID || !TARGET_GAME_BOT_IDS.includes(message.author.id)) {
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
                        await sendDebugMessage(client, `Saved original name \`${oldChannelName}\` to Firestore.`);
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
        // The check for the death message has been made more robust
        const deathRevertCondition = message.content.includes('DIED!');
        // Conditions for an escaped mob or the "left..." message in the embed title
        const escapeRevertCondition = message.content.includes('escaped!') || (embed && embed.title && embed.title.includes('left...'));
        const revertCondition = deathRevertCondition || escapeRevertCondition;

        if (revertCondition) {
            let eventType;
            if (deathRevertCondition) {
                eventType = 'killed';
            } else if (escapeRevertCondition) {
                eventType = 'escaped';
            }

            await sendDebugMessage(client, `**Revert Condition Met.** Event Type: ${eventType}.`);

            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        const oldChannelName = message.channel.name;
                        await message.channel.setName(originalChannelName, `Automated revert to original name.`);
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
