const { doc, collection, onSnapshot, setDoc } = require('firebase/firestore');
const { ActivityType } = require('discord.js');
const statsTracker = require('./statsTracker'); // Import statsTracker to get current stats

// Internal variable to cache the bot's currently set Discord presence text
// This helps avoid redundant Discord API calls if the status hasn't actually changed.
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

    if (_currentDiscordPresenceText === statusText && _currentDiscordActivityType === activityType) {
        // console.log(`Bot Status: Presence already set to "${statusText}" [${ActivityType[activityType]}]. Skipping redundant API call.`);
        return; // Avoid redundant API calls if status hasn't changed
    }

    try {
        client.user.setActivity(statusText, { type: ActivityType[activityType] ?? ActivityType.Playing });
        _currentDiscordPresenceText = statusText;
        _currentDiscordActivityType = ActivityType[activityType] ?? ActivityType.Playing;
        console.log(`Bot Status: Discord presence updated to: "${statusText}" [${ActivityType[activityType] ?? 'PLAYING'}]`);
    } catch (error) {
        console.error('Bot Status: Failed to set Discord presence:', error);
    }
}

/**
 * Determines the desired bot presence status (from Firestore or dynamic stats)
 * and updates the Discord presence if it's different.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {boolean} isFirestoreReady Flag indicating Firestore readiness.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
async function updateBotPresenceFromFirestore(client, db, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!db || !isFirestoreReady || !client.isReady()) {
        console.warn('Bot Status: Firestore or Client not ready for presence update. Skipping.');
        return;
    }

    const botPresenceDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botPresence`), 'currentStatus');
    let desiredStatusText = null;
    let desiredActivityType = ActivityType.Playing; // Default to PLAYING

    try {
        const docSnap = await getDoc(botPresenceDocRef);
        if (docSnap.exists() && docSnap.data().statusText) {
            const data = docSnap.data();
            desiredStatusText = data.statusText;
            desiredActivityType = data.activityType ?? ActivityType.Playing;
            console.log(`Bot Status: Desired presence from Firestore: "${desiredStatusText}" [${ActivityType[desiredActivityType]}]`);
        } else {
            console.log("Bot Status: No 'currentStatus' document found or statusText is empty. Falling back to dynamic stats.");
        }
    } catch (error) {
        console.error("Bot Status: Error fetching 'currentStatus' from Firestore. Falling back to dynamic stats:", error);
    }

    // If no custom status from Firestore, generate dynamic status from statsTracker
    if (desiredStatusText === null) {
        const stats = statsTracker.getBotStats();
        const totalHelps = stats.totalHelps ?? 0;
        const uniqueActiveUsers = stats.uniqueActiveUsers ?? 0;
        const totalServers = client.guilds.cache.size;

        desiredStatusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
        desiredActivityType = ActivityType.Playing; // Dynamic status is always PLAYING
        console.log(`Bot Status: Generated dynamic presence: "${desiredStatusText}"`);
    }

    _setDiscordPresence(client, desiredStatusText, desiredActivityType);
}

/**
 * Starts the comprehensive bot presence management:
 * - Listens to Firestore for explicit presence changes.
 * - Sets up a periodic update interval.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {boolean} isFirestoreReady Flag indicating Firestore readiness.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
function startBotPresenceManagement(client, db, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!db || !isFirestoreReady || !client.isReady()) {
        console.warn('Bot Status: Cannot start presence management: Firestore or Client not ready.');
        return;
    }

    const botPresenceDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botPresence`), 'currentStatus');

    // 1. Initial update and real-time listener for explicit presence document
    onSnapshot(botPresenceDocRef, async (docSnap) => {
        console.log('Bot Status: Firestore listener for botPresence triggered.');
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.statusText) {
                _setDiscordPresence(client, data.statusText, data.activityType ?? ActivityType.Playing);
                // Set custom status internally so periodic updates don't overwrite it
                _currentDiscordPresenceText = data.statusText;
                _currentDiscordActivityType = data.activityType ?? ActivityType.Playing;
            } else {
                // If document exists but statusText is empty, clear custom status and revert to dynamic
                console.log("Bot Status: Firestore 'currentStatus' document exists but statusText is empty. Reverting to dynamic.");
                _currentDiscordPresenceText = null; // Clear custom status
                _currentDiscordActivityType = ActivityType.Playing;
                _setDiscordPresence(client, statsTracker.getBotStats().statusText, ActivityType.Playing); // Force dynamic update
            }
        } else {
            console.log("Bot Status: No 'currentStatus' document found in Firestore. Reverting to dynamic.");
            _currentDiscordPresenceText = null; // Clear custom status
            _currentDiscordActivityType = ActivityType.Playing;
            _setDiscordPresence(client, statsTracker.getBotStats().statusText, ActivityType.Playing); // Force dynamic update
        }
    }, (error) => {
        console.error("Bot Status: Error listening to bot presence document:", error);
    });

    // 2. Periodic update fallback (also covers initial dynamic status if no Firestore doc)
    // This interval ensures the status is refreshed even if Firestore changes are missed,
    // or if the dynamic stats need to be applied when no custom status is set.
    setInterval(async () => {
        // If no custom status is active (i.e., _currentDiscordPresenceText is null),
        // then we update with dynamic stats.
        if (_currentDiscordPresenceText === null) {
            console.log('Bot Status: Periodic check: No custom status, updating with dynamic stats.');
            _setDiscordPresence(client, statsTracker.getBotStats().statusText, ActivityType.Playing);
        } else {
            console.log(`Bot Status: Periodic check: Custom status active ("${_currentDiscordPresenceText}"). Not overriding.`);
        }
    }, 300000); // Every 5 minutes

    console.log('Bot Status: Started comprehensive presence management.');
}

module.exports = {
    startBotPresenceManagement,
    _setDiscordPresence, // Exported for internal use by set-status command to force update
    // You might also want to expose a way to explicitly set/clear custom status from commands
    // setCustomBotStatus and clearCustomBotStatus from previous iterations would go here.
    // For now, the set-status command will directly write to Firestore for persistence.
};
