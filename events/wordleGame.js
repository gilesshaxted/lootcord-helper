const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

// Configuration specific to this listener
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Check for the game start message content
        if (message.content.includes('You will have 6 tries to guess the word correctly')) {
            console.log(`Wordle Game: Detected game start message in #${message.channel.name}`);

            // Create a button for the user to start the interaction
            const continueButton = new ButtonBuilder()
                .setCustomId('wordle_start_game') // Unique ID for this button
                .setLabel('Continue to Wordle Solver')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder()
                .addComponents(continueButton);

            try {
                // Reply to the game start message with the button
                // This reply should be ephemeral initially, so only the user who triggered it sees it.
                // However, for testing multiple interactions, we'll keep it non-ephemeral for now.
                await message.reply({
                    content: 'A Wordle game has started! Click the button below to get solver assistance.',
                    components: [row],
                    ephemeral: false // Non-ephemeral for testing
                });
                console.log(`Wordle Game: Posted 'Continue' button in #${message.channel.name}`);
            } catch (error) {
                console.error(`Wordle Game: Failed to post 'Continue' button in #${message.channel.name}:`, error);
            }
        }
    },
};
