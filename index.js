const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    AttachmentBuilder,
    ChannelType
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// Import Firebase modules
const {
    initializeApp
} = require('firebase/app');
const {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} = require('firebase/auth');
const {
    getFirestore,
    doc,
    setDoc,
    onSnapshot,
    collection,
    getDocs,
    getDoc,
    query,
    where,
    deleteDoc
} = require('firebase/firestore');

// Import Utilities
const statsTracker = require('./utils/statsTracker');
const botStatus = require('./utils/botStatus');
const paginationHelpers = require('./utils/pagination');
const startupChecks = require('./utils/startupChecks');
const stickyMessageManager = require('./utils/stickyMessageManager');
const {
    sendCooldownPing
} = require('./events/cooldownNotifier');
const {
    updateVoiceChannelNameOnDemand
} = require('./utils/voiceChannelUpdater');
const { WEAPON_DATA } = require('./utils/damageData');
const notifyCommands = require('./commands/notify');


// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const BLEEDING_SELECT_ID = 'damage_calc_bleeding_select';


// Load environment variables from a custom .env file
require('dotenv').config({
    path: path.resolve(__dirname, 'lootcord-helper.env')
});


// --- Configuration Variables ---
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PORT = process.env.PORT || 3000;

// Firebase configuration loaded from environment variables for Render hosting
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
};

// --- Firestore App ID for data paths ---
const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

// --- Basic Validation for Environment Variables ---
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set. Please provide your bot token.');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('Error: DISCORD_CLIENT_ID environment variable not set. This is required for slash commands.');
    process.exit(1);
}
if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    console.error('Error: Incomplete Firebase configuration. Please ensure ALL required Firebase environment variables are set:');
    console.error('  - FIREBASE_API_KEY');
    console.error('  - FIREBASE_AUTH_DOMAIN');
    console.error('  - FIREBASE_PROJECT_ID');
    console.error('  - FIREBASE_APP_ID');
    process.exit(1);
}


// --- Firebase Initialization ---
let firebaseApp;
let db;
let auth;
let userId = 'unknown';
let isFirestoreReady = false;

async function initializeFirebase() {
    try {
        console.log('Firebase config being used:', firebaseConfig);

        firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
        auth = getAuth(firebaseApp);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log(`Firebase authenticated. User ID: ${userId}`);
            } else {
                userId = crypto.randomUUID();
                console.log(`Firebase not authenticated. Using anonymous/random User ID: ${userId}`);
            }
            isFirestoreReady = true;
            console.log("Firestore client initialized and ready.");
            await setupFirestoreListeners();
        });

        await signInAnonymously(auth);
        console.log('Attempted anonymous sign-in to Firebase.');
    } catch (error) {
        console.error('Error initializing Firebase or signing in:', error);
        process.exit(1);
    }
}

// Function to set up Firestore listeners
async function setupFirestoreListeners() {
    if (!db || !userId || !isFirestoreReady) {
        console.warn('Firestore, User ID, or Auth not ready for listeners. Skipping setup.');
        return;
    }

    const botStatusDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`), 'mainStatus');
    onSnapshot(botStatusDocRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Current bot status from Firestore:", docSnap.data());
        } else {
            console.log("No bot status document found in Firestore.");
        }
    }, (error) => {
        console.error("Error listening to bot status:", error);
    });

    const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
    onSnapshot(statsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            statsTracker.updateInMemoryStats(docSnap.data());
        } else {
            console.log("Stats Tracker: No botStats document found in Firestore. Initializing with defaults.");
        }
    }, (error) => {
        console.error("Error listening to botStats:", error);
    });
}


// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
});

// --- Command Handling Setup ---
client.commands = new Collection();
const slashCommandsToRegister = [];

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`[Command Loader] Found ${commandFiles.length} potential command files: ${commandFiles.join(', ')}`);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            slashCommandsToRegister.push(command.data.toJSON());
            console.log(`[Command Loader] Successfully loaded command: ${command.data.name}`);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property. Skipping.`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to load command file ${filePath}:`, error);
    }
}


// --- Event Handling Setup ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE));
    } else {
        client.on(event.name, (...args) => event.execute(...args, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE));
    }
}


// --- Discord Event Handlers (main ones remaining in index.js) ---

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');

    if (client.guilds.cache.size > 0) {
        const firstGuild = client.guilds.cache.first();
        console.log(`Bot is in guild: ${firstGuild.name} (ID: ${firstGuild.id})`);
    } else {
        console.log('Bot is not in any guilds yet.');
    }

    await initializeFirebase();
    if (db && APP_ID_FOR_FIRESTORE && userId !== 'unknown') {
        const botStatusDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`), 'mainStatus');
        try {
            await setDoc(botStatusDocRef, {
                status: 'Online',
                lastUpdated: new Date().toISOString(),
                botName: client.user.tag,
                connectedUserId: userId,
            }, {
                merge: true
            });
            console.log('Bot status updated in Firestore from clientReady event.');
        } catch (e) {
            console.error('Error writing bot status to Firestore from clientReady:', e);
        }
    }


    const rest = new REST({
        version: '10'
    }).setToken(TOKEN);

    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID), {
                body: slashCommandsToRegister
            },
        );
        console.log(`Successfully reloaded ${data.length} global (/) commands.`);
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }

    setInterval(async () => {
        if (!db || !APP_ID_FOR_FIRESTORE || !client.isReady()) {
            console.warn('Interval Status Update: DB, App ID, or Client not ready. Skipping interval update.');
            return;
        }
        const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
        try {
            const docSnap = await getDoc(statsDocRef);
            const data = docSnap.exists() ? docSnap.data() : {};
            const totalHelps = data.totalHelps ?? 0;
            const uniqueActiveUsers = Object.keys(data.activeUsersMap ?? {}).length;

            botStatus.updateBotPresence(client, {
                customText: null,
                activityType: 'PLAYING',
                db: db,
                appId: APP_ID_FOR_FIRESTORE,
                totalHelps: totalHelps,
                uniqueActiveUsers: uniqueActiveUsers
            });
        } catch (error) {
            console.error('Interval Status Update: Error fetching stats for presence update:', error);
        }
    }, 300000);

    await startupChecks.checkAndRenameChannelsOnStartup(db, isFirestoreReady, client);
    await updateVoiceChannelNameOnDemand(client);

    const activeCooldownsRef = collection(db, `ActiveCooldowns`);
    try {
        const querySnapshot = await getDocs(activeCooldownsRef);
        const now = Date.now();
        let rescheduledCount = 0;
        for (const docSnap of querySnapshot.docs) {
            const cooldownData = docSnap.data();
            const cooldownDocId = docSnap.id;
            const delay = cooldownData.cooldownEndsAt - now;

            if (delay > 0) {
                setTimeout(() => {
                    sendCooldownPing(client, db, cooldownData.userId, cooldownData.channelId, cooldownData.type, cooldownData.item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                }, delay);
                rescheduledCount++;
            } else {
                if (!cooldownData.pinged) {
                    sendCooldownPing(client, db, cooldownData.userId, cooldownData.channelId, cooldownData.type, cooldownData.item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                } else {
                    await deleteDoc(doc(activeCooldownsRef, cooldownDocId));
                    console.log(`Cooldown Notifier: Removed stale cooldown entry ${cooldownDocId} on startup.`);
                }
            }
        } // <--- MISSING CLOSING BRACE WAS ADDED HERE
        console.log(`Cooldown Notifier: Rescheduled ${rescheduledCount} active cooldowns on startup.`);
    } catch (error) {
        console.error('Cooldown Notifier: Error rescheduling cooldowns on startup:', error);
    }

    setInterval(() => stickyMessageManager.cleanupExpiredStickyMessages(db, client), 10 * 60 * 1000);
});


// Log in to Discord with your bot's token.
client.login(TOKEN);

// --- Web Server for Platforms (e.g., Render) ---
const app = express();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
