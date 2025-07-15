const { SlashCommandBuilder, ActivityType } = require('discord.js');
const { doc, collection, getDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker'); // Import statsTracker utility

module.exports = {
    // Defines the slash command's name, description, and options.
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Manually updates the bot\'s Discord status or uses current statistics.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Optional: The custom text to set as the bot\'s status.')
                .setRequired(false) // Make this option optional
        )
        .addStringOption(option =>
            option.setName('activity')
                .setDescription('Optional: Select the activity type (default is PLAYING).')
                .setRequired(false)
                .addChoices(
                    { name: 'Playing', value: 'PLAYING' },
                    { name: 'Watching', value: 'WATCHING' },
                    { name: 'Listening', value: 'LISTENING' },
                    { name: 'Competing', value: 'COMPETING' }
                    // Streaming intentionally omitted unless you want to handle URLs
                )
        )
        .addBooleanOption(option =>
            option.setName('force_dynamic')
                .setDescription('Set to true to force update with current statistics, ignoring custom text.')
                .setRequired(false)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false });

        // ✅ Permissions Check
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true, // Keep this ephemeral for permission errors
            });
        }

        const customStatusText = interaction.options.getString('text');
        const activityTypeInput = interaction.options.getString('activity');
        const forceDynamic = interaction.options.getBoolean('force_dynamic') || false;

        const activityType = ActivityType[activityTypeInput] ?? ActivityType.Playing;

        let statusText = '';

        if (forceDynamic) {
            if (!db || !APP_ID_FOR_FIRESTORE) {
                return await interaction.editReply({
                    content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Cannot force dynamic status.',
                    ephemeral: false
                });
            }

            const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');

            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                const totalServers = client.guilds.cache.size; // Get number of servers

                statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`; // Updated format
                console.log(`Set Status Command: Forced dynamic status used: "${statusText}"`);
            } catch (error) {
                console.error('Set Status Command: Error fetching stats for forced dynamic status:', error);
                return await interaction.editReply({
                    content: '❌ An error occurred while fetching statistics for dynamic status. Please check the logs.',
                    ephemeral: false
                });
            }
        } else if (customStatusText) {
            statusText = customStatusText;
            console.log(`Set Status Command: Custom status used: "${customStatusText}"`);
        } else {
            if (!db || !APP_ID_FOR_FIRESTORE) {
                return await interaction.editReply({
                    content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Please try again in a moment or provide custom text.',
                    ephemeral: false
                });
            }

            const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');

            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                const totalServers = client.guilds.cache.size; // Get number of servers

                statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`; // Updated format
                console.log(`Set Status Command: Dynamic status used (default): "${statusText}"`);
            } catch (error) {
                console.error('Set Status Command: Error fetching stats:', error);
                return await interaction.editReply({
                    content: '❌ An error occurred while fetching statistics. Please check the logs.',
                    ephemeral: false
                });
            }
        }

        if (statusText.length > 128) {
            return await interaction.editReply({
                content: '⚠️ Status text exceeds the 128 character limit. Please shorten it.',
                ephemeral: false
            });
        }

        try {
            if (client.user) {
                client.user.setActivity(statusText, { type: activityType });
                await interaction.editReply({
                    content: `✅ Bot status updated to: \`${statusText}\` (Activity type: \`${ActivityType[activityType]}\`)`,
                    ephemeral: false
                });
                console.log(`Set Status Command: Bot status updated to "${statusText}" [${ActivityType[activityType]}]`);
            } else {
                throw new Error('client.user is null or undefined');
            }
        } catch (err) {
            console.error('Set Status Command: Failed to set bot activity:', err);
            await interaction.editReply({
                content: '❌ Failed to set bot status due to an internal error.',
                ephemeral: false
            });
        }
    },
};
