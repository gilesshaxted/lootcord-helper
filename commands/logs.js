const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
// Assuming logHandler is correctly imported via the relative path from the commands folder
const { LOG_GAME_CHANNEL_ID, endLoggingSession } = require('../events/logHandler'); 

module.exports = {
    // Defines the command data structure required by index.js
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Manually dumps the current in-memory log cache for the active Wordle session.'),

    // The execute function contains the command logic
    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: true }); 

        // Permissions Check (Recommended for admin/dev logs)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
                content: '❌ You need Administrator permission to dump logs.',
                ephemeral: true,
            });
        }
        
        // This is the channel ID that logHandler is actively caching for
        const channelIdBeingLogged = LOG_GAME_CHANNEL_ID;

        // Execute the log dump function manually (sets isManualDump=true).
        // This sends the file but does NOT reset the active logging state in Firestore.
        const result = await endLoggingSession(client, db, true);

        // Check if the output channel exists (to provide a clear message)
        const gameChannel = client.channels.cache.get(channelIdBeingLogged);
        const gameChannelMention = gameChannel ? `<#${gameChannel.id}>` : channelIdBeingLogged;

        if (result.success) {
             // The file has been sent to the output channel specified in logHandler.js
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
