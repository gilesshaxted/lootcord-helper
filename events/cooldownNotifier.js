const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot that sends attack/farm messages
const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Channel to send debug notifications

// Weapon cooldown data in milliseconds [HH:MM:SS]
const WEAPON_COOLDOWNS_MS = {
    // Melee Weapons
    'bone knife': 15 * 60 * 1000 + 45 * 1000,
    'butcher knife': 21 * 60 * 1000 + 45 * 1000,
    'candy cane': 22 * 60 * 1000 + 9 * 1000,
    'chain saw': 52 * 60 * 1000 + 12 * 1000,
    'long sword': 36 * 60 * 1000 + 2 * 1000,
    'mace': 34 * 60 * 1000 + 3 * 1000,
    'machete': 25 * 60 * 60 * 1000 + 23 * 60 * 1000 + 0 * 1000, // 25 hours 23 minutes
    'pickaxe': 11 * 60 * 1000 + 38 * 1000,
    'pitchfork': 42 * 60 * 1000 + 32 * 1000,
    'rock': 9 * 60 * 1000 + 14 * 1000,
    'salvage cleaver': 21 * 60 * 1000 + 1 * 1000,
    'salvaged sword': 20 * 60 * 1000 + 43 * 1000,
    'sickle': 34 * 60 * 1000 + 10 * 1000,
    'snowball': 39 * 60 * 1000 + 12 * 1000,
    'stone spear': 29 * 60 * 1000 + 13 * 1000,
    'wooden spear': 15 * 60 * 1000 + 20 * 1000,

    // Ranged Weapons
    'bow': 26 * 60 * 1000 + 55 * 1000,
    'crossbow': 37 * 60 * 1000 + 12 * 1000,
    'f1 grenade': 39 * 60 * 1000 + 22 * 1000,
    'flame thrower': 51 * 60 * 1000 + 42 * 1000,
    'snowball gun': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'waterpipe shotgun': 45 * 60 * 1000 + 32 * 1000,
    'pump shotgun': 57 * 60 * 1000 + 12 * 1000,
    'spas-12': 1 * 60 * 60 * 1000 + 17 * 60 * 1000 + 0 * 1000,
    'm92': 38 * 60 * 1000 + 22 * 1000,
    'semi pistol': 35 * 60 * 1000 + 55 * 1000,
    'revolver': 30 * 60 * 1000 + 35 * 1000,
    'python': 1 * 60 * 60 * 1000 + 8 * 60 * 1000 + 0 * 1000,
    'mp5': 1 * 60 * 60 * 1000 + 6 * 60 * 1000 + 0 * 1000,
    'thompson': 52 * 60 * 1000 + 47 * 1000,
    'custom smg': 48 * 60 * 1000 + 4 * 1000,
    'semi rifle': 1 * 60 * 60 * 1000 + 5 * 60 * 1000 + 0 * 1000,
    'm39 rifle': 1 * 60 * 60 * 1000 + 12 * 60 * 1000 + 0 * 1000,
    'lr-300': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'm249': 2 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'bolt rifle': 2 * 60 * 60 * 1000 + 1 * 60 * 1000 + 0 * 1000,
    'assault rifle': 1 * 60 * 60 * 1000 + 16 * 60 * 1000 + 0 * 1000,
    'l96': 3 * 60 * 60 * 1000 + 37 * 60 * 1000 + 0 * 1000,
    'grenade launcher': 1 * 60 * 60 * 1000 + 45 * 60 * 1000 + 0 * 1000,
    'rocket launcher': 2 * 60 * 60 * 1000 + 24 * 60 * 1000 + 0 * 1000,
};

// NEW: Cooldown for farming activities (60 minutes)
const FARM_COOLDOWN_MS = 60 * 60 * 1000;

// Regex to capture player ID, enemy type, and weapon name for attack messages
const ATTACK_MESSAGE_REGEX = /^(?:<a?:.+?:\d+>|\S+)\s+\*\*<@(\d+)>\*\* hit the \*\*(.*?)\*\* for \*\*(?:\d+)\*\* damage using their\s+<a?:.+?:\d+>\s+`([^`]+)`/;

// NEW: Regex to capture player ID for farm messages
const FARM_MESSAGE_REGEX = /^You decide to\s+(?:scavenge for loot|go :axe: chop some trees|go :pick: mining).*and (?:find|receive|bring back).*<@(\d+)>/;


/**
 * Pings a user when their cooldown is over.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} userId The ID of the user to ping.
 * @param {string} channelId The ID of the channel to ping in.
 * @param {string} type The type of cooldown ('attack' or 'farm').
 * @param {string} item The name of the item/weapon.
 * @param {string} cooldownDocId The Firestore document ID for this cooldown.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
async function sendCooldownPing(client, db, userId, channelId, type, item, cooldownDocId, APP_ID_FOR_FIRESTORE) {
    // Determine which preference to check based on type
    const notificationType = type === 'attack' ? 'attackCooldown' : 'farmCooldown';
    const pingMessage = type === 'attack' ? `<@${userId}> your **${item}** attack cooldown is over!` : `<@${userId}> your **${item}** farming cooldown is over!`;

    const userPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), notificationType);
    const prefSnap = await getDoc(userPrefsRef);
    const isNotificationEnabled = prefSnap.exists() ? prefSnap.data().enabled : false; // Default to off

    if (!isNotificationEnabled) {
        console.log(`Cooldown Notifier: User ${userId} has opted out of ${type} cooldown pings. Not sending.`);
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId)); // Still remove from Firestore
        return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
        console.warn(`Cooldown Notifier: Channel ${channelId} not found or not text-based for ping. Removing cooldown entry.`);
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
        return;
    }

    try {
        await channel.send(pingMessage);
        console.log(`Cooldown Notifier: Sent ${type} cooldown ping to ${userId} for ${item} in #${channel.name}.`);
        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId)); // Remove from Firestore after pinging
        console.log(`Cooldown Notifier: Removed cooldown entry ${cooldownDocId} from Firestore.`);
    } catch (error) {
        console.error(`Cooldown Notifier: Failed to send ${type} cooldown ping in #${channel.name} for ${userId}/${item}:`, error);
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        console.log(`[Cooldown Notifier - Debug] Listener active. Message received from ${message.author.tag} (ID: ${message.author.id}) in #${message.channel.name}.`);

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[Cooldown Notifier - Debug] Ignoring message: Not from target game bot.`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Cooldown Notifier - Debug] Ignoring message: From self.`);
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
            console.log(`[Cooldown Notifier - Debug] Ignoring message: Not in a guild.`);
            return;
        }

        if (!isFirestoreReady) {
            console.warn('Cooldown Notifier: Firestore not ready. Skipping message processing.');
            return;
        }

        console.log(`[Cooldown Notifier - Debug] Message Content: \n\`\`\`\n${message.content}\n\`\`\``);

        let playerId = null;
        let item = null;
        let cooldownType = null;
        let cooldownDuration = undefined;

        // --- Attempt to match Attack Message ---
        const attackMatch = message.content.match(ATTACK_MESSAGE_REGEX);
        if (attackMatch) {
            playerId = attackMatch[1];
            item = attackMatch[3].toLowerCase(); // Weapon name
            cooldownType = 'attack';
            cooldownDuration = WEAPON_COOLDOWNS_MS[item];
            console.log(`[Cooldown Notifier - Debug] Attack Regex Match Result:`, attackMatch);
            console.log(`[Cooldown Notifier - Debug] Detected attack: Player ID=${playerId}, Weapon=${item}.`);
        }

        // --- NEW: Attempt to match Farm Message ---
        const farmMatch = message.content.match(FARM_MESSAGE_REGEX);
        if (farmMatch && !attackMatch) { // Only process as farm if not already an attack message
            playerId = farmMatch[1]; // Player ID is captured in farm regex
            item = 'farming'; // Generic item for farming cooldown
            cooldownType = 'farm';
            cooldownDuration = FARM_COOLDOWN_MS;
            console.log(`[Cooldown Notifier - Debug] Farm Regex Match Result:`, farmMatch);
            console.log(`[Cooldown Notifier - Debug] Detected farm: Player ID=${playerId}, Item=${item}.`);
        }


        if (playerId && item && cooldownType && cooldownDuration !== undefined) {
            // --- Debug Notification to specific channel (for both types) ---
            const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);
            if (notificationChannel && notificationChannel.isTextBased()) {
                try {
                    await notificationChannel.send(`Debug: <@${playerId}> initiated '${cooldownType}' with '${item}'`);
                    console.log(`Cooldown Notifier: Sent debug notification to #${notificationChannel.name}.`);
                } catch (error) {
                    console.error(`Cooldown Notifier: Failed to send debug notification to #${notificationChannel.name}:`, error);
                }
            } else {
                console.warn(`Cooldown Notifier: Debug notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
            }
            // --- END Debug Notification ---


            if (cooldownDuration === undefined) {
                console.log(`Cooldown Notifier: Unknown item "${item}" used for ${cooldownType}. No cooldown to track.`);
                return;
            }

            const cooldownEndsAt = Date.now() + cooldownDuration;
            // Cooldown Doc ID now includes type to differentiate attack/farm cooldowns for the same player/channel
            const cooldownDocId = `${playerId}_${message.channel.id}_${cooldownType}`;

            const activeCooldownsRef = collection(db, `ActiveCooldowns`); // Using a more generic collection name
            const cooldownDocRef = doc(activeCooldownsRef, cooldownDocId);

            try {
                await setDoc(cooldownDocRef, {
                    userId: playerId,
                    channelId: message.channel.id,
                    type: cooldownType, // Store type
                    item: item, // Store item/weapon
                    cooldownEndsAt: cooldownEndsAt,
                    originalMessageId: message.id,
                    guildId: message.guild.id,
                    pinged: false
                });
                console.log(`Cooldown Notifier: Stored ${cooldownType} cooldown for ${playerId} (${item}) in #${message.channel.id}. Ends at ${new Date(cooldownEndsAt).toLocaleString()}.`);

                const delay = cooldownEndsAt - Date.now();
                if (delay > 0) {
                    setTimeout(() => {
                        sendCooldownPing(client, db, playerId, message.channel.id, cooldownType, item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                    }, delay);
                } else {
                    sendCooldownPing(client, db, playerId, message.channel.id, cooldownType, item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                }
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
            } catch (error) {
                console.error(`Cooldown Notifier: Error storing/scheduling ${cooldownType} cooldown for ${playerId}/${item}:`, error);
            }
        } else {
            console.log(`[Cooldown Notifier - Debug] Message did not match any known cooldown regex. Content: "${message.content}"`);
        }
    },
    sendCooldownPing // Export sendCooldownPing for startupChecks
};
