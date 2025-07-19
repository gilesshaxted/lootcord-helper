/**
 * Updates the bot's Discord status based on provided statistics.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 * @param {string} [activityType='PLAYING'] Optional activity type ('PLAYING', 'WATCHING', etc.)
 */
function updateBotPresence(client, stats, activityType = 'PLAYING') {
    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size;

    let statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;

    if (statusText.length > 128) {
        console.warn('Bot Status: Status text is too long. Trimming to 128 characters.');
        statusText = statusText.slice(0, 128);
    }

    try {
        if (client.user) {
            client.user.setActivity(statusText, { type: activityType });
            console.log(`Bot Status: Updated presence to: "${statusText}"`);
        } else {
            console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
        }
    } catch (err) {
        console.error('Bot Status: Error setting activity:', err);
    }
}

module.exports = {
    updateBotPresence
};
