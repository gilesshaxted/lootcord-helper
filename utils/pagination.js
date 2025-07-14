const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

// --- Pagination Specific Configuration (moved from index.js) ---
const CHANNELS_PER_PAGE = 25; // Max options for StringSelectMenuBuilder
const TARGET_CATEGORY_ID = '1192414248299675663'; // Your specified category ID

/**
 * Creates the content and components for a paginated channel selection message.
 * @param {Guild} guild The Discord guild object.
 * @param {number} currentPage The current page number (0-indexed).
 * @returns {Promise<{content: string, components: ActionRowBuilder[]}>} The message content and components.
 */
async function createChannelPaginationMessage(guild, currentPage) {
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
        label: channel.name,
        value: channel.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select-channels-to-set_page_${currentPage}`) // Embed page in custom ID
        .setPlaceholder(`Select channels (Page ${currentPage + 1}/${totalPages})...`)
        .setMinValues(1)
        .setMaxValues(selectOptions.length > 0 ? selectOptions.length : 1)
        .addOptions(selectOptions);

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
        components: [selectRow, buttonRow]
    };
}

module.exports = {
    createChannelPaginationMessage
};
