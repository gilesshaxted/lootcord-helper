const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore'); // Firestore functions
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers'); // Import helpers
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1394316724819591318'; // The channel where Wordle games will be played

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- NEW: Only process messages in the target Wordle channel ---
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID) {
            // console.log(`Wordle Solver: Ignoring message in non-target channel #${message.channel.name}`); // Too verbose for general logging
            return;
        }

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[Wordle Solver - Debug] Ignoring message: Not from target game bot (${message.author.tag}).`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Wordle Solver - Debug] Ignoring message: From self (${message.author.tag}).`);
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
            console.log(`[Wordle Solver - Debug] Ignoring message: Not in a guild.`);
            return;
        }

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
            
            console.log(`[Wordle Solver - Debug] Detected potential game start message.`);
            console.log(`[Wordle Solver - Debug] Embed Description: \n\`\`\`\n${embedDescription}\n\`\`\``);

            if (embedDescription && allGraySquaresRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);

                // Initialize game state in Firestore
                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id, // The game bot's user ID
                    playerUserId: null, // We don't know the player's ID yet, will get it from first guess
                    status: 'active',
                    wordLength: WORD_LENGTH,
                    guessesMade: [], // Store previous guesses and their results
                    currentGuessNumber: 0,
                    correctLetters: {}, // {index: letter}
                    misplacedLetters: {}, // {letter: [indices where it's not]}
                    wrongLetters: [], // [letters]
                    gameStartedAt: new Date().toISOString(),
                    gameBotMessageId: message.id // Store the game bot's initial message ID for context
                };

                try {
                    await setDoc(gameDocRef, initialGameState);
                    console.log(`[Wordle Solver - Debug] Initialized game state for channel ${channelId}:`, JSON.stringify(initialGameState, null, 2));

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

            console.log(`[Wordle Solver - Debug] Detected guess result message for Guess #${currentGuessNumber}.`);
            console.log(`[Wordle Solver - Debug] Embed Description: \n\`\`\`\n${embedDescription}\n\`\`\``);

            // Fetch current game state
            const gameDocSnap = await getDoc(gameDocRef);

            if (!gameDocSnap.exists() || gameDocSnap.data().status !== 'active') {
                console.log(`Wordle Solver: No active game found for #${message.channel.name} or game not active. Ignoring guess result.`);
                return; // No active game to track
            }

            let gameState = gameDocSnap.data();
            console.log(`[Wordle Solver - Debug] Current Game State (before update):`, JSON.stringify(gameState, null, 2));


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
            console.log(`[Wordle Solver - Debug] Current Guess Emoji Row: \`${currentGuessEmojiRow}\``);


            // Parse the emoji row to get the guessed word and its results
            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            console.log(`[Wordle Solver - Debug] Parsed Emoji Results:`, JSON.stringify(parsedResults, null, 2));

            // Extract the guessed word from the parsed results (e.g., from :green_c::green_r::green_e::green_p::green_t: -> CREPT)
            const guessedWord = parsedResults.map(r => r.letter).join('').toUpperCase();
            console.log(`[Wordle Solver - Debug] Extracted Guessed Word: \`${guessedWord}\``);


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
            console.log(`[Wordle Solver - Debug] Updated Game State (after update):`, JSON.stringify(gameState, null, 2));


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
                console.log(`[Wordle Solver - Debug] Requesting next word suggestion from LLM...`);
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
