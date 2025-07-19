const { doc, collection, onSnapshot } = require('firebase/firestore'); // Import Firestore functions
const { ActivityType } = require('discord.js'); // Import ActivityType

// In-memory cache for the desired status text from Firestore
let desiredStatusText = null;

/**
 * Updates the bot's Discord presence based on a Firestore entry.
 * This function is solely responsible for setting the bot's presence.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} appId The application ID for Firestore path.
 */
function updateBotPresence(client, db, appId) {
    if (!client.user) {
        console.warn('Bot Status: Cannot set bot presence: client.user is not available yet.');
        return;
    }
    if (!db || !appId) {
        console.warn('Bot Status: Firestore DB or App ID not available for presence update. Skipping.');
        return;
    }

    const presenceDocRef = doc(collection(db, `artifacts/${appId}/public/data/botPresence`), 'currentStatus');

    // Use onSnapshot to listen for real-time updates to the presence document
    // This listener will be set up once and keep the desiredStatusText updated.
    // The actual presence update will happen if desiredStatusText changes.
    onSnapshot(presenceDocRef, (docSnap) => {
        let newStatus = null;
        if (docSnap.exists()) {
            const data = docSnap.data();
            newStatus = data.statusText || null;
            console.log(`Bot Status: Desired status from Firestore: "${newStatus}"`);
        } else {
            console.log('Bot Status: No botPresence/currentStatus document found in Firestore.');
        }

        // Only update Discord presence if the desired status has changed
        if (newStatus && client.user.presence.activities[0]?.name !== newStatus) {
            client.user.setActivity(newStatus, { type: ActivityType.Playing }); // Default to PLAYING
            console.log(`Bot Status: Discord presence updated to: "${newStatus}"`);
        } else if (!newStatus && client.user.presence.activities[0]?.name) {
            // If Firestore says no status, but bot has one, clear it (set to default empty)
            client.user.setActivity(null);
            console.log('Bot Status: Discord presence cleared as no desired status found in Firestore.');
        } else {
            console.log('Bot Status: Discord presence is already up-to-date or no new status to set.');
        }
    }, (error) => {
        console.error('Bot Status: Error listening to botPresence/currentStatus:', error);
    });
}

module.exports = {
    updateBotPresence
};
