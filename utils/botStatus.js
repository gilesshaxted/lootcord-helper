/**
 * Updates the bot's Discord status based on provided statistics.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 */
async function updateBotPresence(client, stats) { // Made async to use await for message.channel.send
    // Ensure stats object has the necessary properties
    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size; // Get the number of guilds the bot is in

    const statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;

    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' }); // 'PLAYING' is a common type
        console.log(`Bot Status: Updated presence to: "${statusText}"`);

        // --- NEW: Post status update to specific channel ---
        const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Your designated channel ID
        const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);

        if (notificationChannel && notificationChannel.isTextBased()) { // Check if channel exists and is a text channel
            try {
                await notificationChannel.send(`Bot Status: I have just updated my status to: \`${statusText}\``);
                console.log(`Bot Status: Sent status update notification to #${notificationChannel.name}.`);
            } catch (error) {
                console.error(`Bot Status: Failed to send status update notification to #${notificationChannel.name}:`, error);
            }
        } else {
            console.warn(`Bot Status: Notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
        }

    } else {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available.');
    }
}

module.exports = {
    updateBotPresence
};
