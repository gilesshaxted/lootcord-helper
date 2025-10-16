const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { doc, collection, setDoc, getDoc, updateDoc } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel-add')
        .setDescription('Designates the current channel for Mob/Sticky Message monitoring.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const channel = interaction.channel;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await interaction.editReply({ content: '❌ You need the "Manage Channels" permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        if (channel.type !== ChannelType.GuildText) {
            return await interaction.editReply({ content: '❌ This command must be used in a text channel.', flags: MessageFlags.Ephemeral });
        }

        const guildDocRef = doc(collection(db, `Guilds`), guild.id);
        const channelId = channel.id;

        // 1. Check if channel already exists in the configured list
        const guildSnap = await getDoc(guildDocRef);
        const configuredChannels = guildSnap.exists() ? (guildSnap.data().configuredChannels || []) : [];

        // Check if the channel is already configured
        if (configuredChannels.some(c => c.channelId === channelId)) {
            return await interaction.editReply({ content: `ℹ️ Channel ${channel.name} is already configured for monitoring.`, flags: MessageFlags.Ephemeral });
        }

        // 2. Add the new channel to the list
        const newChannelEntry = {
            channelId: channelId,
            channelName: channel.name,
            originalChannelName: channel.name, // Store current name as original name
            setType: 'command_add',
            setByUserId: interaction.user.id,
            setByUsername: interaction.user.tag,
            timestamp: new Date().toISOString()
        };

        configuredChannels.push(newChannelEntry);

        // 3. Perform ATOMIC WRITE: Update the Guild document with the new array
        try {
            await setDoc(guildDocRef, {
                guildId: guild.id,
                guildName: guild.name,
                lastUpdated: new Date().toISOString(),
                configuredChannels: configuredChannels // Overwrite the whole array
            }, { merge: true });

            return await interaction.editReply({ content: `✅ Channel **#${channel.name}** has been added for mob/sticky message monitoring.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(`[Channel-Add] Error adding channel ${channel.name}:`, error);
            return await interaction.editReply({ content: '❌ An error occurred while saving to the database. Please check logs.', flags: MessageFlags.Ephemeral });
        }
    },
};
