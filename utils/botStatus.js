/**
 * Updates the bot's Discord status based on provided statistics.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} stats The statistics object (e.g., from statsTracker.getBotStats()).
 */
async function updateBotPresence(client, stats) {
    // Ensure client.user is available before proceeding
    if (!client.user || !client.user.id) {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available or not ready.');
        return;
    }

    const totalHelps = stats.totalHelps ?? 0;
    const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
    const totalServers = client.guilds.cache.size;

    const statusText = `help ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;

    try {
        // Introduce a small delay before setting presence to avoid rapid updates/throttling
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        client.user.setActivity(statusText, { type: 'PLAYING' });
        console.log(`Bot Status: Discord presence updated to: "${statusText}"`);

        const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Your designated channel ID
        const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);

        if (notificationChannel && notificationChannel.isTextBased()) {
            await notificationChannel.send(`Bot Status: I have just updated my status to: \`${statusText}\``);
            console.log(`Bot Status: Sent status update notification to #${notificationChannel.name}.`);
        } else {
            console.warn(`Bot Status: Notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
        }
    } catch (error) {
        console.error(`Bot Status: Failed to set presence or send notification:`, error);
    }
}

module.exports = {
    updateBotPresence
};
