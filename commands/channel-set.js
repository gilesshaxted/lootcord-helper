const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js'); // Import MessageFlags
// Import Firestore modular functions needed in this file
const { collection, doc, setDoc } = require('firebase/firestore');

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
        // Use flags for ephemeral response, as 'ephemeral' property is deprecated.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Updated here

        const channel = interaction.options.getChannel('channel');
        const guild = interaction.guild;

        if (!guild) {
            // Use flags for ephemeral response in error replies too
            return await interaction.editReply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
        }

        // Define the app ID for Firestore paths (consistent with index.js)
        const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

        // Firestore paths using modular API:
        // Collection: /Guilds/{APP_ID}/public/data/guilds
        // Document: {guildId}
        const guildCollectionRef = collection(db, `Guilds/${APP_ID_FOR_FIRESTORE}/public/data/guilds`);
        const guildDocRef = doc(guildCollectionRef, guild.id);

        // Subcollection: channels
        // Document: {channelId}
        const channelsSubCollectionRef = collection(guildDocRef, 'channels');
        const channelDocRef = doc(channelsSubCollectionRef, channel.id);


        try {
            // Store or update guild details (name and owner) in the 'guilds' collection.
            // Using { merge: true } ensures existing fields are not overwritten.
            await setDoc(guildDocRef, {
                guildId: guild.id,
                guildName: guild.name,
                guildOwnerId: guild.ownerId,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            // Store channel details in the 'channels' subcollection under the guild.
            await setDoc(channelDocRef, {
                channelId: channel.id,
                channelName: channel.name,
                setType: 'manual', // Example field: indicates it was set manually via command
                setByUserId: interaction.user.id,
                setByUsername: interaction.user.tag,
                timestamp: new Date().toISOString()
            });

            // Use flags for ephemeral response
            await interaction.editReply({ content: `Successfully set and saved channel: ${channel.name} (<#${channel.id}>) for this guild.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Error saving channel to Firestore:', error);
            // Use flags for ephemeral response
            await interaction.editReply({ content: 'There was an error saving the channel to Firestore. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    },
};
