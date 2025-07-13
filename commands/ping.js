const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // Defines the slash command's name and description.
    // This data is sent to Discord's API for command registration.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);
        // Reply to the interaction. ephemeral: false means everyone can see the response.
        await interaction.reply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, ephemeral: false });
    },
};
