// Import necessary Firestore functions
const { collection, getDocs, doc, setDoc } = require('firebase/firestore');

// Configuration specific to this event listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, and isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady) { // db and isFirestoreReady are passed but not used by this specific listener
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
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelDocs = await getDocs(guildChannelsRef);
        const storedChannels = {};
        channelDocs.forEach(d => {
            storedChannels[d.id] = d.data();
        });

        // Check if the current channel is one of the stored channels
        if (!storedChannels[channelId]) {
            return; // Not a configured channel, ignore
        }

        const currentChannelData = storedChannels[channelId];
        const originalChannelName = currentChannelData.originalChannelName;

        // --- Logic for Renaming (now triggered by embed title alone) ---
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
                    console.log(`Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                } catch (error) {
                    console.error(`Failed to rename channel ${message.channel.name}:`, error);
                }
                // Important: If a rename occurs, we don't want to immediately check for revert conditions
                // in the same message. The revert will happen on a subsequent message.
                return;
            }
        }

        // --- Logic for Reverting to original name (same conditions) ---
        // This block will only execute if the channel was NOT renamed in the current message.
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
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
