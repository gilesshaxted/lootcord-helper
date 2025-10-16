const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, getDoc, doc, collection } = require('discord.js');

// --- Pagination Specific Configuration ---
const CHANNELS_PER_PAGE = 25; // Max options for StringSelectMenuBuilder
const TARGET_CATEGORY_ID = '1192414248299675663'; // Category ID for filtering

/**
 * Fetches all currently configured channel objects from the Guild document array.
 * This replaces the need to iterate through a subcollection.
 * NOTE: This function requires 'db' to be passed in the Interaction context.
 * @param {object} db The Firestore database instance.
 * @param {string} guildId The ID of the guild.
 * @returns {Promise<Array<object>>} Array of configured channel objects, or empty array.
 */
async function getAllConfiguredChannels(db, guildId) {
    if (!db) return [];
    try {
        const guildDocRef = doc(collection(db, `Guilds`), guildId);
        const docSnap = await getDoc(guildDocRef);
        return docSnap.exists() && docSnap.data().configuredChannels
            ? docSnap.data().configuredChannels
            : [];
    } catch (error) {
        console.error(`Pagination Helper: Error fetching configuredChannels array for guild ${guildId}:`, error);
        return [];
    }
}

/**
 * Creates the content and components for a paginated channel selection message.
 * @param {Guild} guild The Discord guild object.
 * @param {number} currentPage The current page number (0-indexed).
 * @param {object} db The Firestore database instance. // Must pass DB now
 * @returns {Promise<{content: string, components: ActionRowBuilder[]}>} The message content and components.
 */
async function createChannelPaginationMessage(guild, currentPage, db) {
    // 1. Fetch current configured channels (using new array structure)
    const configuredChannelIds = new Set((await getAllConfiguredChannels(db, guild.id)).map(c => c.channelId));

    // 2. Filter all guild channels by target category
    const allChannelsInTargetCategory = guild.channels.cache.filter(channel =>
        channel.parentId === TARGET_CATEGORY_ID &&
        channel.type === ChannelType.GuildText
    ).sort((a, b) => a.position - b.position);

    const totalChannels = allChannelsInTargetCategory.size;
    const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);

    if (totalChannels === 0) {
        return {
            content: `No text channels found in the specified category (<#${TARGET_CATEGORY_ID}>) that the bot can see.`,
            components: []
        };
    }

    // Ensure currentPage is within bounds
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;

    const channelsForPage = allChannelsInTargetCategory.toJSON().slice(
        currentPage * CHANNELS_PER_PAGE,
        (currentPage + 1) * CHANNELS_PER_PAGE
    );

    const selectOptions = channelsForPage.map(channel => ({
        // Use the check emoji to indicate pre-selected channels
        label: configuredChannelIds.has(channel.id) ? `✅ ${channel.name}` : channel.name,
        value: channel.id,
        default: configuredChannelIds.has(channel.id) // Pre-select the channels already configured
    }));

    // Create a StringSelectMenu component.
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select-channels-to-set_page_${currentPage}`) // Embed page in custom ID
        .setPlaceholder(`Select channels (Page ${currentPage + 1}/${totalPages})...`)
        .setMinValues(0) // Allow deselection
        .setMaxValues(selectOptions.length > 0 ? selectOptions.length : 1)
        .addOptions(selectOptions);

    // Create navigation buttons
    const prevButton = new ButtonBuilder()
        .setCustomId(`page_prev_${currentPage}`)
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`page_next_${currentPage}`)
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

    let contentMessage = `Please select channels from the category (<#${TARGET_CATEGORY_ID}>). Page ${currentPage + 1} of ${totalPages}:`;
    if (totalChannels > CHANNELS_PER_PAGE) {
        contentMessage += `\n(Showing ${channelsForPage.length} of ${totalChannels} channels)`;
    }

    return {
        content: contentMessage,
        components: [selectRow, buttonRow],
        configuredChannelIds // Return this set for use in the message handler
    };
}

// Export the helper to fetch all configured channels for use in the interaction handler
module.exports = {
    createChannelPaginationMessage,
    getAllConfiguredChannels
};
