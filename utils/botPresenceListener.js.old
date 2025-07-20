const { doc, collection, onSnapshot } = require('firebase/firestore');
const botStatus = require('./botStatus'); // Import the botStatus utility
const statsTracker = require('./statsTracker'); // Import statsTracker to get current stats

/**
 * Starts a Firestore listener for the bot's presence status and updates Discord presence.
 * Also sets up a periodic update interval.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {boolean} isFirestoreReady Flag indicating Firestore readiness.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
function startBotPresenceListener(client, db, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!db || !isFirestoreReady || !client.isReady()) {
        console.warn('Bot Presence Listener: Firestore or Client not ready. Cannot start presence listener.');
        return;
    }

    const botPresenceDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botPresence`), 'currentStatus');

    // Set up real-time listener for the bot's presence document
    onSnapshot(botPresenceDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const statusText = data.statusText;
            const activityType = data.activityType; // Assuming you might store activity type here later

            if (statusText) {
                // Update bot's presence using the botStatus utility
                botStatus.setCustomBotStatus(client, statusText, activityType);
                console.log(`Bot Presence Listener: Updated Discord presence from Firestore: "${statusText}"`);
            } else {
                console.warn('Bot Presence Listener: Firestore presence document exists but has no statusText. Reverting to dynamic stats.');
                botStatus.clearCustomBotStatus(client, statsTracker.getBotStats());
            }
        } else {
            console.log("Bot Presence Listener: No 'currentStatus' document found in Firestore. Reverting to dynamic stats.");
            botStatus.clearCustomBotStatus(client, statsTracker.getBotStats()); // Ensure dynamic status is active
        }
    }, (error) => {
        console.error("Bot Presence Listener: Error listening to bot presence:", error);
    });

    // Also ensure periodic updates are set up, even if Firestore is used for persistence.
    // This provides a fallback if Firestore updates are missed or delayed.
    // The interval will now call updateBotPresence with current stats.
    setInterval(() => botStatus.updateBotPresence(client, statsTracker.getBotStats()), 300000); // Every 5 minutes
    console.log('Bot Presence Listener: Started periodic presence updates.');
}

module.exports = {
    startBotPresenceListener
};
