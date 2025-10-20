const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager');
const statsTracker = require('../utils/statsTracker'); // Imported Stats Tracker

// --- Configuration ---
const TARGET_GAME_BOT_IDS = ['493316754689359874'];
const BOT_ID = '1393708735104422040';

// Regex to detect mob spawn messages
// Matches the exact ping message, verifying the spawn event occurred (used only for rename reason).
const MOB_MESSAGE_REGEX = /^<@&\d+>, An enemy has spawned\.\.\.$/i;

// --- Target Categories ---
// Messages will ONLY be processed if they originate from a channel within one of these categories.
const TARGET_CATEGORY_IDS = [
    '1192414248299675663', 
    '1319717698380501033'
];

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
        
        // --- CATEGORY FILTERING IMPLEMENTATION ---
        const channel = message.channel;
        const parentCategoryId = channel.parent ? channel.parent.id : null;
        
        // If the channel is not in an approved category, stop execution immediately.
        if (!parentCategoryId || !TARGET_CATEGORY_IDS.includes(parentCategoryId)) {
            return;
        }
        // --- END CATEGORY FILTERING ---


        const guildId = message.guild.id;
        const channelId = message.channel.id;
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelConfigDocRef = doc(guildChannelsRef, channelId);
        const embed = message.embeds.length > 0 ? message.embeds[0] : null;


        // --- Channel Renaming Logic ---
        let newName = null;
        let renameReason = null;
        let mobName = null;

        // 1. Check for the spawn ping message (used only to qualify the rename reason).
        const mobSpawnMatch = message.content.match(MOB_MESSAGE_REGEX);
        
        // 2. ** Trigger rename if any message from the target bot has a mob name in its embed title. **
        if (embed && embed.title) {
            const embedMobName = embed.title;
            const targetName = getTargetChannelName(embedMobName);
            
            // If a target channel name is found based on the embed title, we proceed to rename.
            if (targetName) {
                newName = targetName;
                mobName = embedMobName; // Use the full title for logging
                
                // Set rename reason based on whether the message was the initial spawn ping or a subsequent embed.
                renameReason = mobSpawnMatch
                    ? 'Automated rename due to spawn ping and enemy embed title.'
                    : 'Automated rename due to enemy embed title.'; 
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
                
                // Increment stats for a successful detection/rename
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
        
        // 1. Condition for Death/Kill
        const deathRevertCondition = message.content.includes('DIED!');
        
        // 2. Condition for Mob Escaped/Left (Embed Title ending in 'left...' AND Description is 'Nobody defeated the mob!')
        // Alternative Escape Revert Condition (more lenient on whitespace)
        const escapeRevertCondition = (
            embed &&
            embed.description &&
            /Nobody\s+defeated\s+the\s+mob!/i.test(embed.description) 
        );
        
        // 3. NEW: Condition for 'No Enemies Spawned Here' message (Updated to include ❌ emoji)
        const noEnemiesRevertCondition = message.content.trim().startsWith('❌ There are no enemies spawned here,');
        
        // Combined revert condition
        const revertCondition = deathRevertCondition || escapeRevertCondition || noEnemiesRevertCondition;

        if (revertCondition) {
            try {
                // Fetch the config to get the original name
                const channelConfigSnap = await getDoc(channelConfigDocRef);
                if (channelConfigSnap.exists() && channelConfigSnap.data().originalChannelName) {
                    const originalChannelName = channelConfigSnap.data().originalChannelName;
                    
                    if (message.channel.name !== originalChannelName) {
                        // Determine the revert reason
                        let revertReason;
                        if (deathRevertCondition) {
                            revertReason = 'Automated revert: Mob DIED!';
                        } else if (escapeRevertCondition) {
                            revertReason = 'Automated revert: Mob left (Nobody defeated the mob!).';
                        } else { 
                            revertReason = 'Automated revert: No enemies are currently spawned here.';
                        }

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
