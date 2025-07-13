const { SlashCommandBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js'); // Import ActionRowBuilder, ChannelSelectMenuBuilder

module.exports = {
    // Defines the slash command's name and description.
    // It no longer needs to define channel options directly, as the selection will happen via a component.
    data: new SlashCommandBuilder()
        .setName('channel-set')
        .setDescription('Opens a menu to select multiple channels for bot interactions.'),

    // The execute function now sends a message with a ChannelSelectMenu.
    async execute(interaction, db) { // db is still passed, but not used directly in this part of the command
        // Defer the reply to acknowledge the interaction immediately.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Create a ChannelSelectMenu component.
        const selectMenu = new ChannelSelectMenuBuilder()
            .setCustomId('select-channels-to-set') // Unique ID for this specific dropdown
            .setPlaceholder('Select channels...')
            .setMinValues(1) // User must select at least one channel
            .setMaxValues(25) // User can select up to 25 channels (Discord limit)
            .addChannelTypes(ChannelType.GuildText); // Restrict to text channels

        // Create an ActionRow to hold the select menu.
        const row = new ActionRowBuilder()
            .addComponents(selectMenu);

        // Send the message with the dropdown.
        await interaction.editReply({
            content: 'Please select the channels you want to set:',
            components: [row],
            flags: MessageFlags.Ephemeral // Keep this message ephemeral
        });
    },
};
