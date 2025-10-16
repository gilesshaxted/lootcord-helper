const { collection, doc, getDoc, setDoc, updateDoc, increment, writeBatch, getFirestore } = require('firebase/firestore');

// --- In-Memory Cache for Message Counts ---
// Structure: { monthDocId: { userId: { count: number, username: string } } }
let messageCache = {};

// Flush interval in index.js should be around 5 minutes (300,000 ms)

/**
 * Executes a batched write of all accumulated messages in the cache to Firestore.
 * This should be called periodically via an interval timer.
 * @param {object} db The Firestore database instance.
 */
async function flushMessageCache(db) {
    if (!db) {
        console.warn('Monthly Message Tracker: Firestore DB not ready for batch flush. Skipping.');
        return;
    }
    
    // Check if the cache is empty
    const totalUpdates = Object.values(messageCache).reduce((sum, monthData) => sum + Object.keys(monthData).length, 0);
    if (totalUpdates === 0) {
        // console.log('Monthly Message Tracker: Message cache is empty. Skipping batch write.');
        return;
    }

    const batch = writeBatch(db);
    let totalWrites = 0;

    console.log(`Monthly Message Tracker: Starting batch flush of ${totalUpdates} user updates across ${Object.keys(messageCache).length} months.`);

    try {
        for (const monthDocId in messageCache) {
            const usersInMonth = messageCache[monthDocId];
            
            for (const userId in usersInMonth) {
                const userData = usersInMonth[userId];
                
                // Get a reference to the monthly message count document for this user
                // Path: MessageCounts/{monthDocId}/users/{userId}
                const userMessageCountRef = doc(collection(db, `MessageCounts/${monthDocId}/users`), userId);

                // Add the update operation to the batch
                batch.set(userMessageCountRef, {
                    messageCount: increment(userData.count), // Increment by the cached amount
                    username: userData.username, // Keep username updated
                    lastMessageTimestamp: new Date().toISOString() // Update timestamp
                }, { merge: true });
                totalWrites++;
            }
        }

        // Commit the batch
        await batch.commit();
        console.log(`Monthly Message Tracker: Successfully committed batch of ${totalWrites} updates to Firestore.`);
        
        // Clear the cache ONLY after a successful commit
        messageCache = {};

    } catch (error) {
        console.error('Monthly Message Tracker: Error during batch commit! Cache contents retained for next attempt.', error);
        // Do NOT clear cache on failure
    }
}


module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots or from this bot itself
        if (message.author.bot || message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before we even start filling the cache
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

        // --- Caching Logic (Replacing Direct Firestore Write) ---
        if (!messageCache[monthDocId]) {
            messageCache[monthDocId] = {};
        }

        if (!messageCache[monthDocId][userId]) {
            messageCache[monthDocId][userId] = { count: 0, username: username };
        }
        
        // Atomically increment the count in memory
        messageCache[monthDocId][userId].count += 1;
        messageCache[monthDocId][userId].username = username; // Ensure username is always the most recent one

        // console.log(`Monthly Message Tracker: Cached message for ${username} (${userId}) in ${monthDocId}. Current count: ${messageCache[monthDocId][userId].count}`);
    },
    
    // Export the flush function
    flushMessageCache
};
