// This event listener will listen for messageCreate events
// It handles mob spawn detection, channel renaming, and triggers sticky message removal on revert.

const { collection, getDocs, doc, setDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker
const { removeStickyMessage } = require('../utils/stickyMessageManager'); // NEW: Import removeStickyMessage

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

// Role IDs for specific enemy spawns
const ROLE_IDS = {
    HEAVY_SCIENTIST: '1302995091128057930',
    PATROL_HELICOPTER: '1302994990166835251',
    BRADLEY_APC: '1192414247196573753',
};

module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('MobDetect: Firestore not ready. Skipping processing.');
            return;
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        // Fetch stored channels for this guild from Firestore
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelDocs = await getDocs(guildChannelsRef);
        const storedChannels = {};
        channelDocs.forEach(d => {
            storedChannels[d.id] = d.data();
        });

        // Check if the current channel is one of the configured channels
        if (!storedChannels[channelId]) {
            // console.log(`[MobDetect - Debug] Channel ${message.channel.name} (${channelId}) is not a configured channel. Ignoring.`); // Too verbose
            return; // Not a configured channel, ignore
        }

        const currentChannelData = storedChannels[channelId];
        const originalChannelName = currentChannelData.originalChannelName;

        console.log(`\n--- [MobDetect - Debug] Processing Message for Channel Renaming/Revert ---`);
        console.log(`Message from: ${message.author.tag} (ID: ${message.author.id})`);
        console.log(`Channel: #${message.channel.name} (ID: ${channelId})`);
        console.log(`Original Stored Name: \`${originalChannelName}\``);
        console.log(`Current Channel Name: \`${message.channel.name}\``);
        console.log(`Message Content: \n\`\`\`\n${message.content || 'N/A'}\n\`\`\``);
        if (message.embeds.length > 0) {
            console.log(`Embed Title: \`${message.embeds[0].title || 'N/A'}\``);
            console.log(`Embed Description: \n\`\`\`\n${message.embeds[0].description || 'N/A'}\n\`\`\``);
        }
        console.log(`--- End MobDetect Message Debug ---\n`);

        // --- Role Pinging Logic (ONLY if 'An enemy has spawned...' is in content) ---
        if (message.content.includes('An enemy has spawned...') && message.embeds.length > 0) {
            const embedTitle = message.embeds[0].title;
            let roleToPingId = null;

            if (embedTitle) {
                if (embedTitle.includes('Heavy Scientist')) {
                    roleToPingId = ROLE_IDS.HEAVY_SCIENTIST;
                } else if (embedTitle.includes('Patrol Helicopter')) {
                    roleToPingId = ROLE_IDS.PATROL_HELICOPTER;
                } else if (embedTitle.includes('Bradley APC')) {
                    roleToPingId = ROLE_IDS.BRADLEY_APC;
                }
            }

            if (roleToPingId) {
                try {
                    await message.channel.send({ content: `<@&${roleToPingId}>` });
                    console.log(`MobDetect: Pinged role ${roleToPingId} for ${embedTitle} in #${message.channel.name}`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                } catch (error) {
                    console.error(`MobDetect: Failed to ping role ${roleToPingId} in #${message.channel.name}:`, error);
                }
            }
        }


        // --- Channel Renaming Logic (triggered by embed title alone for any message from target bot) ---
        let renamedThisTurn = false; // Flag to prevent immediate revert if renamed
        if (message.embeds.length > 0) {
            const embedTitle = message.embeds[0].title;
            let newName = null;

            if (embedTitle) { // Ensure embedTitle exists
                if (embedTitle.includes('Heavy Scientist')) {
                    newName = '🐻╏heavy';
                } else if (embedTitle.includes('Scientist')) { // Check Scientist after Heavy Scientist
                    newName = '🥼╏scientist';
                } else if (embedTitle.includes('Tunnel Dweller')) {
                    newName = '🧟╏dweller';
                } else if (embedTitle.includes('Patrol Helicopter')) {
                    newName = '🚁╏heli';
                } else if (embedTitle.includes('Bradley APC')) {
                    newName = '🚨╏brad';
                }
            }

            if (newName && message.channel.name !== newName) {
                try {
                    await message.channel.setName(newName, 'Automated rename due to enemy embed title.');
                    console.log(`MobDetect: Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                    renamedThisTurn = true;
                } catch (error) {
                    console.error(`MobDetect: Failed to rename channel ${message.channel.name}:`, error);
                    if (error.code === 50013) { // Missing Permissions
                        console.error(`MobDetect: Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
                    }
                }
            }
        }

        // --- Logic for Reverting to original name (triggered by Mob Kill/Leave) ---
        // This block will execute if a revert condition is met.
        if (message.embeds.length > 0 || message.content) { // Check if there's content or embed to analyze
            const embed = message.embeds.length > 0 ? message.embeds[0] : null;

            // Condition 1: Embed title includes 'left...'
            const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
            
            // Condition 2: Message content contains ":deth:" and "DIED!"
            const contentDiedRevert = message.content.includes(':deth:') && message.content.includes('DIED!');
            const embedDescriptionDiedRevert = embed && embed.description && embed.description.includes(':deth:') && embed.description.includes('DIED!');

            const revertCondition = embedTitleRevert || contentDiedRevert || embedDescriptionDiedRevert;

            console.log(`[MobDetect - Debug] Revert Conditions: embedTitleRevert=${embedTitleRevert}, contentDiedRevert=${contentDiedRevert}, embedDescriptionDiedRevert=${embedDescriptionDiedRevert}`);
            
            if (revertCondition) {
                console.log(`[MobDetect - Debug] Revert condition met for channel ${channelId}.`);

                // --- NEW: Always attempt to remove sticky message if revert condition is met ---
                await removeStickyMessage(db, channelId); // Remove solo sticky message

                // Only perform channel rename if it's actually different from original
                if (originalChannelName && message.channel.name !== originalChannelName) {
                    try {
                        await message.channel.setName(originalChannelName, 'Automated revert to original name.');
                        console.log(`MobDetect: Reverted channel ${message.channel.name} to ${originalChannelName} in guild ${message.guild.name}`);
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                    } catch (error) {
                        console.error(`MobDetect: Failed to revert channel ${message.channel.name} to original name:`, error);
                        if (error.code === 50013) { // Missing Permissions
                            console.error(`MobDetect: Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
                        }
                    }
                } else {
                    console.log(`[MobDetect - Debug] Revert condition met, but channel name is already original or original name is missing. No channel rename needed.`);
                }
            } else {
                console.log(`[MobDetect - Debug] No revert condition met for this message.`);
            }
        }
    },
};
