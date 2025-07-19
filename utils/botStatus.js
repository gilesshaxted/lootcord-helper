const { ActivityType } = require('discord.js');
// Removed Firestore imports as this file is now purely for Discord presence updates,
// not for listening to Firestore directly. Firestore data is passed to it.
// const { doc, collection, onSnapshot, setDoc } = require('firebase/firestore');
// const statsTracker = require('./statsTracker'); // statsTracker data is passed to it.

// Internal variable to cache the bot's currently set Discord presence text
let _currentDiscordPresenceText = null;
let _currentDiscordActivityType = ActivityType.Playing; // Default activity type

/**
 * Updates the bot's actual Discord presence based on a determined status text and type.
 * This function is internal to this module.
 * @param {Client} client The Discord client instance.
 * @param {string} statusText The text to set as the bot's status.
 * @param {string} activityType The activity type (e.g., 'PLAYING', 'WATCHING').
 */
function _setDiscordPresence(client, statusText, activityType) {
    if (!client.user) {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
        return;
    }

    // Ensure activityType is a valid Discord ActivityType enum value
    const finalActivityType = ActivityType[activityType] ?? ActivityType.Playing;

    if (_currentDiscordPresenceText === statusText && _currentDiscordActivityType === finalActivityType) {
        // console.log(`Bot Status: Presence already set to "${statusText}" [${ActivityType[finalActivityType]}]. Skipping redundant API call.`);
        return; // Avoid redundant API calls if status hasn't changed
    }

    try {
        client.user.setActivity(statusText, { type: finalActivityType });
        _currentDiscordPresenceText = statusText;
        _currentDiscordActivityType = finalActivityType;
        console.log(`Bot Status: Discord presence updated to: "${statusText}" [${ActivityType[finalActivityType]}]`);
    } catch (error) {
        console.error('Bot Status: Failed to set Discord presence:', error);
    }
}

/**
 * Determines the desired bot presence status (from provided stats)
 * and updates the Discord presence if it's different.
 * This function is called by index.js based on Firestore updates or intervals.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 */
function updateBotPresence(client, stats) { // Renamed from updateBotPresenceFromFirestore
    // This function no longer fetches from Firestore directly.
    // It assumes `stats` object is already up-to-date from statsTracker.

    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size; // Get number of servers directly from client

    const desiredStatusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
    const desiredActivityType = ActivityType.Playing; // Dynamic status is always PLAYING

    _setDiscordPresence(client, desiredStatusText, desiredActivityType);
}

module.exports = {
    updateBotPresence, // Export the main function for index.js to use
};
