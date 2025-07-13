// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and find anagrams using a local dictionary file.

const fs = require('fs');   // Node.js File System module
const path = require('path'); // Node.js Path module

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

// --- Word Dictionary Loading ---
// Define the path to your dictionary file.
// You MUST create a 'words.txt' file in the 'utils/' directory.
const DICTIONARY_FILE_PATH = path.join(__dirname, '../utils/words.txt'); // Updated path
let WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Dictionary to store words sorted by their letters

// Helper function to sort a string alphabetically
function sortLetters(str) {
    return str.toLowerCase().split('').sort().join('');
}

// Function to load and preprocess the dictionary from the file
function loadAndPreprocessDictionary() {
    try {
        const data = fs.readFileSync(DICTIONARY_FILE_PATH, 'utf8');
        const rawWords = data.split('\n')
                             .map(word => word.trim().toLowerCase())
                             .filter(word => word.length > 0);

        // Preprocess the dictionary: group words by their sorted letters
        rawWords.forEach(word => {
            const sorted = sortLetters(word);
            if (!WORD_DICTIONARY_SORTED_BY_LETTERS[sorted]) {
                WORD_DICTIONARY_SORTED_BY_LETTERS[sorted] = [];
            }
            WORD_DICTIONARY_SORTED_BY_LETTERS[sorted].push(word);
        });

        console.log(`Unscrambler: Loaded and preprocessed ${rawWords.length} words from ${DICTIONARY_FILE_PATH}`);
    } catch (error) {
        console.error(`Unscrambler: Failed to load dictionary from ${DICTIONARY_FILE_PATH}:`, error);
        console.error('Please ensure words.txt exists in the utils/ directory and is readable.');
        WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Ensure dictionary is empty if loading fails
    }
}

// Load the dictionary when the script is first required (i.e., when bot starts)
loadAndPreprocessDictionary();


// Function to find all anagrams of a given scrambled word using the preprocessed dictionary
function findAnagramsFromDictionary(scrambledWord) {
    const sortedScrambled = sortLetters(scrambledWord);
    // Return a copy of the array, or an empty array if no matches
    return WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled] ? [...WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled]] : [];
}


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

            // Find possible words using the local dictionary
            const possibleWords = findAnagramsFromDictionary(scrambledLetters);

            let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

            if (possibleWords.length > 0) {
                // Sort the possible words alphabetically before displaying
                possibleWords.sort();
                replyContent += `Possible words (from local dictionary, using all letters): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
            } else {
                replyContent += `No words found in the local dictionary using all letters.`;
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
