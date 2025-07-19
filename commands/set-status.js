const { SlashCommandBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { doc, collection, setDoc } = require('firebase/firestore'); // Added setDoc for triggering update
const statsTracker = require('../utils/statsTracker');
const botStatus = require('../utils/botStatus'); // Import botStatus utility

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Manually triggers an update of the bot\'s Discord status based on current statistics.'), // Updated description
        // Removed 'text', 'activity_type', and 'clear_custom' options

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false });

        // ✅ Permissions Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true, // Keep this ephemeral for permission errors
            });
        }

        // Removed customStatusText, activityTypeInput, clearCustom variables

        // The command now only triggers a dynamic update
        if (!db || !APP_ID_FOR_FIRESTORE) {
            return await interaction.editReply({
                content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Cannot update dynamic status.',
                ephemeral: false
            });
        }

        // Trigger a dynamic update via statsTracker's listener (which then calls botStatus)
        // We force a write to the stats document to trigger the onSnapshot listener.
        const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
        try {
            await setDoc(statsDocRef, { lastUpdated: new Date().toISOString() }, { merge: true });
            await interaction.editReply({ content: '✅ Triggered dynamic status update based on current statistics.', ephemeral: false });
        } catch (error) {
            console.error('Set Status Command: Error triggering dynamic status update:', error);
            await interaction.editReply({ content: '❌ An error occurred while trying to trigger dynamic status update. Please check logs.', ephemeral: false });
        }
    },
};
