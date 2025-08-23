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
            const userPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), 'attackCooldown');

            // Fetch current preference
            const prefSnap = await getDoc(userPrefsRef);
            const isAttackCooldownEnabled = prefSnap.exists() ? prefSnap.data().enabled : false; // Default to off if not set

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(0x0099ff) // Blue color
                .setTitle('Lootcord Helper Notifications')
                .setDescription(
                    `Here you can manage your personal notification settings for Lootcord Helper.\n\n` +
                    `**Attack Cooldown Notifications:**\n` +
                    `Status: **${isAttackCooldownEnabled ? 'ON ✅' : 'OFF ❌'}**\n` +
                    `You'll be pinged when your weapon cooldowns are over.`
                )
                .setFooter({ text: 'Use the buttons to toggle your notifications.' });

            // Create the toggle button
            const attackButton = new ButtonBuilder()
                .setCustomId('toggle_attack_notifications')
                .setLabel('Toggle Attack Cooldowns')
                .setStyle(isAttackCooldownEnabled ? ButtonStyle.Success : ButtonStyle.Danger); // Green if on, Red if off

            const row = new ActionRowBuilder().addComponents(attackButton);

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
