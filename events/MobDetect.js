const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

const TARGET_GAME_BOT_ID = '493316754689359874';

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
                try {
                    // Check if original name already exists to avoid overwriting
                    const channelConfigSnap = await getDoc(channelConfigDocRef);
                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {
                         // Save the current name as the original name if it doesn't exist
                        await setDoc(channelConfigDocRef, {
                            originalChannelName: message.channel.name
                        }, { merge: true });
                    }
                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);
                } catch (error) {
                    if (error.code === 50013) {
                        console.error(`MobDetect: Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
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
            
            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
            } catch (error) {
                console.error(`MobDetect: Error removing solo sticky message for channel ${message.channel.id}:`, error);
            }

            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists()) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        await message.channel.setName(originalChannelName, `Automated revert: mob ${eventType}.`);
                    }
                }
            } catch (error) {
                console.error(`MobDetect: Error reverting channel name for #${message.channel.id}:`, error);
            }
        }
    },
};
