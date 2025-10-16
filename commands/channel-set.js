const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
// Assuming createChannelPaginationMessage is available via the interactionHandler context,
// but for the command file itself, we only need the builders.

// Define how many channels to show per page in the dropdown
const CHANNELS_PER_PAGE = 25; 

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('channel-set')
        .setDescription('Opens a paginated menu to select multiple channels from a specific category.'),

    // IMPORTANT: The execute function must be fixed to use the external logic for creation
    // The createChannelPaginationMessage utility already exists in your repo (utils/pagination.js).
    async execute(interaction, db, client) { // Client argument is needed to fetch the guild cache
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;

        if (!guild) {
            return await interaction.editReply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
        }
        
        // --- NOTE: TARGET_CATEGORY_ID definition is moved to the pagination utility,
        // but for now, we'll keep the logic here for immediate compatibility.
        const TARGET_CATEGORY_ID = '1192414248299675663'; // Your specified category ID

        // Fetch all channels in the guild and filter them by category and type
        const allChannelsInTargetCategory = guild.channels.cache.filter(channel =>
            channel.parentId === TARGET_CATEGORY_ID &&
            channel.type === ChannelType.GuildText 
        ).sort((a, b) => a.position - b.position);

        // Handle case where no channels are found in the category
        if (allChannelsInTargetCategory.size === 0) {
            return await interaction.editReply({
                content: `No text channels found in the specified category (<#${TARGET_CATEGORY_ID}>) that the bot can see.`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        // We replicate the core logic of createChannelPaginationMessage for the initial call, 
        // ensuring the components are correct for the select menu.
        const totalChannels = allChannelsInTargetCategory.size;
        const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
        let currentPage = 0;

        const channelsForPage = allChannelsInTargetCategory.toJSON().slice(
            currentPage * CHANNELS_PER_PAGE,
            (currentPage + 1) * CHANNELS_PER_PAGE
        );

        const selectOptions = channelsForPage.map(channel => ({
            label: channel.name,
            value: channel.id,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select-channels-to-set_page_${currentPage}`)
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

        // Send the message with the dropdown and buttons.
        await interaction.editReply({
            content: contentMessage,
            components: [selectRow, buttonRow],
            flags: MessageFlags.Ephemeral
        });
    },
};
