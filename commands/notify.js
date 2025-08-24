const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { doc, collection, getDoc, setDoc } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notify')
        .setDescription('Manage your personal notification preferences for Lootcord Helper.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        console.log(`[Notify Command - Debug] START: Command /notify received by ${interaction.user.tag} (${interaction.user.id}).`);

        try {
            await interaction.deferReply({ ephemeral: true }); // Keep this ephemeral for privacy

            if (!db) {
                console.error('[Notify Command] Firestore DB not initialized.');
                return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: true });
            }

            const userId = interaction.user.id;
            const attackPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), 'attackCooldown');
            const farmPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), 'farmCooldown');
            const medPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), 'medCooldown');
            const votePrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), 'voteCooldown'); // NEW: Vote preferences ref

            // Fetch current preferences
            const attackPrefSnap = await getDoc(attackPrefsRef);
            const isAttackCooldownEnabled = attackPrefSnap.exists() ? attackPrefSnap.data().enabled : false; // Default to off

            const farmPrefSnap = await getDoc(farmPrefsRef);
            const isFarmCooldownEnabled = farmPrefSnap.exists() ? farmPrefSnap.data().enabled : false;

            const medPrefSnap = await getDoc(medPrefsRef);
            const isMedCooldownEnabled = medPrefSnap.exists() ? medPrefSnap.data().enabled : false;

            const votePrefSnap = await getDoc(votePrefsRef); // NEW: Fetch vote preference
            const isVoteCooldownEnabled = votePrefSnap.exists() ? votePrefSnap.data().enabled : false;


            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(0x0099ff) // Blue color
                .setTitle('Lootcord Helper Notifications')
                .setDescription(
                    `Here you can manage your personal notification settings for Lootcord Helper.\n\n` +
                    `**Attack Cooldown Notifications:**\n` +
                    `Status: **${isAttackCooldownEnabled ? 'ON ✅' : 'OFF ❌'}**\n` +
                    `You'll be pinged when your **weapon cooldowns** are over.\n\n` +
                    `**Farm Cooldown Notifications:**\n` +
                    `Status: **${isFarmCooldownEnabled ? 'ON ✅' : 'OFF ❌'}**\n` +
                    `You'll be pinged when your **farming cooldowns** are over.\n\n` +
                    `**Med Cooldown Notifications:**\n` +
                    `Status: **${isMedCooldownEnabled ? 'ON ✅' : 'OFF ❌'}**\n` +
                    `You'll be pinged when your **medical item cooldowns** are over.\n\n` +
                    // NEW: Vote Cooldown Description
                    `**Vote Cooldown Notifications:**\n` +
                    `Status: **${isVoteCooldownEnabled ? 'ON ✅' : 'OFF ❌'}**\n` +
                    `You'll be pinged when your **voting cooldown** is over.`
                )
                .setFooter({ text: 'Use the buttons to toggle your notifications.' });

            // Create the toggle buttons with simplified labels
            const attackButton = new ButtonBuilder()
                .setCustomId('toggle_attack_notifications')
                .setLabel('Attack') // Simplified label
                .setStyle(isAttackCooldownEnabled ? ButtonStyle.Success : ButtonStyle.Danger);

            const farmButton = new ButtonBuilder()
                .setCustomId('toggle_farm_notifications')
                .setLabel('Farm') // Simplified label
                .setStyle(isFarmCooldownEnabled ? ButtonStyle.Success : ButtonStyle.Danger);

            const medButton = new ButtonBuilder()
                .setCustomId('toggle_med_notifications')
                .setLabel('Meds') // Simplified label
                .setStyle(isMedCooldownEnabled ? ButtonStyle.Success : ButtonStyle.Danger);

            const voteButton = new ButtonBuilder() // NEW: Vote Cooldown Button
                .setCustomId('toggle_vote_notifications')
                .setLabel('Vote') // Simplified label
                .setStyle(isVoteCooldownEnabled ? ButtonStyle.Success : ButtonStyle.Danger);


            const row = new ActionRowBuilder().addComponents(attackButton, farmButton, medButton, voteButton); // Add all four buttons to the row

            await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
            console.log(`[Notify Command] Displayed notification preferences for ${interaction.user.tag}.`);

        } catch (error) {
            console.error('[Notify Command] An unexpected error occurred during execution:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An unexpected error occurred while fetching your notification settings. Please check logs.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ An unexpected error occurred while fetching your notification settings. Please check logs.', ephemeral: true });
            }
        }
        console.log(`[Notify Command - Debug] END: Command /notify execution for ${interaction.user.tag}.`);
    },
};
