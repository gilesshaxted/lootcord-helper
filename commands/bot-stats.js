const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const statsTracker = require('../utils/statsTracker'); // Import statsTracker utility

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('bot-stats')
        .setDescription('Displays the current bot usage statistics.'),

    // The execute function now accepts db, client, and APP_ID_FOR_FIRESTORE.
    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false }); // Non-ephemeral for testing

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!db || !APP_ID_FOR_FIRESTORE) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        const stats = statsTracker.getBotStats(); // Get current in-memory stats

        const replyContent = `**Bot Statistics:**\nHelped \`${stats.uniqueActiveUsers}\` players \`${stats.totalHelps}\` times.`;

        await interaction.editReply({ content: replyContent, ephemeral: false });
        console.log(`Bot Stats Command: Displayed stats to ${interaction.user.tag}: "${replyContent}"`);
    },
};
