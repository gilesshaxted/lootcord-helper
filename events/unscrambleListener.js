// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and find anagrams using a local dictionary file.

const { findAnagramsFromDictionary } = require('../utils/dictionary');
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker
const { collection, getDocs } = require('firebase/firestore'); // Import Firestore functions needed

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) { // Added APP_ID_FOR_FIRESTORE
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        if (!message.guild) return;

        // --- Ignore Logic for "You got it correct!" messages ---
        if (message.content.includes('You got it correct!') && message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.color === 8912472) { // Decimal value for #89ff58
                console.log('Unscrambler: Ignoring "You got it correct!" message with correct embed color.');
                return;
            }
        }

        let scrambledLetters = null;
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            const embedDescription = embed.description;
            const embedFields = embed.fields;

            const wordMatch = embedDescription ? embedDescription.match(/Word:\s*```fix\n([a-zA-Z]+)```/s) : null;
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
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for unscramble
            } catch (error) {
                console.error(`Unscrambler: Failed to post words in #${message.channel.name}:`, error);
            }
        }
    },
};
