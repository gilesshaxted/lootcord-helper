const { ActivityType } = require('discord.js'); // Import ActivityType

// In-memory variable to hold the currently set custom status
let currentCustomStatus = null;
let currentCustomActivityType = ActivityType.Playing; // Default activity type for custom status

/**
 * Updates the bot's Discord status based on provided statistics or a custom status.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 */
function updateBotPresence(client, stats) {
    // If a custom status is set, use it.
    if (currentCustomStatus !== null) {
        if (client.user) {
            client.user.setActivity(currentCustomStatus, { type: currentCustomActivityType });
            console.log(`Bot Status: Updated presence to custom: "${currentCustomStatus}" (Type: ${ActivityType[currentCustomActivityType]})`);
        } else {
            console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
        }
        return; // Don't proceed with dynamic status if custom is set
    }

    // If no custom status, use dynamic stats-based status
    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size;

    const statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;

    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' }); // 'PLAYING' is a common type
        console.log(`Bot Status: Updated presence to dynamic: "${statusText}"`);
    } else {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
    }
}

/**
 * Sets a custom status for the bot. This will override the dynamic stats-based status.
 * @param {Client} client The Discord client instance.
 * @param {string} text The custom status text.
 * @param {string} type The activity type (e.g., 'PLAYING', 'WATCHING').
 */
function setCustomBotStatus(client, text, type = 'PLAYING') {
    currentCustomStatus = text;
    currentCustomActivityType = ActivityType[type] ?? ActivityType.Playing; // Ensure valid ActivityType

    // Immediately update presence with the new custom status
    updateBotPresence(client, {}); // Pass empty stats as they are not relevant for custom status
    console.log(`Bot Status: Custom status set to: "${text}" (Type: ${type})`);
}

/**
 * Clears any custom status, reverting to the dynamic stats-based status.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The current statistics object.
 */
function clearCustomBotStatus(client, stats) {
    currentCustomStatus = null;
    currentCustomActivityType = ActivityType.Playing;
    updateBotPresence(client, stats); // Revert to dynamic status
    console.log('Bot Status: Custom status cleared, reverting to dynamic status.');
}

module.exports = {
    updateBotPresence,
    setCustomBotStatus,
    clearCustomBotStatus
};
