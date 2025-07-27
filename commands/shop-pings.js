const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { doc, collection, setDoc, getDoc } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop-pings')
        .setDescription('Configures the shop channel and role IDs for shop deal notifications.')
        .addChannelOption(option =>
            option.setName('shop_channel')
                .setDescription('The text channel where shop deals are posted.')
                .setRequired(false) // Optional, so you can update just roles
        )
        .addRoleOption(option =>
            option.setName('resources_role')
                .setDescription('Role to ping for Resources deals.')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('loot_role')
                .setDescription('Role to ping for Loot deals.')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('weapons_role')
                .setDescription('Role to ping for Weapons deals.')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('ammo_role')
                .setDescription('Role to ping for Ammo deals.')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('meds_role')
                .setDescription('Role to ping for Meds deals.')
                .setRequired(false)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: false }); // Non-ephemeral for feedback

        // Permissions Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command. This command requires Administrator permissions.',
                ephemeral: true,
            });
        }

        if (!db) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        const shopChannel = interaction.options.getChannel('shop_channel');
        const resourcesRole = interaction.options.getRole('resources_role');
        const lootRole = interaction.options.getRole('loot_role');
        const weaponsRole = interaction.options.getRole('weapons_role');
        const ammoRole = interaction.options.getRole('ammo_role');
        const medsRole = interaction.options.getRole('meds_role');

        const configDocRef = doc(collection(db, `BotConfigs`), 'mainConfig');
        let updateData = {};
        let replyMessages = [];

        // Update shop channel ID if provided
        if (shopChannel) {
            if (shopChannel.type !== ChannelType.GuildText) {
                return await interaction.editReply({ content: '❌ The shop channel must be a text channel.', ephemeral: false });
            }
            updateData.shopChannelId = shopChannel.id;
            replyMessages.push(`Shop Channel set to: <#${shopChannel.id}>`);
        }

        // Update ping role IDs if provided
        let pingRoleUpdates = {};
        if (resourcesRole) pingRoleUpdates.RESOURCES = resourcesRole.id;
        if (lootRole) pingRoleUpdates.LOOT = lootRole.id;
        if (weaponsRole) pingRoleUpdates.WEAPONS = weaponsRole.id;
        if (ammoRole) pingRoleUpdates.AMMO = ammoRole.id;
        if (medsRole) pingRoleUpdates.MEDS = medsRole.id;

        if (Object.keys(pingRoleUpdates).length > 0) {
            // Merge new ping roles with existing ones
            updateData.pingRoleIds = { ...((await getDoc(configDocRef)).data()?.pingRoleIds || {}), ...pingRoleUpdates };
            replyMessages.push(`Ping Roles updated: ${Object.keys(pingRoleUpdates).join(', ')}`);
        }

        if (Object.keys(updateData).length === 0) {
            return await interaction.editReply({ content: 'No options provided to update. Please specify a shop channel or roles.', ephemeral: false });
        }

        try {
            await setDoc(configDocRef, updateData, { merge: true });
            console.log(`Shop Pings Command: Updated shop config for guild ${interaction.guild.id}:`, updateData);
            await interaction.editReply({ content: `✅ Shop configuration updated successfully!\n${replyMessages.join('\n')}`, ephemeral: false });
        } catch (error) {
            console.error('Shop Pings Command: Error updating shop config:', error);
            await interaction.editReply({ content: '❌ An error occurred while saving the shop configuration. Please check logs.', ephemeral: false });
        }
    },
};
