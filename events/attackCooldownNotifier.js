const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot that sends attack messages
const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Channel to send debug notifications

// Weapon cooldown data in milliseconds [HH:MM:SS]
const WEAPON_COOLDOWNS_MS = {
    // Melee Weapons
    'bone knife': 9 * 60 * 1000 + 5 * 1000,
    'butcher knife': 21 * 60 * 1000 + 45 * 1000,
    'candy cane': 22 * 60 * 1000 + 9 * 1000,
    'chain saw': 52 * 60 * 1000 + 12 * 1000,
    'long sword': 36 * 60 * 1000 + 2 * 1000,
    'mace': 34 * 60 * 1000 + 3 * 1000,
    'machete': 24 * 60 * 1000 + 23 * 1000,
    'pickaxe': 9 * 60 * 1000 + 18 * 1000,
    'pitchfork': 42 * 60 * 1000 + 32 * 1000,
    'rock': 7 * 60 * 1000 + 34 * 1000,
    'salvage cleaver': 19 * 60 * 1000 + 1 * 1000,
    'salvaged sword': 18 * 60 * 1000 + 43 * 1000,
    'sickle': 34 * 60 * 1000 + 10 * 1000,
    'snowball': 39 * 60 * 1000 + 12 * 1000,
    'stone spear': 29 * 60 * 1000 + 13 * 1000,
    'wooden spear': 8 * 60 * 1000 + 40 * 1000,

    // Ranged Weapons
    'bow': 28 * 60 * 1000 + 35 * 1000,
    'crossbow': 37 * 60 * 1000 + 12 * 1000,
    'f1 grenade': 31 * 60 * 1000 + 2 * 1000,
    'flame thrower': 58 * 60 * 1000 + 32 * 1000,
    'snowball gun': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 10 * 1000,
    'waterpipe shotgun': 45 * 60 * 1000 + 32 * 1000,
    'pump shotgun': 57 * 60 * 1000 + 12 * 1000,
    'spas-12': 1 * 60 * 60 * 1000 + 17 * 60 * 1000 + 42 * 1000,
    'm92': 45 * 60 * 1000 + 42 * 1000,
    'semi pistol': 35 * 60 * 1000 + 55 * 1000,
    'revolver': 30 * 60 * 1000 + 35 * 1000,
    'python': 1 * 60 * 60 * 1000 + 8 * 60 * 1000 + 40 * 1000,
    'mp5': 1 * 60 * 60 * 1000 + 6 * 60 * 1000 + 35 * 1000,
    'thompson': 52 * 60 * 1000 + 47 * 1000,
    'custom smg': 48 * 60 * 1000 + 4 * 1000,
    'semi rifle': 1 * 60 * 60 * 1000 + 5 * 60 * 1000 + 30 * 1000,
    'm39 rifle': 1 * 60 * 60 * 1000 + 12 * 60 * 1000 + 28 * 1000,
    'lr-300': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 50 * 1000,
    'm249': 2 * 60 * 60 * 1000 + 10 * 60 * 1000,
    'bolt rifle': 2 * 60 * 60 * 1000 + 1 * 60 * 1000,
    'assault rifle': 1 * 60 * 60 * 1000 + 16 * 60 * 1000,
    'l96': 3 * 60 * 60 * 1000 + 37 * 60 * 1000 + 45 * 1000,
    'grenade launcher': 1 * 60 * 60 * 1000 + 34 * 60 * 1000 + 15 * 1000,
    'rocket launcher': 2 * 60 * 60 * 1000 + 24 * 60 * 1000 + 40 * 1000,
};

// --- UPDATED REGEX: More robust to capture player ID, enemy type, and weapon name ---
// It now correctly handles the initial emoji and the full Discord emoji format for the weapon.
const ATTACK_MESSAGE_REGEX = /^(?:<a?:.+?:\d+>|\S+)\s+\*\*<@(\d+)>\*\* hit the \*\*(.*?)\*\* for \*\*(\d+)\*\* damage using their\s+<a?:.+?:\d+>\s+`([^`]+)`/;


/**
 * Pings a user when their attack cooldown is over.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} userId The ID of the user to ping.
 * @param {string} channelId The ID of the channel to ping in.
 * @param {string} weapon The name of the weapon.
 * @param {string} cooldownDocId The Firestore document ID for this cooldown.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
async function sendCooldownPing(client, db, userId, channelId, weapon, cooldownDocId, APP_ID_FOR_FIRESTORE) {
    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
        console.warn(`Attack Cooldown Notifier: Channel ${channelId} not found or not text-based for ping. Removing cooldown entry.`);
        await deleteDoc(doc(collection(db, `ActiveAttackCooldowns`), cooldownDocId));
        return;
    }

    try {
        await channel.send(`<@${userId}> your **${weapon}** attack cooldown is over!`);
        console.log(`Attack Cooldown Notifier: Sent cooldown ping to ${userId} for ${weapon} in #${channel.name}.`);
        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Use APP_ID_FOR_FIRESTORE
        await deleteDoc(doc(collection(db, `ActiveAttackCooldowns`), cooldownDocId)); // Remove from Firestore after pinging
        console.log(`Attack Cooldown Notifier: Removed cooldown entry ${cooldownDocId} from Firestore.`);
    } catch (error) {
        console.error(`Attack Cooldown Notifier: Failed to send cooldown ping in #${channel.name} for ${userId}/${weapon}:`, error);
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- NEW: Very early log to confirm listener is active and receiving messages ---
        console.log(`[Attack Cooldown Notifier - Debug] Listener active. Message received from ${message.author.tag} (ID: ${message.author.id}) in #${message.channel.name}.`);

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[Attack Cooldown Notifier - Debug] Ignoring message: Not from target game bot.`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Attack Cooldown Notifier - Debug] Ignoring message: From self.`);
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
            console.log(`[Attack Cooldown Notifier - Debug] Ignoring message: Not in a guild.`);
            return;
        }

        if (!isFirestoreReady) {
            console.warn('Attack Cooldown Notifier: Firestore not ready. Skipping message processing.');
            return;
        }

        // --- Debugging: Log the raw message content ---
        console.log(`[Attack Cooldown Notifier - Debug] Message Content: \n\`\`\`\n${message.content}\n\`\`\``);

        const match = message.content.match(ATTACK_MESSAGE_REGEX);
        // --- Debugging: Log the regex match result ---
        console.log(`[Attack Cooldown Notifier - Debug] Regex Match Result:`, match);


        if (match) {
            const playerId = match[1];
            const enemyType = match[2]; // Captured enemy type
            const weaponName = match[3].toLowerCase(); // Captured weapon name, convert to lowercase for map lookup
            const cooldownDuration = WEAPON_COOLDOWNS_MS[weaponName];

            console.log(`[Attack Cooldown Notifier - Debug] Detected attack: Player ID=${playerId}, Enemy=${enemyType}, Weapon=${weaponName}.`);

            // --- NEW: Debug Notification to specific channel ---
            const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);
            if (notificationChannel && notificationChannel.isTextBased()) {
                try {
                    await notificationChannel.send(`Debug: <@${playerId}> hit '${enemyType}' with '${weaponName}'`);
                    console.log(`Attack Cooldown Notifier: Sent debug notification to #${notificationChannel.name}.`);
                } catch (error) {
                    console.error(`Attack Cooldown Notifier: Failed to send debug notification to #${notificationChannel.name}:`, error);
                }
            } else {
                console.warn(`Attack Cooldown Notifier: Debug notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
            }
            // --- END NEW Debug Notification ---

            if (cooldownDuration === undefined) {
                console.log(`Attack Cooldown Notifier: Unknown weapon "${weaponName}" used. No cooldown to track.`);
                return;
            }

            const cooldownEndsAt = Date.now() + cooldownDuration;
            const cooldownDocId = `${playerId}_${message.channel.id}`; // Unique ID for this cooldown

            const activeCooldownsRef = collection(db, `ActiveAttackCooldowns`);
            const cooldownDocRef = doc(activeCooldownsRef, cooldownDocId);

            try {
                await setDoc(cooldownDocRef, {
                    userId: playerId,
                    channelId: message.channel.id,
                    weapon: weaponName,
                    cooldownEndsAt: cooldownEndsAt,
                    originalMessageId: message.id,
                    guildId: message.guild.id,
                    pinged: false // Track if ping has been sent
                });
                console.log(`Attack Cooldown Notifier: Stored cooldown for ${playerId} (${weaponName}) in #${message.channel.id}. Ends at ${new Date(cooldownEndsAt).toLocaleString()}.`);

                // Schedule the ping
                const delay = cooldownEndsAt - Date.now();
                if (delay > 0) {
                    setTimeout(() => {
                        sendCooldownPing(client, db, playerId, message.channel.id, weaponName, cooldownDocId, APP_ID_FOR_FIRESTORE); // Pass APP_ID_FOR_FIRESTORE
                    }, delay);
                } else {
                    // Cooldown already over (e.g., bot restarted, or very short cooldown)
                    sendCooldownPing(client, db, playerId, message.channel.id, weaponName, cooldownDocId, APP_ID_FOR_FIRESTORE); // Pass APP_ID_FOR_FIRESTORE
                }
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment help for tracking cooldown
            } catch (error) {
                console.error(`Attack Cooldown Notifier: Error storing/scheduling cooldown for ${playerId}/${weaponName}:`, error);
            }
        } else {
            console.log(`[Attack Cooldown Notifier - Debug] Message did not match regex. Content: "${message.content}"`);
        }
    },
    sendCooldownPing // Export sendCooldownPing for startupChecks
};
