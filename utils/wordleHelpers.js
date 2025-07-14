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

// Regex to find all emoji sequences
const EMOJI_REGEX = /:([a-z_]+):/g;

/**
 * Parses a single row of emoji results into structured letter feedback.
 * @param {string} emojiRowString E.g., ":gray_a::green_r::gray_o::gray_s::yellow_e:"
 * @returns {Array<{letter: string, color: string, position: number}>} Array of parsed letters.
 */
function parseEmojiRow(emojiRowString) {
    const results = [];
    let match;
    let position = 0;
    while ((match = EMOJI_REGEX.exec(emojiRowString)) !== null) {
        const emojiName = `:${match[1]}:`;
        const emojiData = EMOJI_MAP[emojiName];
        if (emojiData) {
            results.push({
                letter: emojiData.letter,
                color: emojiData.color,
                position: position
            });
            position++;
        } else {
            console.warn(`Wordle Helper: Unknown emoji encountered: ${emojiName}`);
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
    const newMisplacedLetters = { ...gameState.misplacedLetters };
    const newWrongLetters = new Set(gameState.wrongLetters); // Use Set for efficiency in adding/checking wrong letters

    // Process the results of the current guess
    guessResults.forEach(result => {
        const { letter, color, position } = result;

        if (color === 'green') {
            newCorrectLetters[position] = letter;
            // A green letter means it's definitively correct, so it cannot be misplaced or wrong.
            if (newMisplacedLetters[letter]) {
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
            // Only add to wrong letters if it's not already known to be correct or misplaced
            if (!newCorrectLetters[position] || newCorrectLetters[position] !== letter) { // If it's not a green letter at this position
                 if (!Object.values(newCorrectLetters).includes(letter) && !newMisplacedLetters[letter]) { // If letter isn't green anywhere or yellow anywhere
                    newWrongLetters.add(letter);
                 } else if (newMisplacedLetters[letter] && !newMisplacedLetters[letter].has(position)) {
                    // If it's a yellow letter, and this position is not one it's already known NOT to be in,
                    // add this position to its "not at" list.
                    newMisplacedLetters[letter].add(position);
                 }
            }
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

    let prompt = `Given the following Wordle game state, suggest the single best 5-letter English word to guess next. Only provide the word, no other text or punctuation. The word must be exactly 5 letters long.

**Known Information:**
- Word Length: ${WORD_LENGTH} letters`;

    if (Object.keys(gameState.correctLetters).length > 0) {
        const correctInfo = Object.keys(gameState.correctLetters)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(pos => `Position ${parseInt(pos) + 1}: '${gameState.correctLetters[pos]}'`);
        prompt += `\n- Correct letters at specific positions (Green): ${correctInfo.join(', ')}`;
    }

    if (Object.keys(gameState.misplacedLetters).length > 0) {
        const misplacedInfo = Object.keys(gameState.misplacedLetters)
            .map(letter => {
                const notAtPositions = gameState.misplacedLetters[letter].map(pos => parseInt(pos) + 1);
                return `'${letter}' (present but NOT at positions: ${notAtPositions.join(', ')})`;
            });
        prompt += `\n- Letters present in the word but at incorrect positions (Yellow): ${misplacedInfo.join(', ')}`;
    }

    if (gameState.wrongLetters.length > 0) {
        prompt += `\n- Letters NOT in the word (Gray): ${gameState.wrongLetters.map(l => `'${l}'`).join(', ')}`;
    }

    if (gameState.guessesMade.length > 0) {
        prompt += `\n\n**Previous Guesses and Results (for context):**`;
        gameState.guessesMade.forEach(guess => {
            const resultString = guess.results.map(r => `(${r.letter}:${r.color}@${r.position + 1})`).join(' ');
            prompt += `\n- Guess ${guess.guessNumber}: ${guess.word} -> ${resultString}`;
        });
    }

    prompt += `\n\n**Your Task:**
Suggest the single best 5-letter English word that fits all the known information. The word must contain all 'green' and 'yellow' letters, and none of the 'gray' letters. It must also avoid 'yellow' letters at their previously guessed 'wrong' positions. The word must be exactly ${WORD_LENGTH} letters long. Only respond with the word.`;


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
