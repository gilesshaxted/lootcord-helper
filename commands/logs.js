const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { LOG_GAME_CHANNEL_ID, endLoggingSession } = require('../events/logHandler'); // Import logging utilities

module.exports = {
    // Use the name 'logs' as requested for the manual dump command
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Manually dumps the current in-memory log cache for the active Wordle session.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: true }); 

        // Permissions Check (Optional but recommended for log access)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You need Administrator permission to dump logs.',
                ephemeral: true,
            });
        }
        
        // This is the channel ID that logHandler is actively caching for
        const channelIdBeingLogged = LOG_GAME_CHANNEL_ID;

        // Execute the log dump function manually
        const result = await endLoggingSession(client, db, true);

        // Check if the output channel exists (to provide a clear message)
        const gameChannel = client.channels.cache.get(channelIdBeingLogged);
        const gameChannelMention = gameChannel ? `<#${gameChannel.id}>` : channelIdBeingLogged;

        if (result.success) {
             // The function already sent the file to the output channel
            await interaction.editReply({ 
                content: `✅ Log dump successful for ${gameChannelMention}. ${result.message}`
            });
        } else {
            // Log the failure to the console and inform the user
            console.error(`[LOGS COMMAND] Manual dump failed with error: ${result.message}`);
            await interaction.editReply({ 
                content: `❌ Log dump failed for ${gameChannelMention}. Reason: ${result.message}\n` +
                         `Please check the bot's console for detailed errors and ensure the bot has 'Send Messages' and 'Attach Files' permissions in the output channel.`
            });
        }
    },
};
