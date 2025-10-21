const { collection, doc, setDoc, getDoc, deleteDoc, PermissionsBitField } = require('firebase/firestore');
const { AttachmentBuilder } = require('discord.js');

// --- Configuration Variables (MUST BE EDITED) ---
const LOGGING_ENABLED = true; 
// 1. The channel ID where game events MUST originate from.
const LOG_GAME_CHANNEL_ID = '1429872409233850478'; 
// 2. The channel ID where the finished log file (.txt) is sent.
const LOG_OUTPUT_CHANNEL_ID = '1394316724819591318'; 
// 3. The ID of the bot whose messages we want to monitor.
const TARGET_BOT_ID = '493316754689359874'; 

// --- In-Memory Log Cache ---
// Key: Channel ID, Value: Array of raw log strings
const logCache = new Map();
// Key: Channel ID, Value: Unix Timestamp when logging started
const sessionStartTime = new Map();

// --- Log Game End Conditions (Bot Message Content) ---
// FIX: Removed the start-of-string anchor (^) to allow matching after hidden characters.
const GAME_END_REGEX = /(WOOooo|You've exhausted all of your guesses|You ran out of time to guess the correct word)/i;

// --- Firestore State Management ---
const FIREBASE_LOG_STATE_PATH = 'BotConfigs/loggingState'; 

/**
 * Utility to fetch the current active logging state from Firestore.
 * @param {object} db Firestore instance.
 * @returns {Promise<object|null>} The active state object or null.
 */
async function getLogState(db) {
    if (!db) return null;
    try {
        const docSnap = await getDoc(doc(db, FIREBASE_LOG_STATE_PATH));
        return docSnap.exists() ? docSnap.data() : { isActive: false };
    } catch (error) {
        console.error("[LOGGER] Failed to read log state from Firestore:", error);
        return { isActive: false };
    }
}

/**
 * Utility to set the active logging state in Firestore.
 * @param {object} db Firestore instance.
 * @param {object} state The state object to save.
 */
async function setLogState(db, state) {
    if (!db) return;
    try {
        await setDoc(doc(db, FIREBASE_LOG_STATE_PATH), state, { merge: true });
    } catch (error) {
        console.error("[LOGGER] Failed to write log state to Firestore:", error);
    }
}

/**
 * Formats Discord message data (including embeds) into a single raw log string.
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} message The message object.
 * @param {string} actionType A short description of the action (e.g., 'MESSAGE_CREATE').
 * @param {string|null} [oldContent=null] Original content for message updates.
 * @returns {string} A raw, multi-line log entry.
 */
function formatLogEntry(message, actionType, oldContent = null) {
    const time = new Date().toISOString();
    const authorTag = message.author ? message.author.tag : 'N/A (Uncached)';
    const authorId = message.author ? message.author.id : 'N/A';
    const messageId = message.id || 'N/A';
    
    let log = `[${time}] | ${actionType} | ID:${messageId} | User:${authorTag} (${authorId})\n`;

    if (actionType === 'MESSAGE_EDIT') {
        log += `  -> Old Content: "${oldContent || 'CONTENT_UNAVAILABLE (Uncached)'}"\n`;
        log += `  -> New Content: "${message.content || 'CONTENT_UNAVAILABLE'}"\n`;
    } else {
        log += `  -> Content: "${message.content || 'CONTENT_UNAVAILABLE'}"\n`;
    }

    if (message.embeds && message.embeds.length > 0) {
        log += `  -> Embeds (${message.embeds.length}):\n`;
        message.embeds.forEach((embed, index) => {
            log += `     [Embed ${index + 1}] Title: ${embed.title || 'N/A'} | Description: ${embed.description ? embed.description.replace(/\n/g, ' ') : 'N/A'}\n`;
            if (embed.fields) {
                embed.fields.forEach(field => {
                    log += `     [Field] ${field.name}: ${field.value.replace(/\n/g, ' ')}\n`;
                });
            }
        });
    }

    return log;
}

/**
 * Ends the logging session, dumps the cache to a TXT file, and sends it to the output channel.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} db Firestore instance.
 * @param {boolean} [isManualDump=false] Indicates if triggered by a command.
 */
async function endLoggingSession(client, db, isManualDump = false) {
    const channelId = LOG_GAME_CHANNEL_ID;
    const cache = logCache.get(channelId);
    
    if (!cache || cache.length === 0) {
        await setLogState(db, { isActive: false }); 
        logCache.delete(channelId);
        sessionStartTime.delete(channelId);
        return { success: true, message: "Log session cleared (no entries found)." };
    }

    const logContent = cache.join('\n---\n');
    const logsFileName = `wordle_log_${new Date().getTime()}.txt`;
    const logsFile = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), { name: logsFileName });

    let outputChannel = null;
    let finalStatus = { success: false, message: "Unknown error." };

    try {
        // Fetch the channel reliably
        outputChannel = await client.channels.fetch(LOG_OUTPUT_CHANNEL_ID);
    } catch (e) {
        finalStatus.message = `❌ Failed to fetch output channel ${LOG_OUTPUT_CHANNEL_ID}.`;
        console.error(`[LOGGER] ${finalStatus.message}:`, e.message);
    }

    if (outputChannel && outputChannel.isTextBased()) {
        try {
            // Check permissions before sending
            const permissions = outputChannel.permissionsFor(client.user.id);
            if (!permissions) {
                finalStatus.message = `❌ Bot has no permissions defined for output channel.`;
                console.error(`[LOGGER] ${finalStatus.message}`);
            } else if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
                finalStatus.message = `❌ Missing 'Send Messages' permission in <#${LOG_OUTPUT_CHANNEL_ID}>.`;
                console.error(`[LOGGER] ${finalStatus.message}`);
            } else if (!permissions.has(PermissionsBitField.Flags.AttachFiles)) {
                finalStatus.message = `❌ Missing 'Attach Files' permission in <#${LOG_OUTPUT_CHANNEL_ID}>.`;
                console.error(`[LOGGER] ${finalStatus.message}`);
            } else {
                const startTime = sessionStartTime.get(channelId);
                const duration = startTime ? (Date.now() - startTime) / 1000 : 0; // Duration in seconds

                let replyMessage = isManualDump ? `Manual Log Dump for <#${channelId}>` : `✅ **Log Session Complete for <#${channelId}>**`;
                replyMessage += `\nDuration: ${duration.toFixed(0)} seconds (${Math.round(duration / 60)} minutes)\n`;
                replyMessage += `Total Entries: ${cache.length}\n\n**Log file attached.**`;

                await outputChannel.send({ content: replyMessage, files: [logsFile] });
                console.log(`[LOGGER] Log file sent to output channel #${outputChannel.name}. Entries: ${cache.length}`);
                finalStatus = { success: true, message: `Log file sent successfully to <#${LOG_OUTPUT_CHANNEL_ID}>.` };
            }
        } catch (error) {
            console.error("[LOGGER] Failed to send log file:", error);
            finalStatus.message = `❌ Failed to send log file: ${error.message}`;
        }
    } else {
        if (!finalStatus.message.startsWith('❌')) {
            finalStatus.message = `❌ Output channel ${LOG_OUTPUT_CHANNEL_ID} is not a valid text channel or could not be found.`;
        }
    }
    
    // Clean up state and cache only if it wasn't a manual dump
    if (!isManualDump) {
        await setLogState(db, { isActive: false });
        logCache.delete(channelId);
        sessionStartTime.delete(channelId);
    }

    return finalStatus;
}

/**
 * Pushes a log entry into the cache if logging is active.
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} message Message data.
 * @param {string} actionType Type of action.
 * @param {string|null} [oldContent=null] Old content for edits.
 */
function cacheLogEntry(message, actionType, oldContent = null) {
    const logEntry = formatLogEntry(message, actionType, oldContent);
    const channelId = LOG_GAME_CHANNEL_ID;
    
    if (!logCache.has(channelId)) {
        logCache.set(channelId, []);
    }
    logCache.get(channelId).push(logEntry);
}


// --- Event Handlers ---

// 1. Logs all newly created messages (used for START/STOP detection)
async function handleMessageCreate(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!message.guild || message.channel.id !== LOG_GAME_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;

    const logState = await getLogState(db);
    const isTargetBot = message.author.id === TARGET_BOT_ID;
    const isSelfBot = message.author.id === client.user.id;
    
    // Filter Source: Only log messages from users, or the target bot
    if (isSelfBot || (message.author.bot && !isTargetBot)) return;

    // --- LOGGING SESSION START ---
    if (!logState.isActive) {
        // Check for the 't-wordle' initiation command from a user
        if (!isTargetBot && message.content.toLowerCase().startsWith('t-wordle')) {
            await setLogState(db, { isActive: true, initiatorId: message.author.id, gameStartedAt: Date.now() });
            sessionStartTime.set(LOG_GAME_CHANNEL_ID, Date.now());
            cacheLogEntry(message, 'SESSION_START_COMMAND');
            console.log(`[LOGGER] SESSION START: Logging began in #${message.channel.name} by ${message.author.tag}.`); // New console log
            return;
        }
        return;
    }
    
    // --- LOGGING SESSION ACTIVE ---
    
    // Cache the created message
    cacheLogEntry(message, 'MESSAGE_CREATE');
    
    // --- LOGGING SESSION END ---
    if (isTargetBot && message.content && GAME_END_REGEX.test(message.content)) {
        console.log(`[LOGGER] SESSION END DETECTED: Game end message: "${message.content.substring(0, 50)}..." in #${message.channel.name}. Dumping logs.`); // New console log
        await endLoggingSession(client, db);
    }
}


// 2. Logs deleted messages
async function handleMessageDelete(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!message.guild || message.channel.id !== LOG_GAME_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;
    
    const logState = await getLogState(db);
    if (!logState.isActive) return;

    const isTargetBot = message.author.id === TARGET_BOT_ID;
    const isSelfBot = message.author.id === client.user.id;
    
    if (isSelfBot || (message.author.bot && !isTargetBot)) return;

    cacheLogEntry(message, 'MESSAGE_DELETE');
    console.log(`[LOGGER] Cached Message Delete (ID: ${message.id}) from #${message.channel.name}.`);
}

// 3. Logs edited messages
async function handleMessageUpdate(oldMessage, newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    if (!newMessage.guild || newMessage.channel.id !== LOG_GAME_CHANNEL_ID || !isFirestoreReady || !LOGGING_ENABLED) return;
    
    const logState = await getLogState(db);
    if (!logState.isActive) return;
    
    const isTargetBot = newMessage.author.id === TARGET_BOT_ID;
    const isSelfBot = newMessage.author.id === client.user.id;

    if (isSelfBot || (newMessage.author.bot && !isTargetBot)) return;
    
    // Ignore if content hasn't changed or if message is partial/bot message
    if (oldMessage.content === newMessage.content) return;

    const oldContent = oldMessage.content || 'CONTENT_UNAVAILABLE (Uncached Old)';
    
    cacheLogEntry(newMessage, 'MESSAGE_EDIT', oldContent);
    console.log(`[LOGGER] Cached Message Edit (ID: ${newMessage.id}) in #${newMessage.channel.name}.`);
}


module.exports = {
    // The main export for the 'messageCreate' event
    name: 'messageCreate', 
    once: false,
    execute: handleMessageCreate,

    // Export other handlers to be manually registered in index.js
    messageDelete: handleMessageDelete,
    messageUpdate: handleMessageUpdate,
    // Export the end function for manual command trigger
    endLoggingSession
};
