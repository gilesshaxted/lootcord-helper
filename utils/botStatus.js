const statsTracker = require('./statsTracker'); // Import statsTracker to get current stats

/**
 * Updates the bot's Discord status based on current in-memory stats.
 * @param {Client} client The Discord client instance.
 */
function updateBotStatus(client) {
    const stats = statsTracker.getBotStats();
    const statusText = `Helped ${stats.uniqueActiveUsers} players ${stats.totalHelps} times in ${client.guilds.cache.size} servers`;
    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' });
        console.log(`Bot status updated to: "${statusText}"`);
    } else {
        console.warn('Cannot set bot status: client.user is not available.');
    }
}

module.exports = {
    updateBotStatus
};
