const fs = require('fs');
const path = require('path');

// Logging Configuration Variables
// 1. Variable to enable/disable logging
const LOGGING_ENABLED = true; 
// 2. Placeholder for a log channel ID (currently not used for file logging)
const LOG_CHANNEL_ID = '1429872409233850478'; 

/**
 * Creates the required log directory structure (logs/YYYY-MM-DD) and appends a log entry to the hourly file (HH.txt).
 * @param {string} logEntry The raw log line to append.
 */
function writeLogToFile(logEntry) {
    const now = new Date();
    // YYYY-MM-DD format for folder name
    const dateFolder = now.toISOString().substring(0, 10); 
    // HH format for file name
    const hourFile = now.getHours().toString().padStart(2, '0'); 

    // Construct the full directory path relative to the bot's execution location
    const logDir = path.join(process.cwd(), 'logs', dateFolder);
    const filePath = path.join(logDir, `${hourFile}.txt`);

    try {
        // Ensure the directory exists. { recursive: true } creates intermediate folders.
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Append the log entry followed by a newline character
        fs.appendFileSync(filePath, logEntry + '\n');
    } catch (error) {
        console.error(`[LOGGER] Failed to write log to file:`, error);
    }
}

/**
 * Formats a Discord message into a raw, parsable log entry.
 * NOTE: For messageDelete, message content/author might be partial/unavailable if uncached.
 * @param {import('discord.js').Message} message The Discord message object (or partial object).
 * @param {string} actionType A short description of the action (e.g., 'MESSAGE_DELETE').
 * @returns {string} The raw log line.
 */
function generateLogEntry(message, actionType) {
    const now = new Date();
    // Timestamp format: YYYY-MM-DD HH:MM:SS
    const timestamp = now.toISOString().replace(/T/, ' ').substring(0, 19);
    
    // Check if guild and author properties are available (may be missing for uncached messages)
    const guildId = message.guild ? message.guild.id : 'N/A';
    const channelId = message.channel ? message.channel.id : 'N/A';
    const userId = message.author ? message.author.id : 'N/A (Uncached)';
    
    // Use message content if available, otherwise use a placeholder
    const content = message.content 
        ? message.content.replace(/[\r\n]/g, ' \\n ')
        : 'CONTENT_UNAVAILABLE'; 

    return `[${timestamp}] [GUILD:${guildId}] [CHANNEL:${channelId}] [USER:${userId}] [ACTION:${actionType}] | ${content}`;
}

module.exports = {
    // This event listens for a message being deleted
    name: 'messageDelete', 
    once: false,
    async execute(message) {
        // Only proceed if logging is enabled globally
        if (!LOGGING_ENABLED) {
            return;
        }

        // Ignore partial messages or messages not from a guild
        if (!message.guild || message.partial) {
            return;
        }

        // Log the deletion action
        const logEntry = generateLogEntry(message, 'MESSAGE_DELETE');
        writeLogToFile(logEntry);
        
        console.log(`[LOGGER] Logged Message Delete from #${message.channel.name}`);
    },
};
