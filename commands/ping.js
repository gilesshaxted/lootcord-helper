const { SlashCommandBuilder, MessageFlags } = require('discord.js'); // Import MessageFlags

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // Defer the reply immediately to acknowledge the interaction within 3 seconds.
        // This prevents the "Unknown interaction" error.
        // Use flags for ephemeral response, as 'ephemeral' property is deprecated.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);

        // Edit the deferred reply with the actual content.
        // Use flags for ephemeral response.
        await interaction.editReply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, flags: MessageFlags.Ephemeral });
    },
};
