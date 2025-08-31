const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

const TARGET_GAME_BOT_ID = '493316754689359874';
const NOTIFICATION_CHANNEL_ID = '1329235188907114506';

const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;
const MOB_KILLED_MESSAGE_REGEX = /You killed the \*\*(.*?)\*\*!/i;
const MOB_ESCAPED_MESSAGE_REGEX = /The \*\*(.*?)\*\* has escaped!/i;

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

        console.log(`[MobDetect - Debug] Message received from game bot in #${message.channel.name}: ${message.content}`);

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
                try {
                    // Always save the current name as the original name before renaming
                    await setDoc(channelConfigDocRef, {
                        originalChannelName: message.channel.name
                    }, { merge: true });
                    
                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);
                    console.log(`[MobDetect] Renamed channel ${message.channel.name} to ${newName} and saved original name.`);
                } catch (error) {
                    console.error(`[MobDetect] Failed to rename channel ${message.channel.name}:`, error);
                    if (error.code === 50013) {
                        console.error(`[MobDetect] Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
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
            console.log(`[MobDetect] Detected mob ${eventType}: ${mobName} in #${message.channel.name}. Attempting to remove solo sticky message and revert channel name.`);
            
            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
                console.log(`[MobDetect] Successfully removed solo sticky message for channel ${message.channel.id}.`);
            } catch (error) {
                console.error(`[MobDetect] Error removing solo sticky message for channel ${message.channel.id}:`, error);
            }

            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists()) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        await message.channel.setName(originalChannelName, `Automated revert: mob ${eventType}.`);
                        console.log(`[MobDetect] Successfully reverted channel #${message.channel.name} to #${originalChannelName}.`);
                    } else {
                        console.log(`[MobDetect] Channel #${message.channel.name} is already at its original name.`);
                    }
                } else {
                    console.warn(`[MobDetect] No original channel name found in Firestore for #${message.channel.name}. Skipping revert.`);
                }
            } catch (error) {
                console.error(`[MobDetect] Error reverting channel name for #${message.channel.name}:`, error);
            }
        }
    },
};
