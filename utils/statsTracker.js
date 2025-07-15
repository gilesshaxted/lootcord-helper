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
 * @param {object} data Latest data from Firestore.
 */
function updateInMemoryStats(data) {
    if (data) {
        botStats.totalHelps = data.totalHelps || 0;
        botStats.activeUsersMap = data.activeUsersMap || {};
        botStats.uniqueActiveUsers = Object.keys(botStats.activeUsersMap).length;
        botStats.lastUpdated = data.lastUpdated || null;
    }
    console.log('Stats Tracker: Updated in-memory stats:', botStats);
}

/**
 * Increments the total helps counter in Firestore.
 * @param {object} db The Firestore database instance.
 * @param {string} appId The application ID for Firestore path.
 */
async function incrementTotalHelps(db, appId) {
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
    } catch (error) {
        console.error('Stats Tracker: Error incrementing total helps:', error);
        // If document doesn't exist, create it.
        if (error.code === 'not-found') {
            await setDoc(statsDocRef, {
                totalHelps: 1,
                activeUsersMap: botStats.activeUsersMap, // Initialize with current active users
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
 */
async function addActiveUser(db, appId, userId) {
    if (!db) {
        console.warn('Stats Tracker: Firestore DB not available for addActiveUser.');
        return;
    }
    const statsDocRef = doc(collection(db, `artifacts/${appId}/public/data/stats`), 'botStats');
    const userKey = `activeUsersMap.${userId}`; // Dot notation to update map field

    try {
        await updateDoc(statsDocRef, {
            [userKey]: true, // Set user ID as a key in the map
            lastUpdated: new Date().toISOString()
        });
        console.log(`Stats Tracker: Added active user ${userId} to Firestore.`);
    } catch (error) {
        console.error(`Stats Tracker: Error adding active user ${userId}:`, error);
        // If document doesn't exist, create it with this user
        if (error.code === 'not-found') {
            await setDoc(statsDocRef, {
                totalHelps: botStats.totalHelps, // Initialize with current helps
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

// updateBotStatus function is moved to utils/botStatus.js

module.exports = {
    initializeStats,
    updateInMemoryStats,
    incrementTotalHelps,
    addActiveUser,
    getBotStats
    // updateBotStatus is no longer exported from here
};
