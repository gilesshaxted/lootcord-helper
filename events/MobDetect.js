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
const MOB_KILLED_MESSAGE_REGEX = /You killed the \*\*(.*?)\*\*!/i;
const MOB_ESCAPED_MESSAGE_REGEX = /The \*\*(.*?)\*\* has escaped!/i;

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Log to console to confirm the listener is active
        console.log(`[MobDetect Debug] Listener active for message from ${message.author.tag} in #${message.channel.name}`);

        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[MobDetect Debug] Ignoring message: Not from target game bot.`);
            return;
        }

        if (!isFirestoreReady) {
            console.warn('MobDetect: Firestore DB not ready. Skipping message processing.');
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
                await sendDebugMessage(client, `Enemy spawned (${mobName}) in channel <#${channelId}>. Old name: \`${oldChannelName}\`. New name: \`${newName}\`.`);

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
                    await sendDebugMessage(client, `Channel name change successful.`);
                } catch (error) {
                    if (error.code === 50013) {
                        await sendDebugMessage(client, `❌ Failed to rename channel. Bot lacks **Manage Channels** permission.`);
                    } else {
                        await sendDebugMessage(client, `❌ Failed to rename channel due to an unexpected error: \`\`\`${error.message}\`\`\``);
                    }
                }
            } else {
                await sendDebugMessage(client, `Enemy spawned (${mobName}) in channel <#${channelId}>, but channel name is already correct or no new name was matched.`);
            }
        }

        // --- Detect Mob Killed or Escaped ---
        const mobKilledMatch = message.content.match(MOB_KILLED_MESSAGE_REGEX);
        const mobEscapedMatch = message.content.match(MOB_ESCAPED_MESSAGE_REGEX);

        if (mobKilledMatch || mobEscapedMatch) {
            const mobName = mobKilledMatch ? mobKilledMatch[1] : mobEscapedMatch[1];
            const eventType = mobKilledMatch ? 'killed' : 'escaped';
            await sendDebugMessage(client, `Detected mob ${eventType} (${mobName}) in channel <#${channelId}>. Attempting to revert channel name and remove sticky message.`);

            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
                await sendDebugMessage(client, `Sticky message removed successfully.`);
            } catch (error) {
                await sendDebugMessage(client, `❌ Failed to remove sticky message due to an unexpected error: \`\`\`${error.message}\`\`\``);
            }

            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        const oldChannelName = message.channel.name;
                        await message.channel.setName(originalChannelName, `Automated revert: mob ${eventType}.`);
                        await sendDebugMessage(client, `Channel reverted successfully: \`${oldChannelName}\` -> \`${originalChannelName}\`.`);
                    } else {
                         await sendDebugMessage(client, `Channel name is already at its original name: \`${originalChannelName}\`. No revert needed.`);
                    }
                } else {
                    await sendDebugMessage(client, `⚠️ No original channel name found in Firestore for <#${channelId}>. Skipping revert.`);
                }
            } catch (error) {
                if (error.code === 50013) {
                     await sendDebugMessage(client, `❌ Failed to revert channel name. Bot lacks **Manage Channels** permission.`);
                } else {
                     await sendDebugMessage(client, `❌ Failed to revert channel name due to an unexpected error: \`\`\`${error.message}\`\`\``);
                }
            }
        }
    },
};
