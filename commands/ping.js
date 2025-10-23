const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with the bot\'s latency.'),

    // The execute function contains the logic for when the command is used.
    async execute(interaction) {
        // CRITICAL FIX: Add a local deferReply. This assumes the global deferral in index.js is removed.
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
        } catch (error) {
            // If the defer fails (e.g., timed out), log and exit gracefully to prevent crash.
            console.error(`[Ping Command] Failed to defer reply for interaction ${interaction.id}:`, error);
            return;
        }

        // Calculate the bot's current WebSocket heartbeat latency in milliseconds.
        const latency_ms = Math.round(interaction.client.ws.ping);

        try {
            // We use editReply because the interaction was successfully deferred above.
            await interaction.editReply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, flags: 0 });
        } catch (error) {
            console.error(`[Ping Command] Failed to edit reply after deferral for interaction ${interaction.id}:`, error);
        }
    },
};
