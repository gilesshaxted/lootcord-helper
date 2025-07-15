const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots or from this bot itself
        if (message.author.bot || message.author.id === client.user.id) return;

        // Check if Firestore is ready
        if (!isFirestoreReady) {
            console.warn('Active Player Tracker: Firestore not ready. Skipping tracking.');
            return;
        }

        // Check if the message content starts with 't-'
        if (message.content.toLowerCase().startsWith('t-')) {
            const userId = message.author.id;
            statsTracker.addActiveUser(db, APP_ID_FOR_FIRESTORE, userId);
        }
    },
};
