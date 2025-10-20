const { collection, addDoc } = require('firebase/firestore'); // Import Firestore methods

// Logging Configuration Variables
// 1. Variable to enable/disable logging
const LOGGING_ENABLED = true; 
// 2. The channel ID where events MUST originate from to be logged (The channel you specified)
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
 * @param {string|null} [oldContent=null] Original content for message updates.
 * @returns {object} The structured log entry.
 */
function generateLogEntry(message, actionType, oldContent = null) {
    // Check if guild and author properties are available (may be missing for uncached messages)
    const guildId = message.guild ? message.guild.id : 'N/A';
    const channelId = message.channel ? message.channel.id : 'N/A';
    const userId = message.author ? message.author.id : 'N/A (Uncached)';
    const content = message.content || 'CONTENT_UNAVAILABLE';
    
    const logEntry = {
        timestamp: new Date().toISOString(),
        action: actionType,
        guildId: guildId,
        channelId: channelId,
        userId: userId,
        messageId: message.id || 'N/A',
    };

    if (actionType === 'MESSAGE_EDIT') {
        logEntry.oldContent = oldContent;
        logEntry.newContent = content;
    } else {
        logEntry.content = content;
    }

    return logEntry;
}

// --- Event Handlers ---

// 1. Logs all newly created messages
async function handleMessageCreate(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    // FIX: Filtering to the specific channel ID
    if (!message.guild || message.channel.id !== LOG_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;
    // Ignore messages from bots or from this bot itself
    if (message.author.bot || message.author.id === client.user.id) return;
    
    const logData = generateLogEntry(message, 'MESSAGE_CREATE');
    await writeLogToFirestore(logData, db, APP_ID_FOR_FIRESTORE);
    console.log(`[LOGGER] Logged Message Create from ${message.author.tag} in #${message.channel.name} to Firestore.`);
}


// 2. Logs deleted messages
async function handleMessageDelete(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    // FIX: Filtering to the specific channel ID
    if (!message.guild || message.channel.id !== LOG_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;

    // Ignore logging deletions by the bot itself
    if (message.author && message.author.id === client.user.id) return;

    const logData = generateLogEntry(message, 'MESSAGE_DELETE');
    await writeLogToFirestore(logData, db, APP_ID_FOR_FIRESTORE);
    console.log(`[LOGGER] Logged Message Delete (ID: ${message.id}) from #${message.channel.name} to Firestore.`);
}

// 3. Logs edited messages
async function handleMessageUpdate(oldMessage, newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    // FIX: Filtering to the specific channel ID
    if (!newMessage.guild || newMessage.channel.id !== LOG_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;
    
    // Ignore if content hasn't changed or if message is partial/bot message
    if (oldMessage.content === newMessage.content || newMessage.author.bot) return;

    const oldContent = oldMessage.content || 'CONTENT_UNAVAILABLE (Uncached Old)';
    
    const logData = generateLogEntry(newMessage, 'MESSAGE_EDIT', oldContent);
    await writeLogToFirestore(logData, db, APP_ID_FOR_FIRESTORE);
    console.log(`[LOGGER] Logged Message Edit (ID: ${newMessage.id}) in #${newMessage.channel.name} to Firestore.`);
}


module.exports = {
    // The main export for the 'messageCreate' event
    name: 'messageCreate', 
    once: false,
    execute: handleMessageCreate,

    // Export other handlers to be manually registered in index.js
    messageDelete: handleMessageDelete,
    messageUpdate: handleMessageUpdate
};
