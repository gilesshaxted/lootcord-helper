const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
// NOTE: We only keep helpers required for the necessary path and basic structure.
const { WORD_LENGTH } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker'); 

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1429872409233850478'; 
const TARGET_BOT_ID = '493316754689359874'; 

// --- Utility to get the correct game doc reference ---
function getGameDocRef(db, channelId, APP_ID_FOR_FIRESTORE, userId) {
    const gameCollectionPath = `artifacts/${APP_ID_FOR_FIRESTORE}/users/${userId}/WordleGames`;
    return doc(collection(db, gameCollectionPath), channelId);
}

// --- CORE GAME PROCESSOR (Simplified for Acknowledgment) ---
async function processGuessAcknowledgement(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const isGameBot = message.author.id === TARGET_BOT_ID;
    // Regex to capture the current guess number
    const guessContentMatch = message.content.match(/Guess #(\d+)\s*·/); 
    
    if (!isGameBot || !guessContentMatch || message.embeds.length === 0) {
        return;
    }
    
    const currentGuessNumber = parseInt(guessContentMatch[1], 10);
    const channelId = message.channel.id;
    const userId = client.user.id; 
    const gameDocRef = getGameDocRef(db, channelId, APP_ID_FOR_FIRESTORE, userId);

    // Fetch current game state
    const gameDocSnap = await getDoc(gameDocRef);
    let gameState = gameDocSnap.exists() && gameDocSnap.data().status === 'active' ? gameDocSnap.data() : null;

    if (!gameState) {
        return; // Should have been initialized or ended already
    }

    // Check if we already processed this exact guess result. Prevents double-sending messages.
    if (currentGuessNumber <= gameState.currentGuessNumber) {
        return;
    }
    
    // Check if this is the expected next sequential guess
    if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
        return;
    }

    // --- Acknowledge the Guess ---
    await message.channel.send({ content: `✅ Detected **Guess #${currentGuessNumber}**. Ready for the next input.` });


    // --- Update Minimal Game State ---
    // Update the tracker state to prevent future double processing of this specific guess number
    await updateDoc(gameDocRef, {
        currentGuessNumber: currentGuessNumber,
        lastGuessMessageId: message.id,
    });
}

// Helper function that handles the initial game state creation
async function initializeGameStateAndSuggestWord(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const channelId = message.channel.id;
    const userId = client.user.id; 
    const gameDocRef = getGameDocRef(db, channelId, APP_ID_FOR_FIRESTORE, userId);

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
        wordLength: 5, // Hardcoded for standard Wordle
        guessesMade: [], // Array will be populated later
        currentGuessNumber: 0, // Set to 0 initially
        gameStartedAt: new Date().toISOString(),
        gameBotMessageId: message.id
    };

    try {
        await setDoc(gameDocRef, initialGameState);

        // After setting the initial state (currentGuessNumber: 0), immediately process the Guess #1 result
        await processGuessAcknowledgement(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
        
        return initialGameState;
    } catch(error) {
        console.error(`[Wordle Solver - Initialization] CRITICAL ERROR saving state:`, error.message);
        return null;
    }
}


module.exports = {
    // Primary messageCreate for t-wordle and end detection (remains simple)
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.channel.id !== TARGET_WORDLE_CHANNEL_ID || !message.guild || !isFirestoreReady) return;
        
        const isGameBot = message.author.id === TARGET_BOT_ID;
        const isUserInitiating = message.content.toLowerCase().startsWith('t-wordle');

        // Only process t-wordle initiation command
        if (isUserInitiating) {
            const gameDocRef = getGameDocRef(db, message.channel.id, APP_ID_FOR_FIRESTORE, client.user.id);
            const gameDocSnap = await getDoc(gameDocRef);
            
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') {
                return;
            }
            return;
        }

        // --- Game End Detection (Final message for lost/missed games) ---
        if (isGameBot && (message.content.includes("You've exhausted all of your guesses. The word was **") || message.content.includes("You won"))) {
             const gameDocRef = getGameDocRef(db, message.channel.id, APP_ID_FOR_FIRESTORE, client.user.id);
             await updateDoc(gameDocRef, { status: 'finished' });
        }
    },
    
    // --- Manual Registration for Message Edit (CRITICAL GAME LOOP) ---
    async messageUpdate(oldMessage, newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (newMessage.channel.id !== TARGET_WORDLE_CHANNEL_ID || !newMessage.guild || !isFirestoreReady) return;
        
        const isGameBot = newMessage.author.id === TARGET_BOT_ID;
        
        // The core game loop happens ONLY on the message edit from the game bot
        if (isGameBot && newMessage.content.includes('Guess #')) {
            const gameDocRef = getGameDocRef(db, newMessage.channel.id, APP_ID_FOR_FIRESTORE, client.user.id);
            const gameDocSnap = await getDoc(gameDocRef);

            // 1. INITIALIZATION: If state does not exist 
            if (!gameDocSnap.exists()) {
                // Check if this is the initial Guess #1 content edit
                const isGuessOne = newMessage.content.includes('Guess #1') && newMessage.content.includes('6 guesses remaining');
                
                if (isGuessOne) {
                    await initializeGameStateAndSuggestWord(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
                    return;
                }
            }
            
            // 2. SUBSEQUENT GUESSES: If state exists and is active, process the result.
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') {
                await processGuessAcknowledgement(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
            }
        }
    }
};
