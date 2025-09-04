const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { collection, query, where, getDocs, getFirestore } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notify-stats')
        .setDescription('Shows a list of users with enabled cooldown notifications.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Restrict to admin only

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        console.log(`[Notify-Stats Command - Debug] START: Command /notify-stats received by ${interaction.user.tag}.`);

        try {
            await interaction.deferReply({ ephemeral: false }); // Public reply so other admins can see

            if (!db) {
                console.error('[Notify-Stats Command] Firestore DB not initialized.');
                return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
            }
            
            // This is a Firestore Collection Group query, which is the correct way to query across subcollections.
            // It requires a single-field index on the Firestore database for this to work.
            const enabledPrefsQuery = query(collection(db, 'preferences'), where('enabled', '==', true));
            console.log('[Notify-Stats Debug] Attempting to query Firestore for enabled preferences...');
            const querySnapshot = await getDocs(enabledPrefsQuery);
            
            console.log(`[Notify-Stats Debug] Found ${querySnapshot.size} preference documents matching the query.`);

            // A map to hold user IDs and their enabled preferences
            const usersWithEnabledNotifications = {};

            querySnapshot.forEach(docSnap => {
                const userId = docSnap.ref.parent.parent.id;
                const preferenceType = docSnap.id;

                if (!usersWithEnabledNotifications[userId]) {
                    usersWithEnabledNotifications[userId] = [];
                }
                usersWithEnabledNotifications[userId].push(preferenceType);
                console.log(`[Notify-Stats Debug] Added preference "${preferenceType}" for user ${userId}.`);
            });
            
            console.log('[Notify-Stats Debug] Finished processing all preference documents.');

            const uniqueUserIds = Object.keys(usersWithEnabledNotifications);
            console.log(`[Notify-Stats Debug] Found a total of ${uniqueUserIds.length} unique users with enabled notifications.`);

            if (uniqueUserIds.length === 0) {
                return await interaction.editReply({ content: 'No users currently have any cooldown notifications enabled.', ephemeral: false });
            }

            const description = uniqueUserIds
                .map(userId => {
                    const preferences = usersWithEnabledNotifications[userId];
                    const formattedPreferences = preferences.map(pref => {
                        switch(pref) {
                            case 'attackCooldown': return 'Attack';
                            case 'farmCooldown': return 'Farm';
                            case 'medCooldown': return 'Meds';
                            case 'voteCooldown': return 'Vote';
                            case 'repairCooldown': return 'Repair';
                            case 'gamblingCooldown': return 'Gambling';
                            default: return pref;
                        }
                    }).join(', ');
                    
                    return `**<@${userId}>** - ${formattedPreferences}`;
                })
                .join('\n');
            
            const statsEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Notification Cooldown Stats')
                .setDescription(
                    `Currently tracking notifications for **${uniqueUserIds.length}** users.\n\n` +
                    description
                )
                .setFooter({ text: 'This data is live from Firestore and shows enabled preferences.' });

            await interaction.editReply({ embeds: [statsEmbed], ephemeral: false });
            console.log(`[Notify-Stats Command] Successfully displayed notification stats for ${uniqueUserIds.length} users.`);

        } catch (error) {
            console.error('[Notify-Stats Command] An unexpected error occurred during execution:', error);
            if (error.code === 'failed-precondition' && error.message.includes('The query requires an index')) {
                // If the error is a missing index, we can give a more helpful message
                const indexRegex = /at: (.*?)\./;
                const indexMatch = error.message.match(indexRegex);
                const indexInfo = indexMatch ? indexMatch[1] : 'Please check the Firebase console for the required index.';
                
                await interaction.editReply({
                    content: `❌ An error occurred: I need a specific index to run this query. The required index is: \`${indexInfo}\``,
                    ephemeral: false
                });
            } else {
                // For other errors, provide a generic message and log the full error
                await interaction.editReply({ content: '❌ An unexpected error occurred while fetching notification stats. Please check logs.', ephemeral: false });
            }
        }
    },
};
