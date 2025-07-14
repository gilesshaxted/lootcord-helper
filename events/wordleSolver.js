const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore'); // Firestore functions
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers'); // Import helpers
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Wordle Solver: Firestore not ready. Skipping processing.');
            return;
        }

        const channelId = message.channel.id;
        const gameDocRef = doc(collection(db, `WordleGames`), channelId);

        // --- Game Start Detection (First message with gray squares) ---
        if (message.content.includes('You will have 6 tries to guess the word correctly') && message.embeds.length > 0) {
            const embedDescription = message.embeds[0].description;
            // Check if all 6 rows are initially gray squares
            const allGraySquaresRegex = /^(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}$/;
            
            if (embedDescription && allGraySquaresRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}.`);

                // Initialize game state in Firestore
                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id, // The game bot's user ID
                    playerUserId: null, // We don't know the player's ID yet, will get it from first guess
                    status: 'active',
                    wordLength: WORD_LENGTH,
                    guessesMade: [],
                    currentGuessNumber: 0,
                    correctLetters: {}, // {index: letter}
                    misplacedLetters: {}, // {letter: [indices where it's not]}
                    wrongLetters: [], // [letters]
                    gameStartedAt: new Date().toISOString(),
                    gameBotMessageId: message.id // Store the game bot's initial message ID for context
                };

                try {
                    await setDoc(gameDocRef, initialGameState);
                    console.log(`Wordle Solver: Initialized game state for channel ${channelId}`);

                    // Get best starting word from LLM
                    const bestStartingWord = await getLLMWordleSuggestion(initialGameState, client);

                    if (bestStartingWord) {
                        await message.channel.send({ content: `Wordle Solver: My best starting word is: \`${bestStartingWord}\`\n\nPlease type \`${bestStartingWord}\` into the game.` });
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps
                        console.log(`Wordle Solver: Suggested first word '${bestStartingWord}' in #${message.channel.name}`);
                    } else {
                        await message.channel.send({ content: 'Wordle Solver: Could not determine a good starting word. Please try a common word like CRANE.' });
                    }
                } catch (error) {
                    console.error(`Wordle Solver: Error starting game in #${message.channel.name}:`, error);
                }
                return; // Game start message processed
            }
        }

        // --- Subsequent Guess Results Detection ---
        const guessContentMatch = message.content.match(/Guess #(\d+)\s*\/\s*\d+\s*·\s*\d+\s*guesses remaining/);
        
        if (guessContentMatch && message.embeds.length > 0) {
            const currentGuessNumber = parseInt(guessContentMatch[1], 10);
            const embedDescription = message.embeds[0].description;

            // Fetch current game state
            const gameDocSnap = await getDoc(gameDocRef);

            if (!gameDocSnap.exists() || gameDocSnap.data().status !== 'active') {
                console.log(`Wordle Solver: No active game found for #${message.channel.name} or game not active. Ignoring guess result.`);
                return; // No active game to track
            }

            let gameState = gameDocSnap.data();

            // Ensure we are processing the next expected guess
            if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
                console.log(`Wordle Solver: Ignoring out-of-order guess #${currentGuessNumber} (expected #${gameState.currentGuessNumber + 1}) in #${message.channel.name}.`);
                return;
            }

            // Extract the emoji rows
            const emojiRows = embedDescription.split('\n').filter(row => row.includes(':')); // Filter out empty lines

            // Get the emoji row for the current guess
            const currentGuessEmojiRow = emojiRows[currentGuessNumber - 1]; // 0-indexed array

            if (!currentGuessEmojiRow) {
                console.warn(`Wordle Solver: Could not find emoji row for guess #${currentGuessNumber} in #${message.channel.name}.`);
                return;
            }

            // Parse the emoji row to get the guessed word and its results
            const parsedResults = parseEmojiRow(currentGuessEmojiRow);

            // Extract the guessed word from the parsed results (e.g., from :green_c::green_r::green_e::green_p::green_t: -> CREPT)
            const guessedWord = parsedResults.map(r => r.letter).join('').toUpperCase();

            // Check for game end conditions
            const allGreen = parsedResults.every(r => r.color === 'green');
            const isLastGuess = currentGuessNumber === 6;

            if (allGreen) {
                gameState.status = 'solved';
                console.log(`Wordle Solver: Game SOLVED in #${message.channel.name} with word '${guessedWord}'!`);
            } else if (isLastGuess) {
                gameState.status = 'lost';
                console.log(`Wordle Solver: Game LOST in #${message.channel.name}.`);
            }

            // Update game state in memory
            gameState = updateWordleGameState(gameState, guessedWord, parsedResults);

            // Save updated game state to Firestore
            try {
                await updateDoc(gameDocRef, gameState);
                console.log(`Wordle Solver: Updated game state for #${message.channel.name} after guess #${currentGuessNumber}.`);
            } catch (error) {
                console.error(`Wordle Solver: Error updating game state for #${message.channel.name}:`, error);
                return;
            }

            // If game is not over, suggest next word
            if (gameState.status === 'active') {
                const nextSuggestedWord = await getLLMWordleSuggestion(gameState, client);

                if (nextSuggestedWord) {
                    await message.channel.send({ content: `Wordle Solver: My suggestion for guess #${currentGuessNumber + 1} is: \`${nextSuggestedWord}\`` });
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps
                    console.log(`Wordle Solver: Suggested next word '${nextSuggestedWord}' in #${message.channel.name}`);
                } else {
                    await message.channel.send({ content: 'Wordle Solver: Could not determine a good next word. Please try your best!' });
                }
            } else {
                // Game ended, send final message
                await message.channel.send({ content: `Wordle Solver: Game ${gameState.status.toUpperCase()}! The word was \`${guessedWord}\`.` });
            }
        }
    },
};
