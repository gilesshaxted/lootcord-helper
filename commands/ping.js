const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // Changed to non-ephemeral for testing
        await interaction.deferReply({ ephemeral: false });

        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);

        // Changed to non-ephemeral for testing
        await interaction.editReply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, ephemeral: false });
    },
};
