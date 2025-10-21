const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
// NOTE: We only keep helpers required for the necessary path and basic structure.
const { WORD_LENGTH } = require('../utils/wordleHelpers');
const statsTracker = require('../utils/statsTracker'); 

// Configuration specific to this listener
const TARGET_WORDLE_CHANNEL_ID = '1429872409233850478'; 
const TARGET_BOT_ID = '493316754689359874'; 

// --- Utility to get the correct game doc reference ---
function getGameDocRef(db, channelId, APP_ID_FOR_FIRESTORE, userId) {
    // We use the authenticated bot user's ID for the path
    const gameCollectionPath = `artifacts/${APP_ID_FOR_FIRESTORE}/users/${userId}/WordleGames`;
    return doc(collection(db, gameCollectionPath), channelId);
}

// --- CORE GAME PROCESSOR (Simplified for Acknowledgment) ---
async function processGuessAcknowledgement(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const isGameBot = message.author.id === TARGET_BOT_ID;
    // Regex to capture the current guess number
    const guessContentMatch = message.content.match(/Guess #(\d+)\s*·/); 
    
    if (!isGameBot || !guessContentMatch || message.embeds.length === 0) {
        console.log(`[Wordle Solver - Acknowledgement] IGNORING: Message is not a game bot guess result.`);
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
        console.warn(`[Wordle Solver - Acknowledgement] WARNING: No active game state found, skipping acknowledgment for Guess #${currentGuessNumber}.`);
        return;
    }

    // Check if we already processed this exact guess result. Prevents double-sending messages.
    if (currentGuessNumber <= gameState.currentGuessNumber) {
        console.log(`[Wordle Solver - Acknowledgement] IGNORING: Already processed Guess #${currentGuessNumber} (State: ${gameState.currentGuessNumber}).`);
        return;
    }
    
    // Check if this is the expected next sequential guess
    if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
        console.warn(`[Wordle Solver - Acknowledgement] WARNING: Out-of-order guess. Received #${currentGuessNumber} but expected #${gameState.currentGuessNumber + 1}. Ignoring.`);
        return;
    }
    
    console.log(`[Wordle Solver - Acknowledgement] SUCCESS: Processing sequential Guess #${currentGuessNumber}.`);

    // --- Acknowledge the Guess ---
    await message.channel.send({ content: `✅ Detected **Guess #${currentGuessNumber}**. Ready for the next input.` });
    console.log(`Wordle Solver: Acknowledged Guess #${currentGuessNumber}.`);


    // --- Update Minimal Game State ---
    await updateDoc(gameDocRef, {
        currentGuessNumber: currentGuessNumber,
        lastGuessMessageId: message.id,
    });
    console.log(`[Wordle Solver - Acknowledgement] DEBUG: State updated to currentGuessNumber: ${currentGuessNumber}.`);
}

// Helper function that handles the initial game state creation
async function initializeGameStateAndSuggestWord(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
    const channelId = message.channel.id;
    const userId = client.user.id; 
    const gameDocRef = getGameDocRef(db, channelId, APP_ID_FOR_FIRESTORE, userId);

    console.log(`[Wordle Solver - Initialization] ATTEMPTING INITIALIZATION (Guess #1 Edit).`);

    let playerUserId = null;
    try {
         // Find the user who sent the initiating 't-wordle' command
         const userStartMessage = await message.channel.messages.fetch({ limit: 5 }).then(msgs => 
             msgs.find(m => !m.author.bot && m.content.toLowerCase().startsWith('t-wordle'))
         );
         playerUserId = userStartMessage ? userStartMessage.author.id : null;
         console.log(`[Wordle Solver - Initialization] Player ID identified: ${playerUserId}`);
    } catch(e) {
        console.error("[Wordle Solver - Initialization] ERROR fetching player ID.", e.message);
    }

    const initialGameState = {
        channelId: channelId,
        userId: message.author.id, // Bot's message author (Lootcord)
        playerUserId: playerUserId, 
        status: 'active',
        wordLength: WORD_LENGTH, // This assumes a constant Wordle length, must be defined in helpers
        guessesMade: [],
        currentGuessNumber: 0, // Set to 0 initially
        gameStartedAt: new Date().toISOString(),
        gameBotMessageId: message.id
    };

    try {
        // Use setDoc to create the initial state, which prevents the Firebase crash.
        await setDoc(gameDocRef, initialGameState);
        console.log(`[Wordle Solver - Initialization] SUCCESS: Fresh game state saved to Firestore.`);

        // --- Skip LLM Suggestion for now, but proceed to acknowledge ---
        // We simulate the immediate acknowledgment of the first guess result (Guess #1)
        await processGuessAcknowledgement(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
        
        return initialGameState;
    } catch(error) {
        console.error(`[Wordle Solver - Initialization] CRITICAL ERROR saving state:`, error.message);
        // Do not send message here to avoid spamming on recurring errors.
        return null;
    }
}


module.exports = {
    // Primary messageCreate for t-wordle and end detection (remains simplified)
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
            
            console.log(`[Wordle Solver - Execute] User initiated t-wordle. Checking active state...`);
            
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') {
                console.log(`[Wordle Solver - Execute] Game already active, ignoring t-wordle command.`);
                return;
            }
            // Allow the flow to continue to the messageUpdate handler which will pick up the bot's response.
            return;
        }

        // --- Game End Detection (Final message for lost/missed games) ---
        if (isGameBot && (message.content.includes("You've exhausted all of your guesses. The word was **") || message.content.includes("You won"))) {
             const gameDocRef = getGameDocRef(db, message.channel.id, APP_ID_FOR_FIRESTORE, client.user.id);
             await updateDoc(gameDocRef, { status: 'finished' });
             console.log(`Wordle Solver: Game state marked as finished.`);
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

            console.log(`[Wordle Solver - MessageUpdate] Game Bot Edit Detected.`);

            // 1. INITIALIZATION: If state does not exist 
            if (!gameDocSnap.exists()) {
                // Check if this is the initial Guess #1 content edit
                const isGuessOne = newMessage.content.includes('Guess #1') && newMessage.content.includes('6 guesses remaining');
                
                if (isGuessOne) {
                    // This is the first edit of the game message (Guess #1) - initialize state and run first suggestion
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
