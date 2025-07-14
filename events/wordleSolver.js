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
        console.log(`\n--- [Wordle Solver - Debug] Incoming Message ---`);
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
            const allGraySquaresRegex = /^(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}\n(:medium_gray_square:){5}$/;
            
            if (embedDescription && allGraySquaresRegex.test(embedDescription)) {
                console.log(`Wordle Solver: Detected new game start in #${message.channel.name}. Initializing game state.`);

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
                }
                return;
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
                return;
            }

            let gameState = gameDocSnap.data();

            if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
                console.log(`Wordle Solver: Ignoring out-of-order guess #${currentGuessNumber} (expected #${gameState.currentGuessNumber + 1}) in #${message.channel.name}.`);
                return;
            }

            const emojiRows = embedDescription.split('\n').filter(row => row.includes(':'));
            const currentGuessEmojiRow = emojiRows[currentGuessNumber - 1];

            if (!currentGuessEmojiRow) {
                console.warn(`Wordle Solver: Could not find emoji row for guess #${currentGuessNumber} in #${message.channel.name}.`);
                return;
            }

            const parsedResults = parseEmojiRow(currentGuessEmojiRow);
            const guessedWord = parsedResults.map(r => r.letter).join('').toUpperCase();

            const allGreen = parsedResults.every(r => r.color === 'green');
            const isLastGuess = currentGuessNumber === 6;

            if (allGreen) {
                gameState.status = 'solved';
                console.log(`Wordle Solver: Game SOLVED in #${message.channel.name} with word '${guessedWord}'!`);
            } else if (isLastGuess) {
                gameState.status = 'lost';
                console.log(`Wordle Solver: Game LOST in #${message.channel.name}.`);
            }

            gameState = updateWordleGameState(gameState, guessedWord, parsedResults);

            try {
                await updateDoc(gameDocRef, gameState);
                console.log(`Wordle Solver: Updated game state for #${message.channel.name} after guess #${currentGuessNumber}.`);
            } catch (error) {
                console.error(`Wordle Solver: Error updating game state for #${message.channel.name}:`, error);
                return;
            }

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
                await message.channel.send({ content: `Wordle Solver: Game ${gameState.status.toUpperCase()}! The word was \`${guessedWord}\`.` });
            }
        }
    },
};
