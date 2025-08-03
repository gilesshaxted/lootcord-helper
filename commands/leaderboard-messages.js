const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { doc, collection, getDocs } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-messages')
        .setDescription('Displays a leaderboard of messages posted in the current month.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false });

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!db || !APP_ID_FOR_FIRESTORE) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        // Determine the current month in YYYY-MM format
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const monthDocId = `${year}-${month}`;

        // Get a reference to the users subcollection for the current month
        const usersCollectionRef = collection(db, `MessageCounts/${monthDocId}/users`);

        try {
            const usersDocs = await getDocs(usersCollectionRef);
            if (usersDocs.empty) {
                return await interaction.editReply({ content: `No message statistics found for this month (${monthDocId}).`, ephemeral: false });
            }

            const leaderboardData = [];
            let totalMessages = 0;
            usersDocs.forEach(docSnap => {
                const data = docSnap.data();
                leaderboardData.push({
                    userId: docSnap.id,
                    username: data.username,
                    count: data.messageCount
                });
                totalMessages += data.messageCount;
            });

            // Sort the data in descending order by message count
            leaderboardData.sort((a, b) => b.count - a.count);

            // Create the embed for the leaderboard
            const leaderboardEmbed = new EmbedBuilder()
                .setTitle(`Monthly Message Leaderboard - ${monthDocId}`)
                .setColor(0x0099ff) // Blue color
                .setDescription(
                    leaderboardData.map((user, index) =>
                        `**${index + 1}.** <@${user.userId}> (${user.username}): **${user.count}** messages`
                    ).join('\n')
                )
                .setFooter({ text: `Total Messages This Month: ${totalMessages}` });

            await interaction.editReply({ embeds: [leaderboardEmbed], ephemeral: false });
            console.log(`Leaderboard Command: Displayed monthly leaderboard for ${monthDocId} to ${interaction.user.tag}.`);

        } catch (error) {
            console.error('Leaderboard Command: Error fetching monthly message data:', error);
            await interaction.editReply({ content: '❌ An error occurred while fetching the leaderboard data. Please check the logs.', ephemeral: false });
        }
    },
};
