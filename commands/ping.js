const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // NOTE: interaction is already deferred globally in index.js
        
        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);

        // We use editReply because the interaction was already deferred.
        await interaction.editReply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, flags: 0 });
    },
};
