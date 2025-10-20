const { collection, query, limit, getDocs, orderBy } = require('firebase/firestore');
const { EmbedBuilder } = require('discord.js');

// Command Configuration (Needs to be registered with Discord)
const LOGS_COMMAND_DATA = {
    name: "logs",
    description: "Retrieves the latest logs stored in the database.",
    options: [{
        name: "list",
        description: "Lists the 10 most recent log entries.",
        type: 1, // ApplicationCommandOptionType.Subcommand
    }],
};

// Maximum number of logs to display in the list command
const MAX_LOGS_DISPLAY = 10;

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Only handle slash commands named 'logs'
        if (!interaction.isCommand() || interaction.commandName !== 'logs') return;

        // Check if Firestore is ready
        if (!isFirestoreReady) {
            return interaction.reply({ content: "The database is not yet ready. Please try again in a moment.", ephemeral: true });
        }

        // Defer the reply since we are querying the database
        await interaction.deferReply({ ephemeral: true });

        try {
            const logsCollectionRef = collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/logs`);
            
            // FIX: Added orderBy('timestamp', 'desc') to ensure logs are queried in chronological order.
            // This is required for efficient querying and prevents potential Firestore query errors.
            const logsQuery = query(logsCollectionRef, orderBy('timestamp', 'desc'), limit(MAX_LOGS_DISPLAY));
            
            const querySnapshot = await getDocs(logsQuery);

            if (querySnapshot.empty) {
                return interaction.editReply({ content: "No log entries found in the database.", ephemeral: true });
            }

            // Map results into formatted strings
            const logLines = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const time = new Date(data.timestamp).toLocaleTimeString();
                const date = new Date(data.timestamp).toLocaleDateString();
                
                // Format the log entry concisely
                return `**[${date} ${time}]** | **${data.action}** in <#${data.channelId}> by \`${data.userId}\``;
            });
            
            // Removed logLines.reverse() since the query is now sorted descending (newest first).
            // This order is better for displaying the latest logs.

            const embed = new EmbedBuilder()
                .setTitle(`Recent Bot Activity Logs (${querySnapshot.size} shown)`)
                .setDescription(logLines.join('\n'))
                .setColor('#0099ff')
                .setFooter({ text: 'Logs retrieved from Firestore. Note: An index may be required for this query to function reliably.' });

            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error("Failed to retrieve logs from Firestore:", error);
            // Provide specific feedback if the error is a missing index (common Firestore issue)
             if (error.code === 'failed-precondition' && error.message.includes('The query requires an index')) {
                 await interaction.editReply({ content: "❌ Error: The database query requires a specific Firestore index (on 'timestamp'). Please create it using the Firebase Console.", ephemeral: true });
             } else {
                 await interaction.editReply({ content: "An error occurred while fetching the logs. Please check the bot's console for details.", ephemeral: true });
             }
        }
    },
};
