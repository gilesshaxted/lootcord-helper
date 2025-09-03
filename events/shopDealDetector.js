const { collection, getDoc, doc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');

// --- Configuration ---
const TARGET_SHOP_BOT_ID = '1195112846976090322';

// Define item categories and their keywords (case-insensitive)
const ITEM_CATEGORIES = {
    RESOURCES: ['gunpowder', 'cloth', 'low grade fuel', 'high quality metal', 'metal spring'],
    LOOT: ['elite crate', 'metal armor', 'locked crate', 'large present', 'medium present', 'gold egg', 'egg basket', 'bronze egg', 'military crate', 'silver egg', 'supply drop', 'supply signal', 'small present', 'small loot bag', 'medium loot bag', 'large loot bag'],
    WEAPONS: ['c4', 'bolt rifle', 'f1 grenade', 'grenade launcher', 'l96', 'm249', 'mp5', 'spas-12', 'rocket launcher'],
    AMMO: ['12g slug', `hv pistol bullet`, 'pistol bullet', 'incen rifle bullet', 'incen pistol bullet', '40mm he grenade', 'rocket', 'explosive bullet', 'hv rifle bullet', 'hv rocket', 'rifle bullet', 'rocket'],
    MEDS: ['medical syringe', 'large med kit']
};

const ITEM_NAME_REGEX = /`([^`]+)`/g;

/**
 * Detects shop deals, identifies items, and pings roles.
 */
module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.author.id !== TARGET_SHOP_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        if (!message.guild) return;

        if (!isFirestoreReady) {
            console.warn('Shop Deal Detector: Firestore not ready. Skipping processing.');
            return;
        }

        const configDocRef = doc(collection(db, `BotConfigs`), 'mainConfig');
        const configSnap = await getDoc(configDocRef);

        if (!configSnap.exists()) {
            console.warn('Shop Deal Detector: BotConfigs/mainConfig document not found. Skipping shop deal detection.');
            return;
        }

        const botConfig = configSnap.data();
        const shopChannelId = botConfig.shopChannelId;
        const pingRoleIds = botConfig.pingRoleIds || {};

        if (message.channel.id !== shopChannelId) {
            return;
        }

        if (message.embeds.length > 0 && message.embeds[0].description) {
            const embed = message.embeds[0];
            const embedDescription = embed.description;

            console.log(`\n--- [Shop Deal Detector - Debug] Incoming Shop Message ---`);
            console.log(`From: ${message.author.tag} (ID: ${message.author.id})`);
            console.log(`Channel: #${message.channel.name} (ID: ${message.channel.id})`);
            console.log(`Embed Description: \n\`\`\`\n${embedDescription}\n\`\`\``);

            const detectedItemsAndCategories = new Map();

            let match;
            ITEM_NAME_REGEX.lastIndex = 0;

            while ((match = ITEM_NAME_REGEX.exec(embedDescription)) !== null) {
                const itemName = match[1].toLowerCase();

                for (const category in ITEM_CATEGORIES) {
                    if (ITEM_CATEGORIES[category].includes(itemName)) {
                        if (!detectedItemsAndCategories.has(category)) {
                            detectedItemsAndCategories.set(category, []);
                        }
                        detectedItemsAndCategories.get(category).push(itemName);
                        console.log(`[Shop Deal Detector - Debug] Detected item "${itemName}" in category "${category}".`);
                        break;
                    }
                }
            }

            if (detectedItemsAndCategories.size > 0) {
                let pingMessageContent = '';
                detectedItemsAndCategories.forEach((items, category) => {
                    const roleId = pingRoleIds[category];
                    if (roleId) {
                        const itemNames = items.map(item => `\`${item}\``).join(', ');
                        pingMessageContent += `<@&${roleId}> **${category}**: ${itemNames}\n`;
                    } else {
                        console.warn(`Shop Deal Detector: No role ID configured for category: ${category}`);
                    }
                });

                if (pingMessageContent.trim().length > 0) {
                    try {
                        await message.channel.send({ content: pingMessageContent.trim() });
                        console.log(`Shop Deal Detector: Sent pings for categories: ${Array.from(detectedItemsAndCategories.keys()).join(', ')}`);
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
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
