const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Makes the bot send a message to the current channel and deletes the command.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The content you want the bot to say.')
                .setRequired(true)
        )
        // Set permissions to restrict usage to users who can manage messages 
        // to prevent potential abuse (optional, but highly recommended)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const messageContent = interaction.options.getString('message');
        const channel = interaction.channel;

        try {
            // 1. Send the user's message to the channel
            await channel.send({ content: messageContent });

            // 2. Delete the original command interaction (the user's /say message)
            // We use deferReply and then delete the original reply/message.
            // Since we don't want the "The application did not respond" error,
            // we reply ephemerally and delete immediately, or delete the interaction itself.
            await interaction.reply({ content: 'Message sent!', ephemeral: true });
            await interaction.deleteReply(); 

            // Fallback for interactions that can be deferred but whose original message 
            // (the command itself) can still be deleted directly:
            // Since Discord interaction model is complex, using deleteReply() after an 
            // ephemeral reply is the most reliable way to clear the screen without errors.

        } catch (error) {
            console.error(`Say Command: Failed to execute or delete interaction:`, error);
            // Check if interaction is deferred/replied before attempting to followUp/editReply
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Could not send message or delete command.', ephemeral: true });
            }
        }
    },
};
