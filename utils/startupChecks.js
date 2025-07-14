const { collection, getDocs, doc } = require('firebase/firestore'); // Import doc
const { ChannelType } = require('discord.js'); // Import ChannelType

// Configuration for the game bot ID (consistent with MobDetect)
const TARGET_GAME_BOT_ID = '493316754689359874';

/**
 * Function to check and rename channels on bot startup (Downtime Recovery).
 * @param {object} db The Firestore database instance.
 * @param {boolean} isFirestoreReady Flag indicating Firestore readiness.
 * @param {Client} client The Discord client instance.
 */
async function checkAndRenameChannelsOnStartup(db, isFirestoreReady, client) {
    if (!db || !isFirestoreReady || !client.isReady()) {
        console.warn('Startup Channel Check: Firestore or Client not ready. Skipping startup check.');
        return;
    }

    console.log('Startup Channel Check: Initiating channel status check after bot restart...');

    // Get all guilds the bot is in
    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);

        try {
            const channelDocs = await getDocs(guildChannelsRef);
            if (channelDocs.empty) {
                console.log(`Startup Channel Check: No configured channels for guild ${guild.name}.`);
                continue;
            }

            for (const docSnap of channelDocs.docs) {
                const channelData = docSnap.data();
                const channelId = channelData.channelId;
                const originalChannelName = channelData.originalChannelName;

                const channel = guild.channels.cache.get(channelId);
                if (!channel || channel.type !== ChannelType.GuildText) {
                    console.warn(`Startup Channel Check: Configured channel ${channelId} not found or not a text channel in guild ${guild.name}. Skipping.`);
                    continue;
                }

                // Fetch the last message in the channel
                const messages = await channel.messages.fetch({ limit: 1 });
                const lastMessage = messages.first();

                if (!lastMessage || lastMessage.author.id !== TARGET_GAME_BOT_ID || lastMessage.embeds.length === 0) {
                    // If no relevant last message, revert to original name if current name is not original
                    if (channel.name !== originalChannelName) {
                        try {
                            await channel.setName(originalChannelName, 'Automated revert on startup: no relevant last message found.');
                            console.log(`Startup Channel Check: Reverted ${channel.name} to ${originalChannelName} in ${guild.name}.`);
                        } catch (error) {
                            console.error(`Startup Channel Check: Failed to revert ${channel.name} to ${originalChannelName} on startup:`, error);
                        }
                    }
                    continue; // No relevant message to check for renaming
                }

                const embedTitle = lastMessage.embeds[0].title;
                const messageContent = lastMessage.content;
                let newName = null;

                // Apply renaming logic (similar to MobDetect.js)
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

                // Apply revert logic (similar to MobDetect.js)
                const embed = lastMessage.embeds[0];
                const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
                const embedDescriptionRevert = embed && embed.description && embed.description.includes('killed a mob');
                const contentDiedRevert = messageContent.includes(':deth: The **') && messageContent.includes('DIED!**');
                const revertCondition = embedTitleRevert || embedDescriptionRevert || contentDiedRevert;

                if (revertCondition) {
                    if (channel.name !== originalChannelName) {
                        try {
                            await channel.setName(originalChannelName, 'Automated revert on startup: death/left message detected.');
                            console.log(`Startup Channel Check: Reverted ${channel.name} to ${originalChannelName} in ${guild.name}.`);
                        } catch (error) {
                            console.error(`Startup Channel Check: Failed to revert ${channel.name} to ${originalChannelName} on startup:`, error);
                        }
                    }
                } else if (newName && channel.name !== newName) { // Only rename if a newName is determined and current name is different
                    try {
                        await channel.setName(newName, 'Automated rename on startup: enemy spawn detected.');
                        console.log(`Startup Channel Check: Renamed ${channel.name} to ${newName} in ${guild.name}.`);
                    } catch (error) {
                        console.error(`Startup Channel Check: Failed to rename ${channel.name} to ${newName} on startup:`, error);
                    }
                } else {
                    console.log(`Startup Channel Check: Channel ${channel.name} in ${guild.name} is already correctly named.`);
                }
            }
        } catch (error) {
            console.error(`Startup Channel Check: Error processing guild ${guild.name} (${guild.id}):`, error);
        }
    }
    console.log('Startup Channel Check: Completed channel status check.');
}

module.exports = {
    checkAndRenameChannelsOnStartup
};
