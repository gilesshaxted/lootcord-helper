const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');

// --- Configuration ---
const TARGET_GAME_BOT_IDS = ['493316754689359874'];
const BOT_ID = '1393708735104422040';

// Regex to detect mob spawn messages
const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from this bot or from a non-target bot.
        if (message.author.id === BOT_ID || !TARGET_GAME_BOT_IDS.includes(message.author.id)) {
            return;
        }
        
        if (!isFirestoreReady) {
            console.warn(`[MobDetect] Firestore is not ready. Skipping message processing for mob events.`);
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
            } else if (mobName.includes('Mummy')) {
                newName = '🎃 ╏Mummy';
            } else if (mobName.includes('Scarecrow')) {
                newName = '🎃 ╏Scarecrow';
            }
            if (newName && message.channel.name !== newName) {
                const oldChannelName = message.channel.name;
                try {
                    const channelConfigSnap = await getDoc(channelConfigDocRef);
                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {
                        await setDoc(channelConfigDocRef, {
                            originalChannelName: oldChannelName
                        }, { merge: true });
                    }

                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);
                } catch (error) {
                    if (error.code === 50013) {
                        console.error(`[MobDetect] Failed to rename channel. Bot lacks 'Manage Channels' permission in <#${channelId}>.`);
                    } else {
                        console.error(`[MobDetect] Failed to rename channel. Unexpected error:`, error);
                    }
                }
            }
        }

        // --- Detect Mob Killed or Escaped ---
        const embed = message.embeds.length > 0 ? message.embeds[0] : null;
        const deathRevertCondition = message.content.includes('DIED!');
        const escapeRevertCondition = message.content.includes('escaped!') || (embed && embed.title && embed.title.includes('left...'));
        const revertCondition = deathRevertCondition || escapeRevertCondition;

        if (revertCondition) {
            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    if (message.channel.name !== originalChannelName) {
                        await message.channel.setName(originalChannelName, `Automated revert to original name.`);
                    }
                }
            } catch (error) {
                if (error.code === 50013) {
                    console.error(`[MobDetect] Failed to revert channel name. Bot lacks 'Manage Channels' permission.`);
                } else {
                    console.error(`[MobDetect] Failed to revert channel name. Unexpected error:`, error);
                }
            }
            
            try {
                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);
            } catch (error) {
                console.error(`[MobDetect] Failed to remove sticky message. Unexpected error:`, error);
            }
        }
    },
};
