const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { collection, doc, getDoc, setDoc } = require('firebase/firestore'); // Import getDoc and setDoc

module.exports = {
    // Defines the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('mob-off')
        .setDescription('Reverts the current channel\'s name to its original stored name.'),

    // The execute function now accepts the 'db' (Firestore database instance) and 'client' objects.
    async execute(interaction, db, client) {
        // Defer the reply immediately. Changed to non-ephemeral for testing.
        await interaction.deferReply({ ephemeral: false });

        const guild = interaction.guild;
        const channel = interaction.channel; // The channel where the command was used

        if (!guild) {
            return await interaction.editReply({ content: 'This command can only be used in a guild.', ephemeral: false });
        }

        // Define the app ID for Firestore paths (consistent with index.js)
        const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app'; // Used for artifacts path if needed, though not directly for Guilds collection

        // Firestore paths for the specific channel
        const guildDocRef = doc(collection(db, `Guilds`), guild.id); // Top-level Guilds collection
        const channelDocRef = doc(collection(guildDocRef, 'channels'), channel.id);

        try {
            const channelDocSnap = await getDoc(channelDocRef);

            if (!channelDocSnap.exists()) {
                return await interaction.editReply({ content: 'This channel is not configured in the database, or no original name is stored for it.', ephemeral: false });
            }

            const channelData = channelDocSnap.data();
            const originalChannelName = channelData.originalChannelName;

            if (!originalChannelName) {
                return await interaction.editReply({ content: 'No original name found for this channel in the database.', ephemeral: false });
            }

            if (channel.name === originalChannelName) {
                return await interaction.editReply({ content: 'The channel name is already its original stored name.', ephemeral: false });
            }

            // Attempt to rename the channel
            await channel.setName(originalChannelName, 'Automated revert via /mob-off command.');
            console.log(`Reverted channel ${channel.name} to ${originalChannelName} in guild ${guild.name} via /mob-off.`);

            await interaction.editReply({ content: `Successfully reverted channel name to \`${originalChannelName}\`.`, ephemeral: false });

        } catch (error) {
            console.error(`Error reverting channel name for ${channel.name} (${channel.id}) in guild ${guild.name}:`, error);
            // Check for specific Discord API errors, e.g., missing permissions
            if (error.code === 50013) { // Missing Permissions
                await interaction.editReply({ content: 'I do not have permission to rename this channel. Please ensure I have "Manage Channels" permission.', ephemeral: false });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to revert the channel name. Please check the bot\'s logs.', ephemeral: false });
            }
        }
    },
};
