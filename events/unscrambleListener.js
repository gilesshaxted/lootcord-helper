// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and find anagrams using a local dictionary file.

const { findAnagramsFromDictionary } = require('../utils/dictionary'); // Import from new utility file
// No Firestore imports needed here as this listener doesn't interact with Firestore directly

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

        // --- Ignore Logic for "You got it correct!" messages ---
        // This should be the first check for unscrambling to prevent processing correct answers.
        if (message.content.includes('You got it correct!') && message.embeds.length > 0) {
            const embed = message.embeds[0];
            // Discord embed colors are stored as integers. #89ff58 is 8912472 in decimal.
            if (embed.color === 8912472) {
                console.log('Unscrambler: Ignoring "You got it correct!" message with correct embed color.');
                return; // Ignore this message for unscrambling
            }
        }

        // --- Unscrambler Logic ---
        let scrambledLetters = null;
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            const embedDescription = embed.description;
            const embedFields = embed.fields; // Also need to check fields for "Reward"

            // Regex: Matches "Word:", then optional whitespace, then "```fix\n",
            // then captures the letters, and then looks for "```"
            const wordMatch = embedDescription ? embedDescription.match(/Word:\s*```fix\n([a-zA-Z]+)```/s) : null;
            
            // Check for "Reward" field as a validation that it's the correct type of embed
            const hasRewardField = embedFields.some(field => field.name && field.name.includes('Reward'));

            if (wordMatch && wordMatch[1] && hasRewardField) {
                scrambledLetters = wordMatch[1].toLowerCase();
            }
        }

        if (scrambledLetters) {
            const possibleWords = findAnagramsFromDictionary(scrambledLetters);

            let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

            if (possibleWords.length > 0) {
                replyContent += `Possible words (from local dictionary, using all letters): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
            } else {
                replyContent += `No words found in the local dictionary using all letters.`;
            }

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
