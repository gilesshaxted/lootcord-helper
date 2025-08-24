const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { collection, getDocs, query, where } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notify-check')
        .setDescription('Shows all your active cooldowns being tracked by Lootcord Helper.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        console.log(`[Notify-Check Command - Debug] START: Command /notify-check received by ${interaction.user.tag} (${interaction.user.id}).`);

        try {
            await interaction.deferReply({ ephemeral: true }); // Keep this ephemeral as it's personal info

            if (!db) {
                console.error('[Notify-Check Command] Firestore DB not initialized.');
                return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: true });
            }

            const userId = interaction.user.id;
            const activeCooldownsRef = collection(db, `ActiveCooldowns`);
            
            // Query for all active cooldowns belonging to this user
            const q = query(activeCooldownsRef, where('userId', '==', userId));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.log(`[Notify-Check Command] No active cooldowns found for user ${userId}.`);
                return await interaction.editReply({ content: '✅ You currently have no active cooldowns being tracked.', ephemeral: true });
            }

            const cooldownsList = [];
            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const remainingTimeMs = data.cooldownEndsAt - Date.now();
                const remainingMinutes = Math.ceil(remainingTimeMs / (60 * 1000));

                if (remainingMinutes > 0) { // Only show if still active
                    let itemDisplay = data.item;
                    if (data.type === 'repair') {
                        itemDisplay = `clan repair (${data.item})`;
                    } else if (data.type === 'farming') {
                        itemDisplay = 'farming'; // Ensure consistent display for farming
                    }
                    cooldownsList.push(`- **${itemDisplay}**: ${remainingMinutes} minutes remaining (in <#${data.channelId}>)`);
                }
            });

            let description;
            if (cooldownsList.length > 0) {
                description = `Here are your active cooldowns:\n\n${cooldownsList.join('\n')}`;
            } else {
                description = '✅ You currently have no active cooldowns being tracked.';
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099ff) // Blue color
                .setTitle('Your Active Cooldowns')
                .setDescription(description)
                .setFooter({ text: `Cooldowns update every 5 minutes. Use /notify to manage preferences.` });

            await interaction.editReply({ embeds: [embed], ephemeral: true });
            console.log(`[Notify-Check Command] Displayed active cooldowns for ${interaction.user.tag}.`);

        } catch (error) {
            console.error('[Notify-Check Command] An unexpected error occurred during execution:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An unexpected error occurred while fetching your cooldowns. Please check logs.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ An unexpected error occurred while fetching your cooldowns. Please check logs.', ephemeral: true });
            }
        }
        console.log(`[Notify-Check Command - Debug] END: Command /notify-check execution for ${interaction.user.tag}.`);
    },
};
