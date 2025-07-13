const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js'); // Changed to StringSelectMenuBuilder

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('channel-set')
        .setDescription('Opens a menu to select multiple channels from a specific category.'),

    // The execute function now sends a message with a StringSelectMenu
    // containing only channels from the specified category.
    async execute(interaction, db) { // db is still passed, but not used directly in this part of the command
        // Defer the reply to acknowledge the interaction immediately.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;

        if (!guild) {
            return await interaction.editReply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
        }

        // --- Define the target category ID ---
        const TARGET_CATEGORY_ID = '1192414248299675663'; // Your specified category ID

        // Fetch all channels in the guild and filter them
        const channelsInTargetCategory = guild.channels.cache.filter(channel =>
            channel.parentId === TARGET_CATEGORY_ID &&
            channel.type === ChannelType.GuildText // Ensure it's a text channel
        );

        // Map filtered channels to options for the StringSelectMenuBuilder
        const selectOptions = channelsInTargetCategory.map(channel => ({
            label: channel.name,
            value: channel.id,
        }));

        // Handle case where no channels are found in the category
        if (selectOptions.length === 0) {
            return await interaction.editReply({
                content: `No text channels found in the specified category (<#${TARGET_CATEGORY_ID}>) that the bot can see.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Discord's StringSelectMenuBuilder has a limit of 25 options.
        // If there are more, we'll only display the first 25.
        const displayedOptions = selectOptions.slice(0, 25);
        const maxSelectableValues = Math.min(displayedOptions.length, 25); // Max user can select

        // Create a StringSelectMenu component.
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select-channels-to-set') // Unique ID for this specific dropdown
            .setPlaceholder('Select channels...')
            .setMinValues(1) // User must select at least one channel
            .setMaxValues(maxSelectableValues) // User can select up to the number of displayed options (max 25)
            .addOptions(displayedOptions); // Add the filtered options

        // Create an ActionRow to hold the select menu.
        const row = new ActionRowBuilder()
            .addComponents(selectMenu);

        let contentMessage = 'Please select the channels you want to set from the category:';
        if (selectOptions.length > 25) {
            contentMessage += `\n(Only the first 25 channels are displayed due to Discord's UI limitations. If you need to set more, please run the command again.)`;
        }

        // Send the message with the dropdown.
        await interaction.editReply({
            content: contentMessage,
            components: [row],
            flags: MessageFlags.Ephemeral // Keep this message ephemeral
        });
    },
};
