const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // Defer the reply to acknowledge the interaction immediately.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);

        // Edit the deferred reply with the actual latency.
        await interaction.editReply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, flags: MessageFlags.Ephemeral });
    },
};
