const { EmbedBuilder } = require('discord.js');
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const stickyMessageManager = require('../utils/stickyMessageManager'); // Import stickyMessageManager

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot that sends attack/farm/med/vote/repair messages
const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Channel to send debug notifications

// Regex to detect mob spawn messages
const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;
const MOB_KILLED_MESSAGE_REGEX = /You killed the \*\*(.*?)\*\*!/i;
const MOB_ESCAPED_MESSAGE_REGEX = /The \*\*(.*?)\*\* has escaped!/i;

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            return;
        }
        if (!isFirestoreReady) {
            console.warn('MobDetect: Firestore DB not ready. Skipping message processing.');
            return;
        }

        console.log(`[MobDetect - Debug] Message received from game bot in #${message.channel.name}: ${message.content}`);

        // --- Detect Mob Spawn ---
        const mobSpawnMatch = message.content.match(MOB_MESSAGE_REGEX);
        if (mobSpawnMatch) {
            const mobName = mobSpawnMatch[1];
            console.log(`[MobDetect] Detected mob spawn: ${mobName} in #${message.channel.name}`);
            // You can add further logic here, e.g., send a notification to a specific channel
            // For now, we'll just log it.
        }

        // --- Detect Mob Killed or Escaped (NEW LOGIC) ---
        const mobKilledMatch = message.content.match(MOB_KILLED_MESSAGE_REGEX);
        const mobEscapedMatch = message.content.match(MOB_ESCAPED_MESSAGE_REGEX);

        if (mobKilledMatch || mobEscapedMatch) {
            const mobName = mobKilledMatch ? mobKilledMatch[1] : mobEscapedMatch[1];
            const eventType = mobKilledMatch ? 'killed' : 'escaped';
            console.log(`[MobDetect] Detected mob ${eventType}: ${mobName} in #${message.channel.name}. Attempting to remove solo sticky message.`);

            try {
                // Attempt to remove the solo sticky message for this channel
                await stickyMessageManager.removeStickyMessage(message.channel.id, db);
                console.log(`[MobDetect] Successfully removed solo sticky message for channel ${message.channel.id}.`);
            } catch (error) {
                console.error(`[MobDetect] Error removing solo sticky message for channel ${message.channel.id}:`, error);
            }
        }
    },
};
