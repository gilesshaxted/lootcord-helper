const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

const TARGET_GAME_BOT_ID = '493316754689359874';
const COOLDOWN_DEBUG_CHANNEL_ID = '1307628841799254026';

const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;
const MOB_KILLED_MESSAGE_REGEX = /You killed the \*\*(.*?)\*\*!/i;
const MOB_ESCAPED_MESSAGE_REGEX = /The \*\*(.*?)\*\* has escaped!/i;

async function sendDebugMessage(client, messageContent) {
    const debugChannel = client.channels.cache.get(COOLDOWN_DEBUG_CHANNEL_ID);
    if (debugChannel && debugChannel.isTextBased()) {
        try {
            await debugChannel.send(`**MobDetect Debug:** ${messageContent}`);
            console.log(`[MobDetect Debug] Sent debug message to #${debugChannel.name}`);
        } catch (error) {
            console.error(`[MobDetect Debug] Failed to send debug message to channel #${debugChannel.name}:`, error);
        }
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.author.id !== TARGET_GAME_BOT_ID) {
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
                try {
                    const channelConfigSnap = await getDoc(channelConfigDocRef);
                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {
                        await setDoc(channelConfigDocRef, {
                            originalChannelName: oldChannelName
                        }, { merge: true });
                        console.log(`[MobDetect Debug] Saved original name '${oldChannelName}' for channel '${channelId}' to Firestore.`);
                        await sendDebugMessage(client, `Enemy spawned (${mobName}) in channel <#${channelId}>. Saved original name \`${oldChannelName}\` to Firestore.`);
                    } else {
                        console.log(`[MobDetect Debug] Original name already exists for channel '${channelId}'. Not overwriting.`);
                        await sendDebugMessage(client, `Enemy spawned (${mobName}) in channel <#${channelId}>. Original name already exists in Firestore: \`${channelConfigSnap.data().originalChannelName}\`.`);
                    }
                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);
                    console.log(`[MobDetect Debug] Channel rename successful from '${oldChannelName}' to '${newName}' for channel '${channelId}'.`);
                    await sendDebugMessage(client, `Channel name changed successfully: \`${oldChannelName}\` -> \`${newName}\` (<#${channelId}>).`);
                } catch (error) {
                    if (error.code === 50013) {
                        console.error(`MobDetect: Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
                        await sendDebugMessage(client, `❌ Failed to rename channel \`${oldChannelName}\` to \`${newName}\` (<#${channelId}>). Bot lacks **Manage Channels** permission.`);
                    } else {
                        console.error(`MobDetect: Failed to rename channel ${oldChannelName}:`, error);
                        await sendDebugMessage(client, `❌ Failed to rename channel \`${oldChannelName}\` to \`${newName}\` (<#${channelId}>) due to an error: \`\`\`${error.message}\`\`\``);
                    }
                }
            }
        }

        // --- Detect Mob Killed or Escaped ---
        const mobKilledMatch = message.content.match(MOB_KILLED_MESSAGE_REGEX);
        const mobEscapedMatch = message.content.match(MOB_ESCAPED_MESSAGE_REGEX);

        if (mobKilledMatch || mobEscapedMatch) {
            const mobName = mobKilledMatch ? mobKilledMatch[1] : mobEscapedMatch[1];
            const eventType = mobKilledMatch ? 'killed' : 'escaped';
            console.log(`[MobDetect Debug] Detected mob ${eventType}: ${mobName} in #${message.channel.name}.`);

            let stickyMessageRemoved = false;
            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
                stickyMessageRemoved = true;
            } catch (error) {
                console.error(`MobDetect: Error removing solo sticky message for channel ${message.channel.id}:`, error);
            }

            let revertSuccess = false;
            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists()) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        const oldChannelName = message.channel.name;
                        await message.channel.setName(originalChannelName, `Automated revert: mob ${eventType}.`);
                        revertSuccess = true;
                        console.log(`[MobDetect Debug] Channel revert successful from '${oldChannelName}' to '${originalChannelName}' for channel '${channelId}'.`);
                    } else {
                        console.log(`[MobDetect Debug] Channel #${message.channel.name} is already at its original name.`);
                    }
                } else {
                    console.warn(`[MobDetect] No original channel name found in Firestore for #${message.channel.name}. Skipping revert.`);
                }
            } catch (error) {
                console.error(`MobDetect: Error reverting channel name for #${message.channel.id}:`, error);
                if (error.code === 50013) {
                     await sendDebugMessage(client, `❌ Failed to revert channel name (<#${channelId}>). Bot lacks **Manage Channels** permission.`);
                }
            }

            await sendDebugMessage(client, 
                `Mob ${eventType} (${mobName}) in channel <#${channelId}>.
- Sticky message removed: ${stickyMessageRemoved ? '✅' : '❌'}
- Channel reverted: ${revertSuccess ? '✅' : '❌'}`
            );
        }
    },
};
