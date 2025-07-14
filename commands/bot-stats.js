const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { doc, collection, getDoc } = require('firebase/firestore'); // Import necessary Firestore functions
// statsTracker is no longer needed for direct fetch in this command, but kept for consistency if other commands use it.
// const statsTracker = require('../utils/statsTracker'); 

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('bot-stats')
        .setDescription('Displays the current bot usage statistics directly from Firestore.'), // Updated description

    // The execute function now accepts db, client, and APP_ID_FOR_FIRESTORE.
    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false }); // Non-ephemeral for testing

        // ✅ Permissions Check
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true, // Keep this ephemeral for permission errors
            });
        }

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!db || !APP_ID_FOR_FIRESTORE) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        // Explicitly define the full path to the botStats document
        // Using the structure derived from APP_ID_FOR_FIRESTORE
        const STATS_DOC_PATH = `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`;
        const statsDocRef = doc(collection(db, STATS_DOC_PATH), 'botStats');

        let totalHelps = 0;
        let uniqueActiveUsers = 0;
        let replyContent = '';

        try {
            const docSnap = await getDoc(statsDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                totalHelps = data.totalHelps ?? 0; // Use nullish coalescing for safety
                uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length; // Use nullish coalescing for safety
                replyContent = `**Bot Statistics (from Firestore):**\nHelped \`${uniqueActiveUsers}\` players \`${totalHelps}\` times.`;
            } else {
                replyContent = `**Bot Statistics (from Firestore):**\nNo statistics found in the database yet.`;
                console.warn('Bot Stats Command: botStats document not found in Firestore.');
            }
        } catch (error) {
            console.error('Bot Stats Command: Error fetching stats directly from Firestore:', error);
            replyContent = '❌ An error occurred while fetching statistics from Firestore. Please check the logs.';
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
        console.log(`Bot Stats Command: Displayed stats to ${interaction.user.tag}: "${replyContent}"`);
    },
};
