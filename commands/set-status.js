const { SlashCommandBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { doc, collection, getDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');
const botStatus = require('../utils/botStatus'); // Import botStatus utility

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Manually updates the bot\'s Discord status or uses current statistics.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Optional: The custom text to set as the bot\'s status. Leave blank to revert to dynamic stats.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('activity_type') // Renamed from 'activity' to avoid conflict with ActivityType enum
                .setDescription('Optional: Select the activity type (default is PLAYING).')
                .setRequired(false)
                .addChoices(
                    { name: 'Playing', value: 'PLAYING' },
                    { name: 'Watching', value: 'WATCHING' },
                    { name: 'Listening', value: 'LISTENING' },
                    { name: 'Competing', value: 'COMPETING' }
                )
        )
        .addBooleanOption(option =>
            option.setName('clear_custom')
                .setDescription('Set to true to clear any custom status and revert to dynamic stats.')
                .setRequired(false)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false });

        // ✅ Permissions Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const customStatusText = interaction.options.getString('text');
        const activityTypeInput = interaction.options.getString('activity_type');
        const clearCustom = interaction.options.getBoolean('clear_custom') || false;

        const activityType = ActivityType[activityTypeInput] ?? ActivityType.Playing;

        if (clearCustom) {
            botStatus.clearCustomBotStatus(client, statsTracker.getBotStats());
            return await interaction.editReply({ content: '✅ Custom status cleared. Bot status reverted to dynamic statistics.', ephemeral: false });
        }

        if (customStatusText) {
            if (customStatusText.length > 128) {
                return await interaction.editReply({
                    content: '⚠️ Status text exceeds the 128 character limit. Please shorten it.',
                    ephemeral: false
                });
            }
            botStatus.setCustomBotStatus(client, customStatusText, activityType);
            return await interaction.editReply({ content: `✅ Bot status set to custom: \`${customStatusText}\` (Type: \`${activityType}\`).`, ephemeral: false });
        } else {
            // If no custom text and not clearing, force a dynamic update
            if (!db || !APP_ID_FOR_FIRESTORE) {
                return await interaction.editReply({
                    content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Cannot update dynamic status.',
                    ephemeral: false
                });
            }

            // Trigger a dynamic update via statsTracker's listener (which then calls botStatus)
            // We can force a write to the stats document to trigger the onSnapshot listener.
            const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
            try {
                await setDoc(statsDocRef, { lastUpdated: new Date().toISOString() }, { merge: true });
                await interaction.editReply({ content: '✅ Triggered dynamic status update based on current statistics.', ephemeral: false });
            } catch (error) {
                console.error('Set Status Command: Error triggering dynamic status update:', error);
                await interaction.editReply({ content: '❌ An error occurred while trying to trigger dynamic status update. Please check logs.', ephemeral: false });
            }
        }
    },
};
