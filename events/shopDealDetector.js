const { collection, getDoc, doc } = require('firebase/firestore'); // For fetching config
const statsTracker = require('../utils/statsTracker'); // For incrementing helps

// --- Configuration ---
const TARGET_SHOP_BOT_ID = '1195112846976090322'; // User ID of the Lootcord Workshop bot

// Define item categories and their keywords (case-insensitive)
const ITEM_CATEGORIES = {
    RESOURCES: ['gunpowder', 'cloth', 'low grade fuel', 'high quality metal', 'metal spring'],
    LOOT: ['elite crate', 'locked crate', 'large present', 'medium present', 'gold egg', 'egg basket', 'bronze egg', 'military crate', 'silver egg', 'supply drop', 'supply signal', 'small present', 'small loot bag', 'medium loot bag', 'large loot bag'],
    WEAPONS: ['c4', 'blt rifle', 'f1 grenade', 'grenade launcher', 'l96', 'm249', 'mp5', 'spas-12', 'rocket launcher'],
    AMMO: ['12g slug', `hv pistol bullet`, '40mm he grenade', 'rocket', 'explosive bullet', 'hv rifle bullet', 'hv rocket', 'rifle bullet', 'rocket'],
    MEDS: ['medical syringe', 'large med kit']
};

// Regex to extract item names from the embed description
// It looks for text within backticks (`) after an emoji or at the start of a line.
const ITEM_NAME_REGEX = /`([^`]+)`/g;

/**
 * Detects shop deals, identifies items, and pings roles.
 */
module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages not from the target shop bot or from this bot itself
        if (message.author.id !== TARGET_SHOP_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Shop Deal Detector: Firestore not ready. Skipping processing.');
            return;
        }

        // Fetch bot configuration for the shop channel and ping roles
        const configDocRef = doc(collection(db, `BotConfigs`), 'mainConfig');
        const configSnap = await getDoc(configDocRef);

        if (!configSnap.exists()) {
            console.warn('Shop Deal Detector: BotConfigs/mainConfig document not found. Skipping shop deal detection.');
            return;
        }

        const botConfig = configSnap.data();
        const shopChannelId = botConfig.shopChannelId;
        const pingRoleIds = botConfig.pingRoleIds || {}; // { RESOURCES: 'role_id', ... }

        // Only process messages in the configured shop channel
        if (message.channel.id !== shopChannelId) {
            // console.log(`Shop Deal Detector: Ignoring message in non-shop channel #${message.channel.name}`); // Too verbose
            return;
        }

        // Check if the message has an embed and a description (where items are listed)
        if (message.embeds.length > 0 && message.embeds[0].description) {
            const embed = message.embeds[0];
            const embedDescription = embed.description;

            console.log(`\n--- [Shop Deal Detector - Debug] Incoming Shop Message ---`);
            console.log(`From: ${message.author.tag} (ID: ${message.author.id})`);
            console.log(`Channel: #${message.channel.name} (ID: ${message.channel.id})`);
            console.log(`Embed Description: \n\`\`\`\n${embedDescription}\n\`\`\``);

            const detectedCategories = new Set(); // Use a Set to store unique categories to ping

            let match;
            ITEM_NAME_REGEX.lastIndex = 0; // Reset regex index for multiple matches

            while ((match = ITEM_NAME_REGEX.exec(embedDescription)) !== null) {
                const itemName = match[1].toLowerCase(); // Extract item name and convert to lowercase

                // Check against each predefined category
                for (const category in ITEM_CATEGORIES) {
                    if (ITEM_CATEGORIES[category].includes(itemName)) {
                        detectedCategories.add(category);
                        console.log(`[Shop Deal Detector - Debug] Detected item "${itemName}" in category "${category}".`);
                        break; // Found category for this item, move to next item
                    }
                }
            }

            // Ping roles for detected categories
            if (detectedCategories.size > 0) {
                let pingMessageContent = '';
                detectedCategories.forEach(category => {
                    const roleId = pingRoleIds[category];
                    if (roleId) {
                        pingMessageContent += `<@&${roleId}> `;
                    } else {
                        console.warn(`Shop Deal Detector: No role ID configured for category: ${category}`);
                    }
                });

                if (pingMessageContent.trim().length > 0) {
                    try {
                        await message.channel.send({ content: pingMessageContent.trim() });
                        console.log(`Shop Deal Detector: Sent pings for categories: ${Array.from(detectedCategories).join(', ')}`);
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for sending pings
                    } catch (error) {
                        console.error(`Shop Deal Detector: Failed to send ping message in #${message.channel.name}:`, error);
                    }
                } else {
                    console.log(`Shop Deal Detector: Detected items but no valid role IDs configured for pinging.`);
                }
            } else {
                console.log(`Shop Deal Detector: No configured items detected in shop deal message.`);
            }
            console.log(`--- End Shop Deal Detector Message Processing ---\n`);
        }
    },
};
