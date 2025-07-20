const { SlashCommandBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { doc, collection, setDoc, getDoc } = require('firebase/firestore'); // Added getDoc
const statsTracker = require('../utils/statsTracker');
const botStatus = require('../utils/botStatus'); // Import botStatus utility

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Manually updates the bot\'s Discord status with custom text or current statistics.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Optional: The custom text to set as the bot\'s status.')
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
            option.setName('use_dynamic_stats') // Renamed from 'force_dynamic' for clarity
                .setDescription('Set to true to use dynamic stats (Helped X Players Y Times in Z Servers). Overrides custom text.')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('special_help_status')
                .setDescription('Set to true for "Watching: You need my help" status. Overrides all other options.')
                .setRequired(false)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false });

        // Permissions Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command. This command requires Administrator permissions.',
                ephemeral: true,
            });
        }

        const customStatusText = interaction.options.getString('text');
        const activityTypeInput = interaction.options.getString('activity_type');
        const useDynamicStats = interaction.options.getBoolean('use_dynamic_stats') || false;
        const specialHelpStatus = interaction.options.getBoolean('special_help_status') || false;

        let statusText = '';
        let activityType = ActivityType.Playing; // Default activity type

        if (specialHelpStatus) {
            statusText = 'You need my help';
            activityType = ActivityType.Watching;
            console.log(`Set Status Command: Special help status used: "Watching: ${statusText}"`);
        } else if (useDynamicStats) {
            // Fetch stats from Firestore for dynamic status
            if (!db || !APP_ID_FOR_FIRESTORE) {
                return await interaction.editReply({
                    content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Cannot use dynamic status.',
                    ephemeral: false
                });
            }

            const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                const totalServers = client.guilds.cache.size;

                statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
                activityType = ActivityType[activityTypeInput] ?? ActivityType.Playing; // Use provided activity type or default
                console.log(`Set Status Command: Dynamic stats status used: "${statusText}"`);
            } catch (error) {
                console.error('Set Status Command: Error fetching stats for dynamic status:', error);
                return await interaction.editReply({
                    content: '❌ An error occurred while fetching statistics for dynamic status. Please check the logs.',
                    ephemeral: false
                });
            }
        } else if (customStatusText) {
            statusText = customStatusText;
            activityType = ActivityType[activityTypeInput] ?? ActivityType.Playing; // Use provided activity type or default
            console.log(`Set Status Command: Custom status used: "${customStatusText}"`);
        } else {
            // Default behavior if no options are specified: use dynamic stats
            if (!db || !APP_ID_FOR_FIRESTORE) {
                return await interaction.editReply({
                    content: '⚠️ Bot is not fully initialized (Firestore not ready) to fetch statistics. Please try again in a moment.',
                    ephemeral: false
                });
            }

            const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
            try {
                const docSnap = await getDoc(statsDocRef);
                const data = docSnap.exists() ? docSnap.data() : {};
                const totalHelps = data.totalHelps ?? 0;
                const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;
                const totalServers = client.guilds.cache.size;

                statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times in ${totalServers} servers`;
                activityType = ActivityType.Playing; // Default for no options
                console.log(`Set Status Command: Default dynamic status used: "${statusText}"`);
            } catch (error) {
                console.error('Set Status Command: Error fetching stats for default dynamic status:', error);
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
