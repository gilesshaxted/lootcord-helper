const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js'); // Added ButtonBuilder, ButtonStyle

// Define how many channels to show per page in the dropdown
const CHANNELS_PER_PAGE = 25; // Max options for StringSelectMenuBuilder

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('channel-set')
        .setDescription('Opens a paginated menu to select multiple channels from a specific category.'),

    // The execute function now sends a message with a StringSelectMenu
    // containing only channels from the specified category for the current page.
    async execute(interaction, db) { // db is still passed, but not used directly in this part of the command
        // Defer the reply to acknowledge the interaction immediately.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;

        if (!guild) {
            return await interaction.editReply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
        }

        // --- Define the target category ID ---
        const TARGET_CATEGORY_ID = '1192414248299675663'; // Your specified category ID

        // Fetch all channels in the guild and filter them by category and type
        const allChannelsInTargetCategory = guild.channels.cache.filter(channel =>
            channel.parentId === TARGET_CATEGORY_ID &&
            channel.type === ChannelType.GuildText // Ensure it's a text channel
        ).sort((a, b) => a.position - b.position); // Sort by Discord's channel position

        // Handle case where no channels are found in the category
        if (allChannelsInTargetCategory.size === 0) {
            return await interaction.editReply({
                content: `No text channels found in the specified category (<#${TARGET_CATEGORY_ID}>) that the bot can see.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Calculate pagination details
        const totalChannels = allChannelsInTargetCategory.size;
        const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
        let currentPage = 0; // Start on the first page (index 0)

        // Get channels for the current page
        const channelsForPage = allChannelsInTargetCategory.toJSON().slice(
            currentPage * CHANNELS_PER_PAGE,
            (currentPage + 1) * CHANNELS_PER_PAGE
        );

        // Map filtered channels to options for the StringSelectMenuBuilder
        const selectOptions = channelsForPage.map(channel => ({
            label: channel.name,
            value: channel.id,
        }));

        // Create a StringSelectMenu component.
        const selectMenu = new StringSelectMenuBuilder()
            // Custom ID now includes the current page to allow index.js to track state
            .setCustomId(`select-channels-to-set_page_${currentPage}`)
            .setPlaceholder(`Select channels (Page ${currentPage + 1}/${totalPages})...`)
            .setMinValues(1)
            .setMaxValues(selectOptions.length > 0 ? selectOptions.length : 1) // Allow selecting up to all displayed options
            .addOptions(selectOptions);

        // Create navigation buttons
        const prevButton = new ButtonBuilder()
            .setCustomId(`page_prev_${currentPage}`)
            .setLabel('Previous Page')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0); // Disable if on the first page

        const nextButton = new ButtonBuilder()
            .setCustomId(`page_next_${currentPage}`)
            .setLabel('Next Page')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages - 1); // Disable if on the last page

        // Create ActionRows for the select menu and buttons
        const selectRow = new ActionRowBuilder()
            .addComponents(selectMenu);

        const buttonRow = new ActionRowBuilder()
            .addComponents(prevButton, nextButton);

        let contentMessage = `Please select channels from the category (<#${TARGET_CATEGORY_ID}>). Page ${currentPage + 1} of ${totalPages}:`;
        if (totalChannels > CHANNELS_PER_PAGE) {
            contentMessage += `\n(Showing ${channelsForPage.length} of ${totalChannels} channels)`;
        }

        // Send the message with the dropdown and buttons.
        await interaction.editReply({
            content: contentMessage,
            components: [selectRow, buttonRow], // Include both rows
            flags: MessageFlags.Ephemeral
        });
    },
};
