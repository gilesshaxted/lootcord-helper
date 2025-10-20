const { collection, addDoc } = require('firebase/firestore'); // Import Firestore methods

// Logging Configuration Variables
// 1. Variable to enable/disable logging
const LOGGING_ENABLED = true; 
// 2. Placeholder for a log channel ID (not used for Firestore)
const LOG_CHANNEL_ID = '1429872409233850478'; 

/**
 * Writes the structured log entry to the public Firestore logs collection.
 * Path: artifacts/{appId}/public/data/logs
 * @param {object} logData The log object to save.
 * @param {object} db Firestore instance.
 * @param {string} appId The application ID for the artifact path.
 */
async function writeLogToFirestore(logData, db, appId) {
    if (!db || !appId) {
        console.error("[LOGGER] Firestore or APP_ID not available for logging.");
        return;
    }
    try {
        const logsCollectionRef = collection(db, `artifacts/${appId}/public/data/logs`);
        await addDoc(logsCollectionRef, logData);
    } catch (error) {
        console.error("[LOGGER] Failed to write log to Firestore:", error);
    }
}

/**
 * Formats a Discord message into a structured object for Firestore.
 * @param {import('discord.js').Message} message The Discord message object.
 * @param {string} actionType A short description of the action (e.g., 'MESSAGE_DELETE').
 * @returns {object} The structured log entry.
 */
function generateLogEntry(message, actionType) {
    // Check if guild and author properties are available (may be missing for uncached messages)
    const guildId = message.guild ? message.guild.id : 'N/A';
    const channelId = message.channel ? message.channel.id : 'N/A';
    const userId = message.author ? message.author.id : 'N/A (Uncached)';
    
    return {
        timestamp: new Date().toISOString(),
        action: actionType,
        guildId: guildId,
        channelId: channelId,
        userId: userId,
        messageId: message.id || 'N/A',
        content: message.content || 'CONTENT_UNAVAILABLE', 
    };
}

module.exports = {
    name: 'messageDelete', 
    once: false,
    // The event now receives Firebase context: db and APP_ID_FOR_FIRESTORE
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Only proceed if logging is enabled globally and Firestore is ready
        if (!LOGGING_ENABLED || !isFirestoreReady) {
            return;
        }

        // Ignore partial messages or messages not from a guild
        if (!message.guild || message.partial) {
            return;
        }

        // Log the deletion action
        const logData = generateLogEntry(message, 'MESSAGE_DELETE');
        await writeLogToFirestore(logData, db, APP_ID_FOR_FIRESTORE);
        
        console.log(`[LOGGER] Logged Message Delete from #${message.channel.name} to Firestore.`);
    },
};
