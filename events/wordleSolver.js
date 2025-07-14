const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker');

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1394316724819591318'; // The channel where Wordle games will be played

module.exports = {
    name: 'messageCreate', // Listen for all message creations
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- Only process messages in the target Wordle channel ---
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID) {
            return; // Ignore messages not in the designated Wordle channel
        }

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            return;
        }
        if (message.author.id === client.user.id) {
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
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
        // Trigger: Message content includes 'Guess #1 / 6 · **6** guesses remaining'
        // AND embed description has 6 rows of 5 gray squares.
        if (message.content.includes('Guess #1 / 6 · **6** guesses remaining') && message.embeds.length > 0) {
            const embedDescription = message.embeds[0].description;
            // Regex to match the exact start state with Reward line and all gray squares
            const allGraySquaresRegex = /^Reward:.*?\n\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}$/s;
            
            if (embedDescription && allGraySquaresRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);

                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id,
                    playerUserId: null, // We don't know the player's ID yet
                    status: 'active',
                    wordLength: WORD_LENGTH,
                    guessesMade: [],
                    currentGuessNumber: 0,
                    correctLetters: {},
                    misplacedLetters: {},
                    wrongLetters: [],
                    gameStartedAt: new Date().toISOString(),
                    gameBotMessageId: message.id
                };

                try {
                    await setDoc(gameDocRef, initialGameState);
                    console.log(`Wordle Solver: Initialized game state for channel ${channelId}.`);

                    const bestStartingWord = await getLLMWordleSuggestion(initialGameState, client);

                    if (bestStartingWord) {
                        await message.channel.send({ content: `Wordle Solver: My best starting word is: \`${bestStartingWord}\`\n\nPlease type \`${bestStartingWord}\` into the game.` });
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
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
        // Trigger: Message content matches "Guess #X · **Y** guesses remaining"
        // AND there's an embed.
        const guessContentMatch = message.content.match(/Guess #(\d+)\s*·\s*\*\*(\d+)\*\* guesses remaining/); // Adjusted regex based on log
        
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
            // The first line of the description is "Reward: ...", so we need to skip it.
            const rawEmojiRows = embedDescription.split('\n').slice(2); // Skip Reward line and blank line below it
            const emojiRows = rawEmojiRows.filter(row => row.includes('<:')); // Filter out empty or non-emoji lines

            // Get the emoji row for the current guess
            const currentGuessEmojiRow = emojiRows[currentGuessNumber - 1]; // 0-indexed array

            if (!currentGuessEmojiRow || currentGuessEmojiRow.length === 0) {
                console.warn(`Wordle Solver: Could not find valid emoji row for guess #${currentGuessNumber} in #${message.channel.name}. Raw rows:`, emojiRows);
                return;
            }

            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            
            // Infer the guessed word from the previous guess in game state
            const guessedWord = gameState.guessesMade.length > 0
                                ? gameState.guessesMade[gameState.guessesMade.length - 1].word
                                : 'UNKNOWN'; // Should not happen for guess #2+

            if (guessedWord === 'UNKNOWN') {
                console.error(`Wordle Solver: Could not infer guessed word for guess #${currentGuessNumber}. Game state:`, JSON.stringify(gameState));
                await message.channel.send({ content: `Wordle Solver: Error inferring your last guess. Please ensure you type my suggested words.` });
                return;
            }

            // Check for game end conditions
            const allGreen = parsedResults.every(r => r.color === 'green');
            const isLastGuess = currentGuessNumber === 6; // Total guesses are 6

            if (allGreen) {
                gameState.status = 'solved';
                console.log(`Wordle Solver: Game SOLVED in #${message.channel.name} with word '${guessedWord}'!`);
            } else if (isLastGuess) {
                gameState.status = 'lost';
                console.log(`Wordle Solver: Game LOST in #${message.channel.name}. The word was ${message.content.match(/\*\*(.*?)\*\*/)?.[1] || 'unknown'}.`); // Extract word from final message
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
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                    console.log(`Wordle Solver: Suggested next word '${nextSuggestedWord}' in #${message.channel.name}`);
                } else {
                    await message.channel.send({ content: 'Wordle Solver: Could not determine a good next word. Please try your best!' });
                }
            } else {
                // Game ended, send final message
                let finalWord = guessedWord;
                // If lost, try to extract the word from the final message content
                if (gameState.status === 'lost') {
                    const lostWordMatch = message.content.match(/The word was \*\*(.*?)\*\*/);
                    if (lostWordMatch && lostWordMatch[1]) {
                        finalWord = lostWordMatch[1].toUpperCase();
                    }
                }
                await message.channel.send({ content: `Wordle Solver: Game ${gameState.status.toUpperCase()}! The word was \`${finalWord}\`.` });
            }
        }
        // --- Game End Detection (Final message for lost games) ---
        // This handles the case where the game bot sends a "You've exhausted all of your guesses." message
        // which signifies a loss, and the previous guess was the 6th.
        if (message.content.includes("You've exhausted all of your guesses. The word was **") && message.embeds.length > 0) {
            const gameDocSnap = await getDoc(gameDocRef);
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') {
                let gameState = gameDocSnap.data();
                gameState.status = 'lost';
                const lostWordMatch = message.content.match(/The word was \*\*(.*?)\*\*/);
                const finalWord = lostWordMatch ? lostWordMatch[1].toUpperCase() : 'UNKNOWN';
                
                // Update the last guess's word if it was 'UNKNOWN' or not set
                if (gameState.guessesMade.length > 0) {
                    const lastGuess = gameState.guessesMade[gameState.guessesMade.length - 1];
                    if (lastGuess.word === 'UNKNOWN' || !lastGuess.word) {
                        lastGuess.word = finalWord;
                    }
                }

                try {
                    await updateDoc(gameDocRef, gameState);
                    console.log(`Wordle Solver: Game LOST in #${message.channel.name}. Final word: ${finalWord}.`);
                    await message.channel.send({ content: `Wordle Solver: Game LOST! The word was \`${finalWord}\`.` });
                } catch (error) {
                    console.error(`Wordle Solver: Error updating game state to LOST for #${message.channel.name}:`, error);
                }
            }
        }
    },
};
