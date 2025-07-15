const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore'); // Firestore functions
const { MessageFlags } = require('discord.js'); // For ephemeral replies if needed
const statsTracker = require('./statsTracker'); // For incrementing helps

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot
const WORD_LENGTH = 5; // Standard Wordle word length

// Emoji to color/letter mapping
const EMOJI_MAP = {
    // Green emojis
    ':green_a:': { color: 'green', letter: 'a' }, ':green_b:': { color: 'green', letter: 'b' }, ':green_c:': { color: 'green', letter: 'c' },
    ':green_d:': { color: 'green', letter: 'd' }, ':green_e:': { color: 'green', letter: 'e' }, ':green_f:': { color: 'green', letter: 'f' },
    ':green_g:': { color: 'green', letter: 'g' }, ':green_h:': { color: 'green', letter: 'h' }, ':green_i:': { color: 'green', letter: 'i' },
    ':green_j:': { color: 'green', letter: 'j' }, ':green_k:': { color: 'green', letter: 'k' }, ':green_l:': { color: 'green', letter: 'l' },
    ':green_m:': { color: 'green', letter: 'm' }, ':green_n:': { color: 'green', letter: 'n' }, ':green_o:': { color: 'green', letter: 'o' },
    ':green_p:': { color: 'green', letter: 'p' }, ':green_q:': { color: 'green', letter: 'q' }, ':green_r:': { color: 'green', letter: 'r' },
    ':green_s:': { color: 'green', letter: 's' }, ':green_t:': { color: 'green', letter: 't' }, ':green_u:': { color: 'green', letter: 'u' },
    ':green_v:': { color: 'green', letter: 'v' }, ':green_w:': { color: 'green', letter: 'w' }, ':green_x:': { color: 'green', letter: 'x' },
    ':green_y:': { color: 'green', letter: 'y' }, ':green_z:': { color: 'green', letter: 'z' },

    // Yellow emojis
    ':yellow_a:': { color: 'yellow', letter: 'a' }, ':yellow_b:': { color: 'yellow', letter: 'b' }, ':yellow_c:': { color: 'yellow', letter: 'c' },
    ':yellow_d:': { color: 'yellow', letter: 'd' }, ':yellow_e:': { color: 'yellow', letter: 'e' }, ':yellow_f:': { color: 'yellow', letter: 'f' },
    ':yellow_g:': { color: 'yellow', letter: 'g' }, ':yellow_h:': { color: 'yellow', letter: 'h' }, ':yellow_i:': { color: 'yellow', letter: 'i' },
    ':yellow_j:': { color: 'yellow', letter: 'j' }, ':yellow_k:': { color: 'yellow', letter: 'k' }, ':yellow_l:': { color: 'yellow', letter: 'l' },
    ':yellow_m:': { color: 'yellow', letter: 'm' }, ':yellow_n:': { color: 'yellow', letter: 'n' }, ':yellow_o:': { color: 'yellow', letter: 'o' },
    ':yellow_p:': { color: 'yellow', letter: 'p' }, ':yellow_q:': { color: 'yellow', letter: 'q' }, ':yellow_r:': { color: 'yellow', letter: 'r' },
    ':yellow_s:': { color: 'yellow', letter: 's' }, ':yellow_t:': { color: 'yellow', letter: 't' }, ':yellow_u:': { color: 'yellow', letter: 'u' },
    ':yellow_v:': { color: 'yellow', letter: 'v' }, ':yellow_w:': { color: 'yellow', letter: 'w' }, ':yellow_x:': { color: 'yellow', letter: 'x' },
    ':yellow_y:': { color: 'yellow', letter: 'y' }, ':yellow_z:': { color: 'yellow', letter: 'z' },

    // Gray emojis
    ':gray_a:': { color: 'gray', letter: 'a' }, ':gray_b:': { color: 'gray', letter: 'b' }, ':gray_c:': { color: 'gray', letter: 'c' },
    ':gray_d:': { color: 'gray', letter: 'd' }, ':gray_e:': { color: 'gray', letter: 'e' }, ':gray_f:': { color: 'gray', letter: 'f' },
    ':gray_g:': { color: 'gray', letter: 'g' }, ':gray_h:': { color: 'gray', letter: 'h' }, ':gray_i:': { color: 'gray', letter: 'i' },
    ':gray_j:': { color: 'gray', letter: 'j' }, ':gray_k:': { color: 'gray', letter: 'k' }, ':gray_l:': { color: 'gray', letter: 'l' },
    ':gray_m:': { color: 'gray', letter: 'm' }, ':gray_n:': { color: 'gray', letter: 'n' }, ':gray_o:': { color: 'gray', letter: 'o' },
    ':gray_p:': { color: 'gray', letter: 'p' }, ':gray_q:': { color: 'gray', letter: 'q' }, ':gray_r:': { color: 'gray', letter: 'r' },
    ':gray_s:': { color: 'gray', letter: 's' }, ':gray_t:': { color: 'gray', letter: 't' }, ':gray_u:': { color: 'gray', letter: 'u' },
    ':gray_v:': { color: 'gray', letter: 'v' }, ':gray_w:': { color: 'gray', letter: 'w' }, ':gray_x:': { color: 'gray', letter: 'x' },
    ':gray_y:': { color: 'gray', letter: 'y' }, ':gray_z:': { color: 'gray', letter: 'z' },

    // Placeholder gray square
    ':medium_gray_square:': { color: 'placeholder', letter: '' }
};

// Updated regex to find all Discord custom emoji formats
const EMOJI_REGEX = /<:([a-z_]+):(\d+)>/g;

/**
 * Parses a single row of emoji results into structured letter feedback.
 * @param {string} emojiRowString E.g., "<:gray_a:ID><:green_r:ID>..."
 * @returns {Array<{letter: string, color: string, position: number}>} Array of parsed letters.
 */
function parseEmojiRow(emojiRowString) {
    const results = [];
    let match;
    let position = 0;
    EMOJI_REGEX.lastIndex = 0; // Reset regex lastIndex for consistent matching

    while ((match = EMOJI_REGEX.exec(emojiRowString)) !== null) {
        const emojiName = `:${match[1]}:`; // Reconstruct emoji name for lookup (e.g., :gray_a:)
        const emojiData = EMOJI_MAP[emojiName];
        if (emojiData) {
            results.push({
                letter: emojiData.letter,
                color: emojiData.color,
                position: position
            });
            position++;
        } else {
            console.warn(`Wordle Helper: Unknown or unmapped emoji encountered: ${emojiName}`);
        }
    }
    return results;
}

/**
 * Updates the Wordle game state based on a new guess's results.
 * @param {object} gameState The current game state from Firestore.
 * @param {string} guessedWord The word that was just guessed.
 * @param {Array<{letter: string, color: string, position: number}>} guessResults Parsed emoji results for the guessed word.
 * @returns {object} The updated game state.
 */
function updateWordleGameState(gameState, guessedWord, guessResults) {
    // Ensure initial state properties exist
    gameState.correctLetters = gameState.correctLetters || {};
    gameState.misplacedLetters = gameState.misplacedLetters || {};
    gameState.wrongLetters = gameState.wrongLetters || [];
    gameState.guessesMade = gameState.guessesMade || [];

    const newCorrectLetters = { ...gameState.correctLetters };
    const newMisplacedLetters = {}; // Rebuild misplaced letters for each update
    // Convert existing misplaced letters (which are arrays) back to Sets for easier manipulation
    for (const letter in gameState.misplacedLetters) {
        newMisplacedLetters[letter] = new Set(gameState.misplacedLetters[letter]);
    }
    const newWrongLetters = new Set(gameState.wrongLetters);

    // Process the results of the current guess
    guessResults.forEach(result => {
        const { letter, color, position } = result;

        if (color === 'green') {
            newCorrectLetters[position] = letter;
            // If a letter is green, it's definitively correct, so it cannot be misplaced or wrong.
            if (newMisplacedLetters[letter]) { // Remove from misplaced if it exists there
                delete newMisplacedLetters[letter];
            }
            newWrongLetters.delete(letter); // Remove from wrong if it was previously marked wrong
        } else if (color === 'yellow') {
            // Add to misplaced, noting current position as one it's NOT at
            if (!newMisplacedLetters[letter]) {
                newMisplacedLetters[letter] = new Set();
            }
            newMisplacedLetters[letter].add(position);
            newWrongLetters.delete(letter); // Remove from wrong if it was previously marked wrong
        } else if (color === 'gray') {
            // A gray letter means it's not in the word, UNLESS it's also green or yellow elsewhere.
            // Check if this gray letter is already known to be correct (green) at any position
            // or misplaced (yellow) at any position.
            const isLetterGreenSomewhere = Object.values(newCorrectLetters).includes(letter);
            const isLetterYellowSomewhere = newMisplacedLetters[letter] && newMisplacedLetters[letter].size > 0;

            if (!isLetterGreenSomewhere && !isLetterYellowSomewhere) {
                // If the letter is not green or yellow anywhere, it's definitively wrong.
                newWrongLetters.add(letter);
            } else if (isLetterYellowSomewhere) {
                // If the letter is yellow somewhere, and this current gray means it's NOT at this position,
                // add this position to its "not at" list.
                if (!newMisplacedLetters[letter]) {
                     newMisplacedLetters[letter] = new Set();
                }
                newMisplacedLetters[letter].add(position);
            }
            // If it's green somewhere, and also gray here, it means this specific instance of the letter
            // is wrong, but the letter itself exists. No action needed for wrongLetters set.
        }
    });

    // Convert Sets back to arrays/objects for Firestore
    const updatedMisplacedLetters = {};
    for (const letter in newMisplacedLetters) {
        updatedMisplacedLetters[letter] = Array.from(newMisplacedLetters[letter]);
    }

    gameState.correctLetters = newCorrectLetters;
    gameState.misplacedLetters = updatedMisplacedLetters;
    gameState.wrongLetters = Array.from(newWrongLetters);
    
    // Add the current guess and its raw results to guessesMade
    gameState.guessesMade.push({
        word: guessedWord,
        results: guessResults,
        guessNumber: gameState.currentGuessNumber + 1
    });
    gameState.currentGuessNumber++;

    return gameState;
}


/**
 * Calls the LLM to get a Wordle guess suggestion.
 * @param {object} gameState The current Wordle game state.
 * @param {Client} client The Discord client (needed for API key access).
 * @returns {Promise<string|null>} The suggested 5-letter word or null if no valid response.
 */
async function getLLMWordleSuggestion(gameState, client) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('Wordle Helper: GOOGLE_API_KEY environment variable not set. Cannot get LLM suggestion.');
        return null;
    }

    let prompt = `You are an expert Wordle solver. Your goal is to suggest the single best 5-letter English word to guess next, based on the provided game state. Only provide the word, no other text or punctuation. The word must be exactly 5 letters long.

**Current Wordle Game State:**
- Word Length: ${WORD_LENGTH} letters`;

    if (Object.keys(gameState.correctLetters).length > 0) {
        const correctInfo = Object.keys(gameState.correctLetters)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(pos => `Position ${parseInt(pos) + 1}: '${gameState.correctLetters[pos]}' (Green)`);
        prompt += `\n- Correct letters at specific positions: ${correctInfo.join(', ')}`;
    }

    if (Object.keys(gameState.misplacedLetters).length > 0) {
        const misplacedInfo = Object.keys(gameState.misplacedLetters)
            .map(letter => {
                const notAtPositions = gameState.misplacedLetters[letter].map(pos => parseInt(pos) + 1);
                return `'${letter}' (present in word, but NOT at positions: ${notAtPositions.join(', ')}) (Yellow)`;
            });
        prompt += `\n- Letters present in the word but at incorrect positions: ${misplacedInfo.join(', ')}`;
    }

    if (gameState.wrongLetters.length > 0) {
        prompt += `\n- Letters definitively NOT in the word (Gray): ${gameState.wrongLetters.map(l => `'${l}'`).join(', ')}`;
    }

    if (gameState.guessesMade.length > 0) {
        prompt += `\n\n**Previous Guesses and Their Emoji Results (for context):**`;
        gameState.guessesMade.forEach(guess => {
            const resultString = guess.results.map(r => `(${r.letter}:${r.color}@${r.position + 1})`).join(' ');
            prompt += `\n- Guess ${guess.guessNumber}: ${guess.word} -> ${resultString}`;
        });
    }

    prompt += `\n\n**Constraints for your next guess:**
1. The word must be exactly ${WORD_LENGTH} letters long.
2. It MUST include all 'green' letters at their correct positions.
3. It MUST include all 'yellow' letters (letters present but misplaced).
4. It MUST NOT include any 'gray' letters (letters definitively not in the word).
5. For 'yellow' letters, it MUST NOT place them at positions where they were previously yellow.
6. The word should be a common English word.

**Your Task:**
Suggest the single best 5-letter English word that fits all the above criteria. Only respond with the word.`;


    try {
        const chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = { contents: chatHistory };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        console.log('Wordle Helper LLM Raw Response:', JSON.stringify(result, null, 2)); // Diagnostic log

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            let suggestedWord = result.candidates[0].content.parts[0].text.trim().toUpperCase();
            // Basic validation for 5-letter word
            if (suggestedWord.length === WORD_LENGTH && /^[A-Z]+$/.test(suggestedWord)) {
                return suggestedWord;
            } else {
                console.warn(`Wordle Helper: LLM returned invalid word format: '${suggestedWord}'.`);
                return null;
            }
        } else {
            console.warn('Wordle Helper: LLM response structure unexpected or empty.');
            return null;
        }

    } catch (error) {
        console.error('Wordle Helper: Error calling LLM API for suggestion:', error);
        return null;
    }
}

module.exports = {
    TARGET_GAME_BOT_ID,
    WORD_LENGTH,
    parseEmojiRow,
    updateWordleGameState,
    getLLMWordleSuggestion
};
