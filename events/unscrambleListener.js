// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and find anagrams using an API.

// Removed direct https import and API config, now using shared helper
const { callUnscrambleApi } = require('../utils/apiHelpers'); // Import from new utility file

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, and isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady) { // db and isFirestoreReady are passed but not used by this specific listener
        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return; // Ignore messages from this bot itself

        // Only process messages in guilds
        if (!message.guild) return;

        // Check if the message content matches the "fix" pattern
        const contentMatch = message.content.match(/```fix\n([a-zA-Z]+)\n```/);

        if (contentMatch && contentMatch[1]) {
            const scrambledLetters = contentMatch[1].toLowerCase(); // Extract and convert to lowercase

            // Call the API to find possible words using the shared helper
            let possibleWords = [];
            try {
                possibleWords = await callUnscrambleApi(scrambledLetters);
            } catch (apiError) {
                console.error(`Unscrambler: Error calling API for '${scrambledLetters}':`, apiError);
                await message.channel.send({ content: `**Unscrambler:** Failed to get words for \`${scrambledLetters}\` due to an API error. Please try again later.` });
                return; // Stop processing if API call fails
            }

            let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

            if (possibleWords.length > 0) {
                replyContent += `Possible words (from API, using all letters if API supports): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
            } else {
                replyContent += `No words found by the API using all letters.`;
            }

            // Discord has a message character limit of 2000.
            if (replyContent.length > 2000) {
                replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
            }

            try {
                await message.channel.send({ content: replyContent });
                console.log(`Unscrambler: Posted possible words for '${scrambledLetters}' in #${message.channel.name}`);
            } catch (error) {
                console.error(`Unscrambler: Failed to post words in #${message.channel.name}:`, error);
            }
        }
    },
};
