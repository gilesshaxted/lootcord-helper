const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { doc, collection, getDoc } = require('firebase/firestore'); // Import getDoc
const statsTracker = require('../utils/statsTracker'); // Import statsTracker utility

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Manually updates the bot\'s Discord status with current statistics.'),

    // The execute function now accepts db, client, and APP_ID_FOR_FIRESTORE.
    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false }); // Non-ephemeral for testing

        if (!db || !APP_ID_FOR_FIRESTORE) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');

        try {
            const docSnap = await getDoc(statsDocRef);
            let totalHelps = 0;
            let uniqueActiveUsers = 0;

            if (docSnap.exists()) {
                const data = docSnap.data();
                totalHelps = data.totalHelps || 0;
                uniqueActiveUsers = Object.keys(data.activeUsersMap || {}).length;
            } else {
                console.warn('Set Status Command: botStats document not found in Firestore. Using default 0s.');
            }

            const statusText = `Helped ${uniqueActiveUsers} players ${totalHelps} times`;

            if (client.user) {
                client.user.setActivity(statusText, { type: 'PLAYING' }); // 'PLAYING' is a common type
                await interaction.editReply({ content: `Bot status updated to: \`${statusText}\`.`, ephemeral: false });
                console.log(`Set Status Command: Bot status manually updated to: "${statusText}"`);
            } else {
                await interaction.editReply({ content: 'Error: Bot client user not available to set status.', ephemeral: false });
                console.error('Set Status Command: Cannot set bot status: client.user is not available.');
            }

        } catch (error) {
            console.error('Set Status Command: Error fetching stats or setting status:', error);
            await interaction.editReply({ content: 'An error occurred while trying to update the bot status. Please check logs.', ephemeral: false });
        }
    },
};
