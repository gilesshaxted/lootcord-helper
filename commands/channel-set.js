const { SlashCommandBuilder, ChannelType } = require('discord.js');
// Firestore imports are handled by index.js and passed via execute function
// No need to re-initialize Firebase here if db is passed.

module.exports = {
    // Defines the slash command's name, description, and options.
    data: new SlashCommandBuilder()
        .setName('channel-set')
        .setDescription('Sets a specific channel for bot interactions in this guild.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to store.')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText) // Restrict to text channels
        ),

    // The execute function contains the logic for when the command is used.
    // It now accepts the 'db' (Firestore database instance) as an argument.
    async execute(interaction, db) {
        // Defer the reply to give the bot more time for Firestore operations.
        // ephemeral: true means only the user who used the command sees the initial "Bot is thinking..." message.
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel');
        const guild = interaction.guild;

        if (!guild) {
            return await interaction.editReply('This command can only be used in a guild.');
        }

        // Define the app ID for Firestore paths (consistent with index.js)
        const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

        // Firestore paths
        // Collection: /artifacts/{APP_ID}/public/data/guilds
        // Document: {guildId}
        const guildDocRef = db.collection(`artifacts/${APP_ID_FOR_FIRESTORE}/public/data/guilds`).doc(guild.id);
        // Subcollection: channels
        // Document: {channelId}
        const channelDocRef = guildDocRef.collection('channels').doc(channel.id);

        try {
            // Store or update guild details (name and owner) in the 'guilds' collection.
            // Using { merge: true } ensures existing fields are not overwritten.
            await guildDocRef.set({
                guildId: guild.id,
                guildName: guild.name,
                guildOwnerId: guild.ownerId,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            // Store channel details in the 'channels' subcollection under the guild.
            await channelDocRef.set({
                channelId: channel.id,
                channelName: channel.name,
                setType: 'manual', // Example field: indicates it was set manually via command
                setByUserId: interaction.user.id,
                setByUsername: interaction.user.tag,
                timestamp: new Date().toISOString()
            });

            await interaction.editReply(`Successfully set and saved channel: ${channel.name} (<#${channel.id}>) for this guild.`);
        } catch (error) {
            console.error('Error saving channel to Firestore:', error);
            await interaction.editReply('There was an error saving the channel to Firestore. Please try again later.');
        }
    },
};
