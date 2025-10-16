const { collection, doc, getDoc, setDoc, updateDoc, increment } = require('firebase/firestore');

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots or from this bot itself
        if (message.author.bot || message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Monthly Message Tracker: Firestore not ready. Skipping message count.');
            return;
        }

        const userId = message.author.id;
        const username = message.author.tag; // Get current username/tag

        // Determine the current month in YYYY-MM format
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const monthDocId = `${year}-${month}`;

        // Reference to the monthly message count document for this user
        const userMessageCountRef = doc(collection(db, `MessageCounts/${monthDocId}/users`), userId);

        try {
            // Atomically increment the messageCount
            await setDoc(userMessageCountRef, {
                messageCount: increment(1),
                username: username, 
                lastMessageTimestamp: now.toISOString()
            }, { merge: true });

            // console.log(`Monthly Message Tracker: Incremented message count for ${username} (${userId}) in ${monthDocId}.`);
        } catch (error) {
            console.error(`Monthly Message Tracker: Error updating message count for ${username} (${userId}) in ${monthDocId}:`, error);
        }
    },
};
