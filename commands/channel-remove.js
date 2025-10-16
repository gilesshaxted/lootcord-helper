const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { doc, collection, getDoc, updateDoc } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel-remove')
        .setDescription('Removes the current channel from mob/sticky message monitoring.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const channel = interaction.channel;
        const channelId = channel.id;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await interaction.editReply({ content: '❌ You need the "Manage Channels" permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const guildDocRef = doc(collection(db, `Guilds`), guild.id);
        const guildSnap = await getDoc(guildDocRef);

        if (!guildSnap.exists()) {
            return await interaction.editReply({ content: 'ℹ️ This server has no channels currently configured.', flags: MessageFlags.Ephemeral });
        }

        const configuredChannels = guildSnap.data().configuredChannels || [];
        
        // 1. Find the index of the channel to remove
        const initialCount = configuredChannels.length;
        const channelIndex = configuredChannels.findIndex(c => c.channelId === channelId);

        if (channelIndex === -1) {
            return await interaction.editReply({ content: `ℹ️ Channel **#${channel.name}** was not found in the configured list.`, flags: MessageFlags.Ephemeral });
        }

        // 2. Remove the channel from the array
        configuredChannels.splice(channelIndex, 1);

        // 3. Perform ATOMIC WRITE: Update the Guild document with the modified array
        try {
            await updateDoc(guildDocRef, {
                configuredChannels: configuredChannels // Overwrite the whole array
            });

            return await interaction.editReply({ content: `✅ Channel **#${channel.name}** has been removed from monitoring.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(`[Channel-Remove] Error removing channel ${channel.name}:`, error);
            return await interaction.editReply({ content: '❌ An error occurred while saving to the database. Please check logs.', flags: MessageFlags.Ephemeral });
        }
    },
};
