const { doc, collection, getDoc } = require('firebase/firestore'); // Import Firestore functions

/**
 * Updates the bot's Discord status.
 * If custom text is provided, it uses that. Otherwise, it fetches dynamic stats from Firestore.
 * This utility is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} [options] Optional parameters for status.
 * @param {string} [options.customText] Custom text to set as status. If not provided, dynamic stats are used.
 * @param {string} [options.activityType] Activity type (e.g., 'PLAYING', 'WATCHING'). Defaults to 'PLAYING'.
 * @param {object} [options.db] The Firestore database instance (required if customText is not provided).
 * @param {string} [options.appId] The application ID for Firestore path (required if customText is not provided).
 */
async function updateBotPresence(client, options = {}) {
    const { customText, activityType = 'PLAYING', db, appId } = options;

    // Ensure client.user is available before proceeding
    if (!client.user || !client.user.id) {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available or not ready.');
        return;
    }

    let statusText = '';
    let chosenActivityType = activityType; // Use provided activityType or default to PLAYING
    const totalServers = client.guilds.cache.size; // Get total servers directly here, always available

    if (customText) {
        statusText = customText;
        console.log(`Bot Status: Using custom status: "${statusText}"`);
    } else {
        // Fetch dynamic stats from Firestore
        if (!db || !appId) {
            console.error('Bot Status: Cannot fetch dynamic stats: Firestore DB or App ID not provided to updateBotPresence.');
            statusText = 'Error fetching stats'; // Fallback status
            chosenActivityType = 'PLAYING';
        } else {
            const statsDocRef = doc(collection(db, `artifacts/${appId}/public/data/stats`), 'botStats');
            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                // totalServers is already determined above

                statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
                console.log(`Bot Status: Using dynamic stats: "${statusText}"`);
            } catch (error) {
                console.error('Bot Status: Error fetching stats from Firestore for dynamic status:', error);
                statusText = 'Error fetching stats'; // Fallback status
                chosenActivityType = 'PLAYING';
            }
        }
    }

    if (statusText.length > 128) {
        console.warn(`Bot Status: Generated status text exceeds 128 character limit. Truncating: "${statusText}"`);
        statusText = statusText.substring(0, 128);
    }

    try {
        // Introduce a small delay before setting presence to avoid rapid updates/throttling
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        client.user.setActivity(statusText, { type: chosenActivityType });
        console.log(`Bot Status: Discord presence updated to: "${statusText}" (Type: ${chosenActivityType})`);

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
