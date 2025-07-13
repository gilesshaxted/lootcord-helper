// This event listener will listen for messageCreate events
// It handles mob spawn/death detection and channel renaming/role pings.

const { collection, getDocs, doc, setDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

// Role IDs for specific enemy spawns
const ROLE_IDS = {
    HEAVY_SCIENTIST: '1302995091128057930',
    PATROL_HELICOPTER: '1302994990166835251',
    BRADLEY_APC: '1192414247196573753',
};

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) { // Added APP_ID_FOR_FIRESTORE
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        if (!message.guild) return;

        if (!isFirestoreReady) {
            console.warn('Firestore not ready for messageCreate event. Skipping processing.');
            return;
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelDocs = await getDocs(guildChannelsRef);
        const storedChannels = {};
        channelDocs.forEach(d => {
            storedChannels[d.id] = d.data();
        });

        if (!storedChannels[channelId]) {
            return;
        }

        const currentChannelData = storedChannels[channelId];
        const originalChannelName = currentChannelData.originalChannelName;

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
                    console.log(`Pinged role ${roleToPingId} for ${embedTitle} in #${message.channel.name}`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for ping
                } catch (error) {
                    console.error(`Failed to ping role ${roleToPingId} in #${message.channel.name}:`, error);
                }
            }
        }


        // --- Channel Renaming Logic (triggered by embed title alone for any message from target bot) ---
        if (message.embeds.length > 0) {
            const embedTitle = message.embeds[0].title;
            let newName = null;

            if (embedTitle) {
                if (embedTitle.includes('Heavy Scientist')) {
                    newName = '🐻╏heavy';
                } else if (embedTitle.includes('Scientist')) {
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
                    console.log(`Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for rename
                } catch (error) {
                    console.error(`Failed to rename channel ${message.channel.name}:`, error);
                }
                return;
            }
        }

        // --- Logic for Reverting to original name (updated conditions) ---
        if (message.embeds.length > 0 || message.content) {
            const embed = message.embeds.length > 0 ? message.embeds[0] : null;

            const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
            const embedDescriptionRevert = embed && embed.description && embed.description.includes('killed a mob');
            const contentDiedRevert = message.content.includes(':deth: The **') && message.content.includes('DIED!**');

            const revertCondition = embedTitleRevert || embedDescriptionRevert || contentDiedRevert;

            if (revertCondition) {
                if (originalChannelName && message.channel.name !== originalChannelName) {
                    try {
                        await message.channel.setName(originalChannelName, 'Automated revert to original name.');
                        console.log(`Reverted channel ${message.channel.name} to ${originalChannelName} in guild ${message.guild.name}`);
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for revert
                    } catch (error) {
                        console.error(`Failed to revert channel ${message.channel.name} to original name:`, error);
                    }
                }
            }
        }
    },
};
