const { doc, collection, getDoc } = require('firebase/firestore');
const { ActivityType } = require('discord.js'); // Import ActivityType for clarity

let presenceUpdateTimeout = null; // To store the timeout ID

/**
 * Debounces the Discord presence update.
 * This ensures that client.user.setActivity is not called too frequently.
 * @param {Client} client The Discord client instance.
 * @param {string} statusText The text to set as the bot's status.
 * @param {string} activityType The activity type (e.g., 'PLAYING').
 * @param {string} source The source of the update (for logging).
 */
function debounceUpdateActivity(client, statusText, activityType, source) {
    // Clear any existing timeout to prevent previous updates from firing
    if (presenceUpdateTimeout) {
        clearTimeout(presenceUpdateTimeout);
    }

    // Set a new timeout to update presence after a short delay
    presenceUpdateTimeout = setTimeout(async () => {
        if (client.user && client.user.id) {
            try {
                client.user.setActivity(statusText, { type: activityType });
                console.log(`Bot Status: Discord presence updated to: "${statusText}" (Type: ${ActivityType[activityType]}) [Source: ${source}]`);

                const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Your designated channel ID
                const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);

                if (notificationChannel && notificationChannel.isTextBased()) {
                    await notificationChannel.send(`Bot Status: I have just updated my status to: \`${statusText}\``);
                    console.log(`Bot Status: Sent status update notification to #${notificationChannel.name}.`);
                } else {
                    console.warn(`Bot Status: Notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
                }
            } catch (error) {
                console.error(`Bot Status: Failed to set presence or send notification (Source: ${source}):`, error);
            }
        } else {
            console.warn('Bot Status: Cannot set bot presence: client.user is not available or not ready (debounced call).');
        }
        presenceUpdateTimeout = null; // Clear the timeout ID after execution
    }, 2000); // 2-second debounce delay
}


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
 * @param {string} [options.source='Unknown'] The source of the update (e.g., 'Interval', 'Command', 'Firestore Snapshot').
 */
async function updateBotPresence(client, options = {}) {
    const { customText, activityType = 'PLAYING', db, appId, source = 'Unknown' } = options;

    if (!client.user || !client.user.id) {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available or not ready (initial call).');
        return;
    }

    let statusText = '';
    let chosenActivityType = ActivityType[activityType] ?? ActivityType.Playing; // Ensure ActivityType enum value

    if (customText) {
        statusText = customText;
        console.log(`Bot Status: Preparing custom status: "${statusText}" [Source: ${source}]`);
    } else {
        if (!db || !appId) {
            console.error(`Bot Status: Cannot fetch dynamic stats: Firestore DB or App ID not provided to updateBotPresence (Source: ${source}).`);
            statusText = 'Error fetching stats';
            chosenActivityType = ActivityType.Playing;
        } else {
            const statsDocRef = doc(collection(db, `artifacts/${appId}/public/data/stats`), 'botStats');
            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                const totalServers = client.guilds.cache.size;

                statusText = `Help ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
                console.log(`Bot Status: Preparing dynamic stats: "${statusText}" [Source: ${source}]`);
            } catch (error) {
                console.error(`Bot Status: Error fetching stats from Firestore for dynamic status (Source: ${source}):`, error);
                statusText = 'Error fetching stats';
                chosenActivityType = ActivityType.Playing;
            }
        }
    }

    if (statusText.length > 128) {
        console.warn(`Bot Status: Generated status text exceeds 128 character limit. Truncating: "${statusText}" [Source: ${source}]`);
        statusText = statusText.substring(0, 128);
    }

    // Call the debounced function
    debounceUpdateActivity(client, statusText, chosenActivityType, source);
}

module.exports = {
    updateBotPresence
};
