const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker');

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1429872409233850478'; // The channel where Wordle games will be played

// REMOVED: USER_GUESS_REGEX is no longer needed since input is via modal/button.

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- Only process messages in the target Wordle channel ---
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID) {
            return; 
        }

        // Ignore messages not from the target game bot or from this bot itself
        if (message.author.id !== TARGET_GAME_BOT_ID && message.author.id !== client.user.id) {
            // Check if a user is trying to start the game (we still need this to initialize state)
            if (message.content.toLowerCase().startsWith('t-wordle')) {
                // Do not return; let it process the game start detection below.
            } else {
                return;
            }
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

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Wordle Solver: Firestore not ready. Skipping processing.');
            return;
        }

        const channelId = message.channel.id;
        const gameDocRef = doc(collection(db, `WordleGames`), channelId);

        // --- Game Start Detection (The game bot's initial message) ---
        if (message.content.includes('You will have 6 tries to guess the word correctly') && message.embeds.length > 0) {
            const embedDescription = message.embeds[0].description;
            const initialRewardRegex = /Reward:.*?\n\n(<:medium_gray_square:\d+>){5}/s;
            
            if (embedDescription && initialRewardRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);
                await message.channel.send('Wordle Solver: Game detected! Initializing...'); 

                // Reset game state, ensuring playerUserId is null until the first guess is inferred.
                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id, // Bot's message author
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
                    console.log(`[Wordle Solver - Debug] Initialized game state for channel ${channelId}.`);

                    const bestStartingWord = await getLLMWordleSuggestion(initialGameState, client);

                    if (bestStartingWord) {
                        // Suggest the user types the word for the modal input
                        await message.channel.send({ content: `Wordle Solver: My best starting word is: \`${bestStartingWord}\`\n\n**Please input this word into the game modal.**` });
                        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                        console.log(`Wordle Solver: Suggested first word '${bestStartingWord}' in #${message.channel.name}`);
                    } else {
                        await message.channel.send({ content: 'Wordle Solver: Could not determine a good starting word. Please try a common word like CRANE.' });
                    }
                } catch (error) {
                    console.error(`Wordle Solver: Error starting game in #${message.channel.name}:`, error);
                    await message.channel.send('Wordle Solver: An error occurred during game initialization. Please try starting a new game.');
                }
                return; 
            }
        }

        // --- Subsequent Guess Results Detection (The game bot's edited message) ---
        const guessContentMatch = message.content.match(/Guess #(\d+)\s*·\s*\*\*(\d+)\*\* guesses remaining/);
        
        if (guessContentMatch && message.embeds.length > 0) {
            const currentGuessNumber = parseInt(guessContentMatch[1], 10);
            const embedDescription = message.embeds[0].description;

            console.log(`[Wordle Solver - Debug] Detected guess result message for Guess #${currentGuessNumber}.`);

            // Fetch current game state
            const gameDocSnap = await getDoc(gameDocRef);
            if (!gameDocSnap.exists() || gameDocSnap.data().status !== 'active') {
                console.log(`Wordle Solver: No active game found for #${message.channel.name}. Ignoring guess result.`);
                return; 
            }
            let gameState = gameDocSnap.data();

            // Ensure we are processing the next expected guess
            if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
                console.log(`Wordle Solver: Ignoring out-of-order guess #${currentGuessNumber} (expected #${gameState.currentGuessNumber + 1}) in #${message.channel.name}.`);
                return;
            }

            // --- CRITICAL FIX: Infer the guessed word from the solver's last suggestion ---
            // We assume the user followed the last *successful* suggestion.
            let guessedWord = 'UNKNOWN';
            
            // The word for Guess #1 comes from the response to the initialization.
            if (gameState.guessesMade.length === 0) {
                 // Fetch the bot's suggestion message to get the word
                 try {
                     const lastBotMessage = await message.channel.messages.fetch({ limit: 5 }).then(msgs => 
                         msgs.find(m => m.author.id === client.user.id && m.content.includes('My best starting word is:'))
                     );
                     const wordMatch = lastBotMessage?.content.match(/`(\w+)`/);
                     if (wordMatch) {
                         guessedWord = wordMatch[1].toUpperCase();
                         // We still don't know who the player is, but we have the word.
                     }
                 } catch (error) {
                     console.error("Wordle Solver: Failed to fetch bot's starting word suggestion.", error);
                 }
            } else {
                // For subsequent guesses, use the word suggested for the *previous* turn (if available)
                // This assumes the bot suggests Guess #N, and we are processing result for Guess #N.
                // The previous guess's suggested word is the word submitted for this result.
                guessedWord = gameState.guessesMade[gameState.guessesMade.length - 1].suggestedWord || 'UNKNOWN';
            }


            if (guessedWord === 'UNKNOWN') {
                console.error(`Wordle Solver: Could not infer guessed word for guess #${currentGuessNumber}. Cannot proceed.`);
                await message.channel.send({ content: `Wordle Solver: Error inferring the actual word guessed for guess #${currentGuessNumber}. Cannot suggest next word.` });
                return;
            }
            console.log(`[Wordle Solver - Debug] Inferred Guessed Word: \`${guessedWord}\`.`);


            // --- Extract Emoji Results ---
            const rawEmojiRows = embedDescription.split('\n').slice(2); 
            const emojiRows = rawEmojiRows.filter(row => row.includes('<:')); 
            const currentGuessEmojiRow = emojiRows[currentGuessNumber - 1]; 

            if (!currentGuessEmojiRow || currentGuessEmojiRow.length === 0) {
                console.warn(`Wordle Solver: Could not find valid emoji row for guess #${currentGuessNumber} in #${message.channel.name}.`);
                await message.channel.send(`Wordle Solver: Error parsing results for guess #${currentGuessNumber}. Could not find emoji row.`);
                return;
            }
            
            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            
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

            // Update game state in memory (using the inferred guessed word)
            gameState = updateWordleGameState(gameState, guessedWord, parsedResults);

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
                    // Update gameState again to store the suggestion for the *next* turn's inference
                    gameState.guessesMade[gameState.guessesMade.length - 1].suggestedWord = nextSuggestedWord;
                    await updateDoc(gameDocRef, gameState); 
                    
                    // Suggest the user types the next suggested word
                    await message.channel.send({ content: `Wordle Solver: My suggestion for guess #${currentGuessNumber + 1} is: \`${nextSuggestedWord}\`\n\n**Please input this word into the game modal.**` });
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                    console.log(`Wordle Solver: Suggested next word '${nextSuggestedWord}' in #${message.channel.name}`);
                } else {
                    await message.channel.send({ content: 'Wordle Solver: Could not determine a good next word. Please try your best!' });
                }
            } else {
                // Game ended, send final message
                let finalWord = guessedWord;
                // If solved here, the word is the guessedWord. If lost, the next message handles the word extraction.
                if (gameState.status === 'solved') {
                    await message.channel.send({ content: `Wordle Solver: Game SOLVED! The word was \`${finalWord}\`.` });
                }
            }
        }
        
        // --- Game End Detection (Final message for lost games) ---
        // This handler catches the final message from the game bot confirming the loss or win.
        if (message.content.includes("You've exhausted all of your guesses. The word was **") || message.content.includes("You won") && message.embeds.length > 0) {
            const gameDocSnap = await getDoc(gameDocRef);
            if (gameDocSnap.exists() && gameState.status === 'active') { // Check if game state wasn't updated in the previous block
                let gameState = gameDocSnap.data();
                
                // If we reach here, and the status is active, it means the win/loss wasn't processed in the main block.
                // Force status update and extract the final word.
                
                const lostWordMatch = message.content.match(/The word was \*\*(.*?)\*\*/);
                const finalWord = lostWordMatch ? lostWordMatch[1].toUpperCase() : 'UNKNOWN';

                if (message.content.includes("You've exhausted all of your guesses.")) {
                    gameState.status = 'lost';
                } else if (message.content.includes("You won")) {
                    gameState.status = 'solved';
                }
                
                // Update the last guess's word if it was 'UNKNOWN' or not set (using the final word provided by the bot)
                if (gameState.guessesMade.length > 0) {
                    const lastGuessIndex = gameState.guessesMade.length - 1;
                    if (gameState.guessesMade[lastGuessIndex].word === 'UNKNOWN' || !gameState.guessesMade[lastGuessIndex].word) {
                        // The user's last guess was the solution, but we didn't know the word until now.
                        gameState.guessesMade[lastGuessIndex].word = finalWord;
                    }
                }

                try {
                    await updateDoc(gameDocRef, gameState);
                    console.log(`Wordle Solver: Game ENDED (Final message caught) in #${message.channel.name}. Status: ${gameState.status}, Word: ${finalWord}.`);
                    // Only send a final message if the game was truly lost, as the "all green" detection sends the win message.
                    if (gameState.status === 'lost') {
                       await message.channel.send({ content: `Wordle Solver: Game LOST! The word was \`${finalWord}\`.` });
                    }
                } catch (error) {
                    console.error(`Wordle Solver: Error updating game state on final message for #${message.channel.name}:`, error);
                }
            }
        }
    },
};
