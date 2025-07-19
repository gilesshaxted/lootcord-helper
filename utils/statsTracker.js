const { doc, setDoc, updateDoc, increment, collection } = require('firebase/firestore');

// In-memory cache for bot statistics
let botStats = {
    totalHelps: 0,
    uniqueActiveUsers: 0,
    activeUsersMap: {}, // To track unique user IDs
    lastUpdated: null
};

/**
 * Initializes the in-memory bot stats.
 * @param {object} initialData Data fetched from Firestore on startup.
 */
function initializeStats(initialData) {
    if (initialData) {
        botStats.totalHelps = initialData.totalHelps || 0;
        botStats.activeUsersMap = initialData.activeUsersMap || {};
        botStats.uniqueActiveUsers = Object.keys(botStats.activeUsersMap).length;
        botStats.lastUpdated = initialData.lastUpdated || null;
    }
    console.log('Stats Tracker: Initialized in-memory stats:', botStats);
}

/**
 * Updates the in-memory bot stats from a Firestore snapshot.
 * This function also triggers an update to the bot's presence text in Firestore.
 * @param {object} data Latest data from Firestore.
 * @param {object} db The Firestore database instance.
 * @param {string} appId The application ID for Firestore path.
 * @param {Client} client The Discord client instance (needed for guild count).
 */
async function updateInMemoryStats(data, db, appId, client) {
    if (data) {
        botStats.totalHelps = data.totalHelps || 0;
        botStats.activeUsersMap = data.activeUsersMap || {};
        botStats.uniqueActiveUsers = Object.keys(botStats.activeUsersMap).length;
        botStats.lastUpdated = data.lastUpdated || null;
    }
    console.log('Stats Tracker: Updated in-memory stats:', botStats);

    // NEW: Calculate and store the desired bot presence text in Firestore
    if (db && appId && client && client.isReady()) {
        const presenceDocRef = doc(collection(db, `artifacts/${appId}/public/data/botPresence`), 'currentStatus');
        const totalServers = client.guilds.cache.size;
        const statusText = `Helped ${botStats.uniqueActiveUsers} players ${botStats.totalHelps} times in ${totalServers} servers`;

        try {
            await setDoc(presenceDocRef, { statusText: statusText, lastUpdated: new Date().toISOString() }, { merge: true });
            console.log(`Stats Tracker: Stored desired presence in Firestore: "${statusText}"`);
        } catch (error) {
            console.error('Stats Tracker: Error storing desired presence in Firestore:', error);
        }
    } else {
        console.warn('Stats Tracker: Cannot store desired presence in Firestore: DB, App ID, or Client not ready.');
    }
}

/**
 * Increments the total helps counter in Firestore.
 * @param {object} db The Firestore database instance.
 * @param {string} appId The application ID for Firestore path.
 * @param {Client} client The Discord client instance (needed for updateInMemoryStats).
 */
async function incrementTotalHelps(db, appId, client) {
    if (!db) {
        console.warn('Stats Tracker: Firestore DB not available for incrementTotalHelps.');
        return;
    }
    const statsDocRef = doc(collection(db, `artifacts/${appId}/public/data/stats`), 'botStats');
    try {
        await updateDoc(statsDocRef, {
            totalHelps: increment(1),
            lastUpdated: new Date().toISOString()
        });
        console.log('Stats Tracker: Incremented total helps in Firestore.');
        // The onSnapshot listener will handle updateInMemoryStats and presence update
    } catch (error) {
        console.error('Stats Tracker: Error incrementing total helps:', error);
        if (error.code === 'not-found') {
            await setDoc(statsDocRef, {
                totalHelps: 1,
                activeUsersMap: botStats.activeUsersMap,
                lastUpdated: new Date().toISOString()
            }, { merge: true });
            console.log('Stats Tracker: Created botStats document and set initial helps.');
        }
    }
}

/**
 * Adds a unique active user to the Firestore stats.
 * @param {object} db The Firestore database instance.
 * @param {string} appId The application ID for Firestore path.
 * @param {string} userId The ID of the active user.
 * @param {Client} client The Discord client instance (needed for updateInMemoryStats).
 */
async function addActiveUser(db, appId, userId, client) {
    if (!db) {
        console.warn('Stats Tracker: Firestore DB not available for addActiveUser.');
        return;
    }
    const statsDocRef = doc(collection(db, `artifacts/${appId}/public/data/stats`), 'botStats');
    const userKey = `activeUsersMap.${userId}`;

    try {
        await updateDoc(statsDocRef, {
            [userKey]: true,
            lastUpdated: new Date().toISOString()
        });
        console.log(`Stats Tracker: Added active user ${userId} to Firestore.`);
        // The onSnapshot listener will handle updateInMemoryStats and presence update
    } catch (error) {
        console.error(`Stats Tracker: Error adding active user ${userId}:`, error);
        if (error.code === 'not-found') {
            await setDoc(statsDocRef, {
                totalHelps: botStats.totalHelps,
                activeUsersMap: { [userId]: true },
                lastUpdated: new Date().toISOString()
            }, { merge: true });
            console.log(`Stats Tracker: Created botStats document and added user ${userId}.`);
        }
    }
}

/**
 * Gets the current in-memory bot statistics.
 * @returns {object} The current bot statistics.
 */
function getBotStats() {
    return botStats;
}

module.exports = {
    initializeStats,
    updateInMemoryStats,
    incrementTotalHelps,
    addActiveUser,
    getBotStats,
};
