const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');
const statsTracker = require('../utils/statsTracker'); // Imported Stats Tracker

// --- Configuration ---
const TARGET_GAME_BOT_IDS = ['493316754689359874'];
const BOT_ID = '1393708735104422040';

// Regex to detect mob spawn messages
const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;

/**
 * Determines the target channel name based on a mob name.
 * @param {string} mobName The name of the mob detected.
 * @returns {string|null} The new channel name, or null if no match.
 */
function getTargetChannelName(mobName) {
    if (!mobName) return null;
    mobName = mobName.toLowerCase();

    if (mobName.includes('heavy scientist')) {
        return '🐻╏heavy';
    } else if (mobName.includes('scientist')) { // Check Scientist after Heavy Scientist
        return '🥼╏scientist';
    } else if (mobName.includes('tunnel dweller')) {
        return '🧟╏dweller';
    } else if (mobName.includes('patrol helicopter')) {
        return '🚁╏heli';
    } else if (mobName.includes('bradley apc')) {
        return '🚨╏brad';
    } else if (mobName.includes('mummy')) {
        return '🎃╏Mummy'; 
    } else if (mobName.includes('scarecrow')) {
        return '🎃╏Scarecrow';
    }
    return null;
}

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
        const embed = message.embeds.length > 0 ? message.embeds[0] : null;


        // --- Channel Renaming Logic ---
        let newName = null;
        let renameReason = null;
        let mobName = null;

        // 1. ** Comment: When an enemy spawns (message content) (rename to mob name). **
        const mobSpawnMatch = message.content.match(MOB_MESSAGE_REGEX);
        if (mobSpawnMatch) {
            mobName = mobSpawnMatch[1];
            newName = getTargetChannelName(mobName);
            renameReason = `Automated rename due to mob spawn: ${mobName}.`;
        } 
        
        // 2. ** Comment: When an enemy is detected (embed title) (rename to mob name). **
        // This handles cases where the notification is an embed rather than a raw spawn message, 
        // which was the logic moved from the unscramble listener.
        if (!newName && embed && embed.title) {
            const embedMobName = embed.title;
            const targetName = getTargetChannelName(embedMobName);
            
            // Check if the target name is one of the specific mob names from the embed title logic
            // (e.g., Heavy Scientist, Scientist, Tunnel Dweller, etc.)
            if (targetName) {
                newName = targetName;
                mobName = embedMobName; // Use the full title for logging
                renameReason = 'Automated rename due to enemy embed title.';
            }
        }
        
        // Execute Channel Rename (if needed)
        if (newName && message.channel.name !== newName) {
            const oldChannelName = message.channel.name;
            try {
                // Ensure the original name is saved before renaming
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {
                    await setDoc(channelConfigDocRef, {
                        originalChannelName: oldChannelName
                    }, { merge: true });
                }

                await message.channel.setName(newName, renameReason);
                console.log(`MobDetect: Renamed channel ${oldChannelName} to ${newName} in guild ${message.guild.name}`);
                
                // Increment stats for a successful detection/rename (moved from old unscramble listener)
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); 

            } catch (error) {
                if (error.code === 50013) {
                    console.error(`[MobDetect] Failed to rename channel. Bot lacks 'Manage Channels' permission in <#${channelId}>.`);
                } else {
                    console.error(`[MobDetect] Failed to rename channel. Unexpected error:`, error);
                }
            }
            return; // Exit here if a rename occurred due to a new mob (spawn or embed)
        }


        // --- Detect Mob Killed or Escaped (Channel Revert Logic) ---
        const deathRevertCondition = message.content.includes('DIED!');
        // 3. ** Comment: When an enemy leaves (escaped! or left...). **
        const escapeRevertCondition = message.content.includes('escaped!') || (embed && embed.title && embed.title.includes('left...'));
        
        // 3. ** Comment: When an enemy is killed (DIED!). **
        const revertCondition = deathRevertCondition || escapeRevertCondition;

        if (revertCondition) {
            try {
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    
                    if (message.channel.name !== originalChannelName) {
                        const revertReason = deathRevertCondition 
                            ? 'Automated revert: Mob DIED!' 
                            : 'Automated revert: Mob escaped/left.';

                        await message.channel.setName(originalChannelName, revertReason);
                        console.log(`MobDetect: Reverted channel ${message.channel.name} to ${originalChannelName}`);
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
