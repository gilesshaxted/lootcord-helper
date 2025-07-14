const { doc, setDoc, updateDoc, increment, collection } = require('firebase/firestore');

// In-memory cache for bot statistics
let botStats = {
    totalHelps: 0,
    uniqueActiveUsers: 0,
    activeUsersMap: {}, // To track unique user IDs
    lastUpdated: null
};

// Internal variables to track the last values that were used to set the Discord status
let _lastTotalHelps = -1; // Initialize with a value that ensures first update
let _lastUniqueActiveUsers = -1; // Initialize with a value that ensures first update

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
    // Initialize _last values to ensure status is set on first data load
    _lastTotalHelps = -1;
    _lastUniqueActiveUsers = -1;
}

/**
 * Updates the in-memory bot stats from a Firestore snapshot.
 * This function now also checks if the relevant stats have changed before calling updateBotStatus.
 * @param {object} data Latest data from Firestore.
 * @param {Client} client The Discord client instance (passed to updateBotStatus if needed).
 */
function updateInMemoryStats(data, client) {
    if (data) {
        const newTotalHelps = data.totalHelps || 0;
        const newActiveUsersMap = data.activeUsersMap || {};
        const newUniqueActiveUsers = Object.keys(newActiveUsersMap).length;
        const newLastUpdated = data.lastUpdated || null;

        // Check if values relevant to the status text have actually changed
        if (newTotalHelps !== _lastTotalHelps || newUniqueActiveUsers !== _lastUniqueActiveUsers) {
            botStats.totalHelps = newTotalHelps;
            botStats.activeUsersMap = newActiveUsersMap;
            botStats.uniqueActiveUsers = newUniqueActiveUsers;
            botStats.lastUpdated = newLastUpdated;

            console.log('Stats Tracker: Updated in-memory stats:', botStats);
            updateBotStatus(client); // Only update Discord status if numbers changed
        } else {
            // console.log('Stats Tracker: In-memory stats updated, but status values are unchanged. Skipping Discord status update.'); // Too verbose
        }
    }
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

/**
 * Updates the bot's Discord status based on current in-memory stats.
 * This function is called by updateInMemoryStats when relevant data changes.
 * @param {Client} client The Discord client instance.
 */
function updateBotStatus(client) {
    const stats = getBotStats();
    const statusText = `Helped ${stats.uniqueActiveUsers} players ${stats.totalHelps} times`;

    // Update the internal last known values
    _lastTotalHelps = stats.totalHelps;
    _lastUniqueActiveUsers = stats.uniqueActiveUsers;

    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' });
        console.log(`Stats Tracker: Bot status updated to: "${statusText}"`);
    } else {
        console.warn('Stats Tracker: Cannot set bot status: client.user is not available.');
    }
}

module.exports = {
    initializeStats,
    updateInMemoryStats,
    incrementTotalHelps,
    addActiveUser,
    getBotStats,
    updateBotStatus
};
