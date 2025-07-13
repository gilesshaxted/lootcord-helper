// Import necessary Firestore functions
const { collection, getDocs, doc, setDoc } = require('firebase/firestore');

// Configuration specific to this event listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

module.exports = {
    name: 'messageCreate', // The name of the Discord event
    once: false, // Whether this event should only run once
    // The execute function receives the message object, plus db, client, and isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady) {
        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return; // Ignore messages from this bot itself

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Firestore not ready for messageCreate event. Skipping processing.');
            return;
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        // Fetch stored channels for this guild from Firestore
        // This is done on each relevant message for simplicity, but can be optimized with caching.
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelDocs = await getDocs(guildChannelsRef);
        const storedChannels = {};
        channelDocs.forEach(d => { // Renamed doc to d to avoid conflict with imported doc function
            storedChannels[d.id] = d.data();
        });

        // Check if the current channel is one of the stored channels
        if (!storedChannels[channelId]) {
            return; // Not a configured channel, ignore
        }

        const currentChannelData = storedChannels[channelId];
        const originalChannelName = currentChannelData.originalChannelName;

        // --- Logic for 'An enemy has spawned...' (Rename based on embed title) ---
        if (message.content.includes('An enemy has spawned...') && message.embeds.length > 0) {
            const embedTitle = message.embeds[0].title;
            let newName = null;

            if (embedTitle && embedTitle.includes('Scientist')) { // Covers both 'Scientist' and 'Heavy Scientist'
                if (embedTitle.includes('Heavy Scientist')) {
                    newName = '🐻╏heavy';
                } else {
                    newName = '🥼╏scientist';
                }
            } else if (embedTitle && embedTitle.includes('Tunnel Dweller')) {
                newName = '🧟╏dweller';
            } else if (embedTitle && embedTitle.includes('Patrol Helicopter')) {
                newName = '🚁╏heli';
            } else if (embedTitle && embedTitle.includes('Bradley APC')) {
                newName = '🚨╏brad';
            }

            if (newName && message.channel.name !== newName) {
                try {
                    await message.channel.setName(newName, 'Automated rename due to enemy spawn.');
                    console.log(`Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                } catch (error) {
                    console.error(`Failed to rename channel ${message.channel.name}:`, error);
                }
            }
            return; // Processed spawn message, exit
        }

        // --- Logic for 'left...' or 'killed a mob' (Revert to original name) ---
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            // Check both title and description for revert conditions
            const revertCondition = (embed.title && embed.title.includes('left...')) || (embed.description && embed.description.includes('killed a mob'));

            if (revertCondition) {
                if (originalChannelName && message.channel.name !== originalChannelName) {
                    try {
                        await message.channel.setName(originalChannelName, 'Automated revert to original name.');
                        console.log(`Reverted channel ${message.channel.name} to ${originalChannelName} in guild ${message.guild.name}`);
                    } catch (error) {
                        console.error(`Failed to revert channel ${message.channel.name} to original name:`, error);
                    }
                }
            }
        }
    },
};
