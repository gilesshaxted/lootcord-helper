const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { TARGET_GAME_BOT_ID, WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker');

// Configuration specific to this listener
// The channel ID where Wordle games will be played (matches LOG_GAME_CHANNEL_ID)
const TARGET_WORDLE_CHANNEL_ID = '1429872409233850478'; 

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // --- Only process messages in the target Wordle channel ---
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID) {
            return; 
        }

        // --- Determine Message Source and Intent ---
        const isGameBot = message.author.id === TARGET_BOT_ID;
        const isSelfBot = message.author.id === client.user.id;
        const isUserInitiating = message.content.toLowerCase().startsWith('t-wordle');

        // Ignore messages from this bot, or from non-target bots/non-initiating users
        if (!isGameBot && !isUserInitiating) {
            if (isSelfBot) {
                console.log(`[Wordle Solver - Debug] Ignoring message in target channel: From self (${message.author.tag}).`);
            }
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


        // 1. --- Game Start Detection (The game bot's initial message) ---
        if (isGameBot && message.content.includes('You will have 6 tries to guess the word correctly') && message.embeds.length > 0) {
            const embedDescription = message.embeds[0].description;
            const initialRewardRegex = /Reward:.*?\n\n(<:medium_gray_square:\d+>){5}/s;
            
            if (embedDescription && initialRewardRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);
                await message.channel.send('Wordle Solver: Game detected! Initializing...'); 
                
                let playerUserId = null;
                try {
                     const userStartMessage = await message.channel.messages.fetch({ limit: 5 }).then(msgs => 
                         msgs.find(m => !m.author.bot && m.content.toLowerCase().startsWith('t-wordle'))
                     );
                     playerUserId = userStartMessage ? userStartMessage.author.id : null;
                } catch(e) {
                    console.error("Wordle Solver: Failed to fetch player ID during startup.", e.message);
                }
                
                const initialGameState = {
                    channelId: channelId,
                    userId: message.author.id, // Bot's message author (Lootcord)
                    playerUserId: playerUserId, 
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
                    console.log(`[Wordle Solver - Debug] Initialized game state for channel ${channelId}. Player ID: ${playerUserId}`);

                    const bestStartingWord = await getLLMWordleSuggestion(initialGameState, client);

                    if (bestStartingWord) {
                        // Store the initial suggestion as the word for Guess #1 so the next result handler can infer it.
                        initialGameState.guessesMade.push({ suggestedWord: bestStartingWord });
                        await updateDoc(gameDocRef, { guessesMade: initialGameState.guessesMade, playerUserId: playerUserId }); 
                        
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


        // 2. --- Subsequent Guess Results Detection (The game bot's edited message) ---
        const guessContentMatch = message.content.match(/Guess #(\d+)\s*·\s*\*\*(\d+)\*\* guesses remaining/);
        
        if (isGameBot && guessContentMatch && message.embeds.length > 0) {
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

            // --- Infer the guessed word from the state memory ---
            let guessedWord = 'UNKNOWN';
            const guessIndex = currentGuessNumber - 1; 
            
            if (gameState.guessesMade.length > guessIndex && gameState.guessesMade[guessIndex].suggestedWord) {
                guessedWord = gameState.guessesMade[guessIndex].suggestedWord;
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
            const currentGuessEmojiRow = emojiRows[guessIndex]; 

            if (!currentGuessEmojiRow || currentGuessEmojiRow.length === 0) {
                console.warn(`Wordle Solver: Could not find valid emoji row for guess #${currentGuessNumber} in #${message.channel.name}.`);
                await message.channel.send(`Wordle Solver: Error parsing results for guess #${currentGuessNumber}. Could not find emoji row.`);
                return;
            }
            
            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            
            // ----------------------------------------------------
            // NEW: Acknowledge and summarize the guess result
            // ----------------------------------------------------
            let feedback = `**Guess #${currentGuessNumber} (\`${guessedWord}\`):**\n`;
            
            parsedResults.forEach((result, pos) => {
                const icon = result.color === 'green' ? '✅' : (result.color === 'yellow' ? '⚠️' : '❌');
                const description = result.color === 'green'
                    ? 'Correct letter, correct position'
                    : (result.color === 'yellow'
                        ? 'Correct letter, wrong position'
                        : 'Letter not in word');
                
                feedback += `${icon} **${result.letter.toUpperCase()}** at position ${pos + 1}: ${description}\n`;
            });
            
            await message.channel.send({ content: feedback });
            // ----------------------------------------------------
            
            
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
                    // Store the suggestion for the *next* guess (Guess #N+1).
                    // This creates the placeholder for the next inference loop.
                    gameState.guessesMade.push({ suggestedWord: nextSuggestedWord }); 
                    await updateDoc(gameDocRef, { guessesMade: gameState.guessesMade });
                    
                    // Suggest the user types the next suggested word
                    await message.channel.send({ content: `Wordle Solver: My suggestion for guess #${currentGuessNumber + 1} is: \`${nextSuggestedWord}\`\n\n**Please input this word into the game modal.**` });
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                    console.log(`Wordle Solver: Suggested next word '${nextSuggestedWord}' in #${message.channel.name}`);
                } else {
                    await message.channel.send({ content: 'Wordle Solver: Could not determine a good next word. Please try your best!' });
                }
            } else if (gameState.status === 'solved') {
                // If solved here, the word is the guessedWord. 
                await message.channel.send({ content: `Wordle Solver: Game SOLVED! The word was \`${guessedWord}\`.` });
            }
        }
        
        // 3. --- Game End Detection (Final message for lost/missed games) ---
        // This handler catches the final message from the game bot confirming the loss or win.
        if (isGameBot && (message.content.includes("You've exhausted all of your guesses. The word was **") || message.content.includes("You won") || message.content.includes("You ran out of time to guess the correct word"))) {
            const gameDocSnap = await getDoc(gameDocRef);
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') { 
                let gameState = gameDocSnap.data();
                
                const lostWordMatch = message.content.match(/The word was \*\*(.*?)\*\*/);
                const finalWord = lostWordMatch ? lostWordMatch[1].toUpperCase() : 'UNKNOWN';

                if (message.content.includes("You've exhausted all of your guesses.") || message.content.includes("You ran out of time to guess the correct word")) {
                    gameState.status = 'lost';
                } else if (message.content.includes("You won")) {
                    gameState.status = 'solved';
                }
                
                // Final update, ensuring the status is marked as finished.
                await updateDoc(gameDocRef, { status: gameState.status });
                
                console.log(`Wordle Solver: Game ENDED (Final message caught) in #${message.channel.name}. Status: ${gameState.status}, Word: ${finalWord}.`);
                
                // Only send a final message if the main guess handler didn't (e.g., if it was lost)
                if (gameState.status === 'lost') {
                   await message.channel.send({ content: `Wordle Solver: Game LOST! The word was \`${finalWord}\`.` });
                }
            }
        }
    },
};
