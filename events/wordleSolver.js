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
        console.log(`[Wordle Solver - Process] No active state found for Guess #${currentGuessNumber}. Exiting.`);
        return; 
    }

    // Check if we already processed this exact guess result. Prevents double-sending messages.
    if (currentGuessNumber <= gameState.currentGuessNumber) {
        console.log(`[Wordle Solver - Process] IGNORING: Already processed Guess #${currentGuessNumber} (State: ${gameState.currentGuessNumber}).`);
        return;
    }
    
    // Check if this is the expected next sequential guess
    if (currentGuessNumber !== gameState.currentGuessNumber + 1) {
        console.log(`[Wordle Solver - Process] IGNORING: Out-of-order Guess #${currentGuessNumber}. Expected #${gameState.currentGuessNumber + 1}.`);
        return;
    }
    
    console.log(`[Wordle Solver - Process] SUCCESS: Processing sequential Guess #${currentGuessNumber}.`);

    // --- Acknowledge the Guess ---
    await message.channel.send({ content: `✅ Detected **Guess #${currentGuessNumber}**. Ready for the next input.` });


    // --- Update Minimal Game State ---
    await updateDoc(gameDocRef, {
        currentGuessNumber: currentGuessNumber,
        lastGuessMessageId: message.id,
    });
    console.log(`[Wordle Solver - Process] DEBUG: State updated to currentGuessNumber: ${currentGuessNumber}.`);
    
    // --- Simplified Game End Check ---
    if (message.content.includes('1 guesses remaining') || message.content.includes('0 guesses remaining')) {
        console.log(`[Wordle Solver - Process] DEBUG: Final guess detected, marking state for cleanup.`);
        await updateDoc(gameDocRef, { status: 'finished' });
    }
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
        wordLength: 5, // Hardcoded for standard Wordle
        guessesMade: [], // Array will be populated later
        currentGuessNumber: 0, // Set to 0 initially
        gameStartedAt: new Date().toISOString(),
        gameBotMessageId: message.id
    };

    try {
        await setDoc(gameDocRef, initialGameState);
        console.log(`[Wordle Solver - Initialization] SUCCESS: Fresh game state saved to Firestore.`);

        // After setting the initial state (currentGuessNumber: 0), immediately process the Guess #1 result
        // to mark it as Guess #1 and send the first acknowledgment message.
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
                console.log(`[Wordle Solver - MessageUpdate] DEBUG: State NOT found. Checking if this is Guess #1.`);
                
                // Check if this is the initial Guess #1 content edit
                // FIX: Use a robust regex to verify the start message without being brittle on spaces/formatting.
                const isGuessOne = /^Guess #1.*?6 guesses remaining$/s.test(newMessage.content) && newMessage.embeds?.[0]?.description;
                
                if (isGuessOne) {
                    console.log(`[Wordle Solver - MessageUpdate] START TRIGGERED: Initializing Guess #1 state.`);
                    await initializeGameStateAndSuggestWord(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
                    return;
                }
            }
            
            // 2. SUBSEQUENT GUESSES: If state exists and is active, process the result.
            if (gameDocSnap.exists() && gameDocSnap.data().status === 'active') {
                console.log(`[Wordle Solver - MessageUpdate] DEBUG: Active state found. Processing guess result.`);
                await processGuessAcknowledgement(newMessage, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
            }
        }
    }
};
