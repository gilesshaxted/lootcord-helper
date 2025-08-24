const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot that sends attack/farm/med/vote/repair messages
const NOTIFICATION_CHANNEL_ID = '1329235188907114506'; // Channel to send debug notifications

// Cooldown data in milliseconds [HH:MM:SS]
const COOLDOWN_DURATIONS_MS = {
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

    // Med Cooldowns
    'bandage': 16 * 60 * 1000 + 7 * 1000,
    'medical syringe': 28 * 60 * 1000 + 16 * 1000,
    'large medkit': 44 * 60 * 1000 + 42 * 1000,

    // Farm Cooldown
    'farming': 60 * 60 * 1000, // 60 minutes

    // Vote Cooldown
    'voting': 12 * 60 * 60 * 1000, // 12 hours

    // NEW: Repair Cooldowns
    'wood': 2 * 60 * 1000, // 2 minutes
    'stone': 10 * 60 * 1000, // 10 minutes
    'metal': 25 * 60 * 1000, // 25 minutes
    'high quality metal': 60 * 60 * 1000 // 60 minutes
};

// Regex to capture player ID, enemy type, and weapon name for attack messages
const ATTACK_MESSAGE_REGEX = /^(?:<a?:.+?:\d+>|\S+)\s+\*\*<@(\d+)>\*\* hit the \*\*(.*?)\*\* for \*\*(?:\d+)\*\* damage using their\s+<a?:.+?:\d+>\s+`([^`]+)`/;

// Regex to capture player ID for farm messages
const FARM_MESSAGE_REGEX = /^You decide to\s+(?:scavenge for loot|go :axe: chop some trees|go :pick: mining).*<@(\d+)>/;

// Regex to capture player ID and med type for med messages
const MED_MESSAGE_REGEX = /^You use your\s+<a?:.+?:\d+>\s+`([^`]+)` to heal for \*\*(?:\d+)\*\* health! You now have.*<@(\d+)>/;

// Regex to capture player ID for vote messages
const VOTE_MESSAGE_REGEX = /^\S+\s+\*\*<@(\d+)>\*\* received rewards for voting!/;

// NEW: Regex to capture player ID and repair item for clan repair messages
const REPAIR_MESSAGE_REGEX = /:white_check_mark: You used 1x\s+<a?:.+?:\d+>\s+`([^`]+)` to repair the clan!.*The clan can be repaired again in (?:\d+ (?:minute|hour)s?\.?)/s;


/**
 * Pings a user when their cooldown is over.
 * @param {Client} client The Discord client instance.
 * @param {object} db The Firestore database instance.
 * @param {string} userId The ID of the user to ping.
 * @param {string} channelId The ID of the channel to ping in.
 * @param {string} type The type of cooldown ('attack', 'farm', 'med', 'vote', 'repair').
 * @param {string} item The name of the item/weapon/activity.
 * @param {string} cooldownDocId The Firestore document ID for this cooldown.
 * @param {string} APP_ID_FOR_FIRESTORE The application ID for Firestore path.
 */
async function sendCooldownPing(client, db, userId, channelId, type, item, cooldownDocId, APP_ID_FOR_FIRESTORE) {
    // Determine which preference to check based on type
    let notificationType;
    let pingMessage;

    switch (type) {
        case 'attack':
            notificationType = 'attackCooldown';
            pingMessage = `<@${userId}> your **${item}** attack cooldown is over!`;
            break;
        case 'farm':
            notificationType = 'farmCooldown';
            pingMessage = `<@${userId}> your **${item}** farming cooldown is over!`;
            break;
        case 'med':
            notificationType = 'medCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`;
            break;
        case 'vote':
            notificationType = 'voteCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`;
            break;
        case 'repair': // NEW: Repair cooldown type
            notificationType = 'repairCooldown';
            pingMessage = `<@${userId}> your **clan repair (${item})** cooldown is over!`;
            break;
        default:
            console.warn(`Cooldown Notifier: Unknown cooldown type "${type}". Cannot send ping.`);
            await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
            return;
    }

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

        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[Cooldown Notifier - Debug] Ignoring message: Not from target game bot.`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Cooldown Notifier - Debug] Ignoring message: From self.`);
            return;
        }

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
            cooldownDuration = COOLDOWN_DURATIONS_MS[item];
            console.log(`[Cooldown Notifier - Debug] Attack Regex Match Result:`, attackMatch);
            console.log(`[Cooldown Notifier - Debug] Detected attack: Player ID=${playerId}, Weapon=${item}.`);
        }

        // --- Attempt to match Farm Message (only if not an attack message) ---
        const farmMatch = message.content.match(FARM_MESSAGE_REGEX);
        if (farmMatch && !attackMatch) { // Only process as farm if not already an attack message
            playerId = farmMatch[1]; // Player ID is captured in farm regex
            item = 'farming'; // Generic item for farming cooldown
            cooldownType = 'farm';
            cooldownDuration = COOLDOWN_DURATIONS_MS['farming'];
            console.log(`[Cooldown Notifier - Debug] Farm Regex Match Result:`, farmMatch);
            console.log(`[Cooldown Notifier - Debug] Detected farm: Player ID=${playerId}, Item=${item}.`);
        }

        // --- Attempt to match Med Message (only if not attack or farm) ---
        const medMatch = message.content.match(MED_MESSAGE_REGEX);
        if (medMatch && !attackMatch && !farmMatch) {
            item = medMatch[1].toLowerCase(); // Med item name
            playerId = medMatch[2]; // Player ID is captured in med regex
            cooldownType = 'med';
            cooldownDuration = COOLDOWN_DURATIONS_MS[item];
            console.log(`[Cooldown Notifier - Debug] Med Regex Match Result:`, medMatch);
            console.log(`[Cooldown Notifier - Debug] Detected med usage: Player ID=${playerId}, Item=${item}.`);
        }

        // --- Attempt to match Vote Message (only if not attack, farm, or med) ---
        const voteMatch = message.embeds.length > 0 && message.embeds[0].title === 'Voting rewards';
        if (voteMatch && !attackMatch && !farmMatch && !medMatch) {
            // The user ID for voting rewards is typically in the message content, not the embed title
            const votePlayerIdMatch = message.content.match(/\*\*<@(\d+)>\*\* received rewards for voting!/);
            if (votePlayerIdMatch && votePlayerIdMatch[1]) {
                playerId = votePlayerIdMatch[1];
                item = 'voting'; // Generic item for vote cooldown
                cooldownType = 'vote';
                cooldownDuration = COOLDOWN_DURATIONS_MS['voting'];
                console.log(`[Cooldown Notifier - Debug] Vote Regex Match Result:`, votePlayerIdMatch);
                console.log(`[Cooldown Notifier - Debug] Detected vote: Player ID=${playerId}, Item=${item}.`);
            } else {
                console.warn(`[Cooldown Notifier - Debug] Vote rewards embed found, but player ID not found in content.`);
            }
        }

        // --- NEW: Attempt to match Repair Message (only if not attack, farm, med, or vote) ---
        const repairMatch = message.content.match(REPAIR_MESSAGE_REGEX);
        if (repairMatch && !attackMatch && !farmMatch && !medMatch && !voteMatch) {
            item = repairMatch[1].toLowerCase(); // Repair item name (wood, stone, metal, high quality metal)
            // The player ID for repair is not directly in the regex, need to extract from message.content
            const repairPlayerIdMatch = message.content.match(/<@(\d+)>/);
            if (repairPlayerIdMatch && repairPlayerIdMatch[1]) {
                playerId = repairPlayerIdMatch[1];
                cooldownType = 'repair';
                cooldownDuration = COOLDOWN_DURATIONS_MS[item];
                console.log(`[Cooldown Notifier - Debug] Repair Regex Match Result:`, repairMatch);
                console.log(`[Cooldown Notifier - Debug] Detected repair: Player ID=${playerId}, Item=${item}.`);
            } else {
                console.warn(`[Cooldown Notifier - Debug] Repair message found, but player ID not found in content.`);
            }
        }


        if (playerId && item && cooldownType && cooldownDuration !== undefined) {
            // --- Debug Notification to specific channel (for all types) ---
            // const notificationChannel = client.channels.cache.get(NOTIFICATION_CHANNEL_ID);
            // if (notificationChannel && notificationChannel.isTextBased()) {
            //     try {
            //         await notificationChannel.send(`Debug: <@${playerId}> initiated '${cooldownType}' with '${item}'`);
            //         console.log(`Cooldown Notifier: Sent debug notification to #${notificationChannel.name}.`);
            //     } catch (error) {
            //         console.error(`Cooldown Notifier: Failed to send debug notification to #${notificationChannel.name}:`, error);
            //     }
            // } else {
            //     console.warn(`Cooldown Notifier: Debug notification channel with ID ${NOTIFICATION_CHANNEL_ID} not found or not a text channel.`);
            // }
            // --- END Debug Notification ---


            if (cooldownDuration === undefined) {
                console.log(`Cooldown Notifier: Unknown item "${item}" used for ${cooldownType}. No cooldown to track.`);
                return;
            }

            const cooldownEndsAt = Date.now() + cooldownDuration;
            // Cooldown Doc ID now includes type to differentiate cooldowns for the same player/channel
            const cooldownDocId = `${playerId}_${message.channel.id}_${cooldownType}`;

            const activeCooldownsRef = collection(db, `ActiveCooldowns`); // Using a more generic collection name
            const cooldownDocRef = doc(activeCooldownsRef, cooldownDocId);

            try {
                await setDoc(cooldownDocRef, {
                    userId: playerId,
                    channelId: message.channel.id,
                    type: cooldownType, // Store type
                    item: item, // Store item/weapon/activity
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
