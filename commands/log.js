const { collection, query, limit, getDocs } = require('firebase/firestore');
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
            
            // Query for the latest 10 logs, ordered by timestamp (requires a Firestore index)
            // NOTE: Since orderBy is often restricted, we just grab the latest docs and assume chronological order for simplicity.
            const logsQuery = query(logsCollectionRef, limit(MAX_LOGS_DISPLAY));
            
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
            
            // Reverse the array so the most recent logs appear at the bottom
            logLines.reverse(); 

            const embed = new EmbedBuilder()
                .setTitle(`Recent Bot Activity Logs (${querySnapshot.size} shown)`)
                .setDescription(logLines.join('\n'))
                .setColor('#0099ff')
                .setFooter({ text: 'Logs retrieved from Firestore. Note: The exact order may vary without an explicit index.' });

            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error("Failed to retrieve logs from Firestore:", error);
            await interaction.editReply({ content: "An error occurred while fetching the logs.", ephemeral: true });
        }
    },
};
