const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { WORD_LENGTH, parseEmojiRow, updateWordleGameState, getLLMWordleSuggestion } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker');

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1429872409233850478'; 
const TARGET_BOT_ID = '493316754689359874'; 


// --- Utility to handle the core guess result logic ---
async function processGuessResult(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const isGameBot = message.author.id === TARGET_BOT_ID;
    const guessContentMatch = message.content.match(/Guess #(\d+)\s*·\s*\*\*(\d+)\*\* guesses remaining/);
    
    // --------------------------------------------------------------------------------
    // 2. --- Subsequent Guess Results Detection (Triggered by EDIT/CREATE event) ---
    // --------------------------------------------------------------------------------
    
    if (isGameBot && guessContentMatch && message.embeds.length > 0) {
        const currentGuessNumber = parseInt(guessContentMatch[1], 10);
        const embedDescription = message.embeds[0].description;

        console.log(`[Wordle Solver - Debug] Detected guess result message for Guess #${currentGuessNumber}.`);

        const channelId = message.channel.id;
        const gameDocRef = doc(collection(db, `WordleGames`), channelId);

        // Fetch current game state
        const gameDocSnap = await getDoc(gameDocRef);
        if (!gameDocSnap.exists() || gameDocSnap.data().status !== 'active') {
            console.log(`Wordle Solver: No active game found for #${message.channel.name}. Initializing or Ignoring.`);
            
            // If this is the start (Guess #1) and no state exists, initialize it now.
            if (currentGuessNumber === 1) {
                 const initialGameState = await initializeGameStateAndSuggestWord(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
                 if (initialGameState) {
                     // Game state is initialized, but we need to re-run the result logic on the *next* edit.
                     // The successful initialization handles sending the first suggestion and saving the state.
                     return; 
                 }
            }
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
        
        // The word submitted for *this* result (Guess #N) is the word suggested at the end of the *previous* turn (Guess #N-1).
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
            await message.channel.send({ content: `Wordle Solver: Error parsing results for guess #${currentGuessNumber}. Could not find emoji row.` });
            return;
        }
        
        const parsedResults = parseEmojiRow(currentGuessEmojiRow);
        
        // ----------------------------------------------------
        // Acknowledge and summarize the guess result
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
}

// Helper to initialize game state and send first suggestion
async function initializeGameStateAndSuggestWord(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const channelId = message.channel.id;
    const gameDocRef = doc(collection(db, `WordleGames`), channelId);

    let playerUserId = null;
    try {
         // Find the user who sent the initiating 't-wordle' command
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

    await setDoc(gameDocRef, initialGameState);
    console.log(`[Wordle Solver - Debug] Initialized game state for channel ${channelId}. Player ID: ${playerUserId}`);

    const bestStartingWord = await getLLMWordleSuggestion(initialGameState, client);

    if (bestStartingWord) {
        // Store the initial suggestion as the word for Guess #1 so the next result handler can infer it.
        initialGameState.guessesMade.push({ suggestedWord: bestStartingWord });
        await updateDoc(gameDocRef, { guessesMade: initialGameState.guessesMade, playerUserId: playerUserId }); 
        
        // This is the initial suggested word response for the user
        await message.channel.send({ content: `Wordle Solver: My best starting word is: \`${bestStartingWord}\`\n\n**Please input this word into the game modal.**` });
        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
        return initialGameState;
    }
    return null;
}


module.exports = {
    // This is the primary messageCreate entry point. It handles the initial setup command.
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID || !message.guild || !isFirestoreReady) return;
        
        const isGameBot = message.author.id === TARGET_BOT_ID;
        const isUserInitiating = message.content.toLowerCase().startsWith('t-wordle');

        if (isUserInitiating) {
            // Check if the instructional message is already in the cache (meaning a game is starting)
            const recentMessages = await message.channel.messages.fetch({ limit: 5 });
            const instructionalMessage = recentMessages.find(m => m.author.id === TARGET_BOT_ID && m.content.includes('You will have 6 tries to guess the word correctly'));
            
            if (instructionalMessage) {
                 // Ignore the t-wordle message here; the subsequent messageEdit will handle the initialization.
                 // This ensures the solver doesn't try to run until the grid is available.
                 return;
            }
        }
        
        // If the game bot sends the initial instructional message (pre-edit)
        if (isGameBot && message.content.includes('You will have 6 tries to guess the word correctly') && message.embeds.length > 0) {
            // The logic here is now mostly redundant since the MESSAGE_EDIT handles the grid.
            // We ensure we don't try to solve the game from the instructional message.
             return;
        }

        // We assume all game progress updates (Guess #X) will be handled by the messageUpdate listener.

        // --- Game End Detection (Final message for missed games) ---
        if (isGameBot && (message.content.includes("You've exhausted all of your guesses. The word was **") || message.content.includes("You won") || message.content.includes("You ran out of time to guess the correct word"))) {
             // Use the specific guess result processor logic to handle the final status
             const gameDocSnap = await getDoc(gameDocRef);
             if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') { 
                  let gameState = gameDocSnap.data();
                  // Force status update and final message if status is active
                  if (message.content.includes("You've exhausted all of your guesses.")) { gameState.status = 'lost'; } 
                  else if (message.content.includes("You won")) { gameState.status = 'solved'; }
                  await updateDoc(gameDocRef, { status: gameState.status });
                  
                  if (gameState.status === 'lost') {
                     const lostWordMatch = message.content.match(/The word was \*\*(.*?)\*\*/);
                     const finalWord = lostWordMatch ? lostWordMatch[1].toUpperCase() : 'UNKNOWN';
                     await message.channel.send({ content: `Wordle Solver: Game LOST! The word was \`${finalWord}\`.` });
                  } else if (gameState.status === 'solved') {
                     // If it's a new win message, just acknowledge it.
                     console.log(`Wordle Solver: Win confirmed via MESSAGE_CREATE end signal.`);
                  }
             }
        }
    },
    
    // --- Manual Registration for Message Edit (CRITICAL GAME LOOP) ---
    async messageUpdate(oldMessage, newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (newMessage.channel.id !== TARGET_WORDLE_CHANNEL_ID || !newMessage.guild || !isFirestoreReady) return;
        
        const isGameBot = newMessage.author.id === TARGET_BOT_ID;
        
        // The core game loop happens ONLY on the message edit from the game bot
        if (isGameBot && newMessage.content.includes('Guess #')) {
            // Check if the game state exists; if not, this is the very first Guess #1 edit.
            const gameDocRef = doc(collection(db, `WordleGames`), newMessage.channel.id);
            const gameDocSnap = await getDoc(gameDocRef);

            if (!gameDocSnap.exists() || gameDocSnap.data().guessesMade.length === 0) {
                // This is the first edit of the game message (Guess #1) - initialize state and run first suggestion
                await initializeGameStateAndSuggestWord(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
                return;
            }
            
            // If state exists and this is a subsequent guess, process the result and suggest the next word.
            await processGuessResult(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
        }
    }
};
