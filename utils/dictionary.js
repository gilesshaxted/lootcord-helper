const fs = require('fs');
const path = require('path');

let WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Dictionary to store words grouped by their sorted letters

// Define the path to your dictionary file.
// You MUST create a 'words.txt' file in the 'utils/' directory.
const DICTIONARY_FILE_PATH = path.join(__dirname, 'words.txt');

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
        // This creates a map where keys are sorted letter strings (e.g., 'aelpp')
        // and values are arrays of anagrams (e.g., ['apple']).
        rawWords.forEach(word => {
            const sorted = sortLetters(word);
            if (!WORD_DICTIONARY_SORTED_BY_LETTERS[sorted]) {
                WORD_DICTIONARY_SORTED_BY_LETTERS[sorted] = [];
            }
            WORD_DICTIONARY_SORTED_BY_LETTERS[sorted].push(word);
        });

        console.log(`Dictionary Utility: Loaded and preprocessed ${rawWords.length} words from ${DICTIONARY_FILE_PATH}`);
        if (rawWords.length > 100000) { // Arbitrary warning threshold for common free tiers
            console.warn('Dictionary Utility: Loaded a very large dictionary. If you experience "heap out of memory" errors, consider using a smaller word list.');
        }
    } catch (error) {
        console.error(`Dictionary Utility: Failed to load dictionary from ${DICTIONARY_FILE_PATH}:`, error);
        console.error('Please ensure words.txt exists in the utils/ directory and is readable.');
        console.error('If you are getting "heap out of memory" errors, your words.txt file might be too large for your hosting plan.');
        console.error('Consider using a smaller dictionary (e.g., 10,000-50,000 common English words).');
        WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Ensure dictionary is empty if loading fails
    }
}

// Load the dictionary when this utility script is first required (i.e., when bot starts)
loadAndPreprocessDictionary();

/**
 * Finds all anagrams of a given scrambled word using the preprocessed local dictionary.
 * @param {string} scrambledWord The jumbled letters to unscramble.
 * @returns {string[]} An array of possible words (lowercase), sorted alphabetically.
 */
function findAnagramsFromDictionary(scrambledWord) {
    const sortedScrambled = sortLetters(scrambledWord);
    // Return a copy of the array, or an empty array if no matches
    const possibleWords = WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled] ? [...WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled]] : [];
    possibleWords.sort(); // Ensure results are always sorted alphabetically
    return possibleWords;
}

module.exports = {
    findAnagramsFromDictionary
};
