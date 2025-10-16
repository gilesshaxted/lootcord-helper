const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker');

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1394316724819591318'; // The channel where Wordle games will be played

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- Only process messages in the target Wordle channel ---
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID) {
            return; // Ignore messages not in the designated Wordle channel
        }

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            console.log(`[Wordle Solver - Debug] Ignoring message in target channel: Not from game bot (${message.author.tag}).`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Wordle Solver - Debug] Ignoring message in target channel: From self (${message.author.tag}).`);
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
            console.log(`[Wordle Solver - Debug] Ignoring message: Not in a guild.`);
            return;
        }

        // --- NEW: Log every message from the target game bot in this channel ---
        console.log(`\n--- [Wordle Solver - Debug] Incoming Message from Game Bot ---`);
        console.log(`From: ${message.author.tag} (ID: ${message.author.id})`);
        console.log(`Channel: #${message.channel.name} (ID: ${message.channel.id})`);
        console.log(`Message ID: ${message.id}`);
        console.log(`Content: \n\`\`\`\n${message.content || 'N/A'}\n\`\`\``);
        if (message.embeds.length > 0) {
            console.log(`Embeds (${message.embeds.length}):`);
            message.embeds.forEach((embed, index) => {
                console.log(`  Embed ${index + 1} Title: \`${embed.title || 'N/A'}\``);
                console.log(`  Embed ${index + 1} Description: \n\`\`\`\n${embed.description || 'N/A'}\n\`\`\``);
                console.log(`  Embed ${index + 1} Color: \`${embed.color || 'N/A'}\``);
                console.log(`  Embed ${index + 1} Fields: \n\`\`\`json\n${JSON.stringify(embed.fields, null, 2) || 'N/A'}\n\`\`\``);
            });
        } else {
            console.log(`Embeds: (None)`);
        }
        console.log(`--- End Incoming Message Debug ---\n`);
        // End of new debug logging for every message from target bot


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
            // Regex to match the initial state with "Reward: ..." and 6 rows of gray squares
            const allGraySquaresRegex = /^Reward:.*?\n\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}\n(<:medium_gray_square:\d+>){5}$/s;
            
            if (embedDescription && allGraySquaresRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);
                await message.channel.send('Wordle Solver: Game detected! Initializing...'); // User feedback

                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id,
                    playerUserId: null,
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
                    console.log(`[Wordle Solver - Debug] Initialized game state for channel ${channelId}:`, JSON.stringify(initialGameState, null, 2));

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
                    await message.channel.send('Wordle Solver: An error occurred during game initialization. Please try starting a new game.');
                }
                return; // Game start message processed
            }
        }

        // --- Subsequent Guess Results Detection ---
        // Trigger: Message content matches "Guess #X · Y guesses remaining"
        // AND there's an embed.
        const guessContentMatch = message.content.match(/Guess #(\d+)\s*·\s*\*\*(\d+)\*\* guesses remaining/);
        
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

            // Ensure we are processing the next expected guess
            if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
                console.log(`Wordle Solver: Ignoring out-of-order guess #${currentGuessNumber} (expected #${gameState.currentGuessNumber + 1}) in #${message.channel.name}.`);
                return;
            }

            // Extract the emoji rows
            // The first line of the description is "Reward: ...", so we need to skip it.
            const rawEmojiRows = embedDescription.split('\n').slice(2); // Skip Reward line and blank line
            const emojiRows = rawEmojiRows.filter(row => row.includes('<:')); // Filter out empty or non-emoji lines

            // Get the emoji row for the current guess
            const currentGuessEmojiRow = emojiRows[currentGuessNumber - 1]; // 0-indexed array

            if (!currentGuessEmojiRow || currentGuessEmojiRow.length === 0) {
                console.warn(`Wordle Solver: Could not find valid emoji row for guess #${currentGuessNumber} in #${message.channel.name}. Raw rows:`, emojiRows);
                await message.channel.send(`Wordle Solver: Error parsing results for guess #${currentGuessNumber}. Could not find emoji row.`);
                return;
            }
            console.log(`[Wordle Solver - Debug] Current Guess Emoji Row: \`${currentGuessEmojiRow}\``);


            // Parse the emoji row to get the guessed word and its results
            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            console.log(`[Wordle Solver - Debug] Parsed Emoji Results:`, JSON.stringify(parsedResults, null, 2));

            // --- Infer guessed word from the previous guess in game state ---
            // This is crucial because the game bot only shows emoji results, not the word itself.
            // We assume the player typed the word we suggested last turn.
            const guessedWord = gameState.guessesMade.length > 0
                                ? gameState.guessesMade[gameState.guessesMade.length - 1].word
                                : 'UNKNOWN'; // Should not happen for guess #2+

            if (guessedWord === 'UNKNOWN') {
                console.error(`Wordle Solver: Could not infer guessed word for guess #${currentGuessNumber}. Game state:`, JSON.stringify(gameState));
                await message.channel.send({ content: `Wordle Solver: Error inferring your last guess. Please ensure you type my suggested words.` });
                return;
            }
            console.log(`[Wordle Solver - Debug] Inferred Guessed Word: \`${guessedWord}\``);


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
                await message.channel.send(`Wordle Solver: An error occurred while saving game state for guess #${currentGuessNumber}.`);
                return;
            }

            // If game is not over, suggest next word
            if (gameState.status === 'active') {
                console.log(`[Wordle Solver - Debug] Requesting next word suggestion from LLM...`);
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
