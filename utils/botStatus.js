/**
 * Updates the bot's Discord status based on provided statistics.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 */
function updateBotPresence(client, stats) {
    // Ensure stats object has the necessary properties
    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size; // Get the number of guilds the bot is in

    const statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;

    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' }); // 'PLAYING' is a common type
        console.log(`Bot Status: Updated presence to: "${statusText}"`);
    } else {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
    }
}

module.exports = {
    updateBotPresence
};
