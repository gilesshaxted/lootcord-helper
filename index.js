// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth'); // Removed signInWithCustomToken
const { getFirestore, doc, setDoc, onSnapshot, collection } = require('firebase/firestore');

// Load environment variables from a .env file (for local testing)
require('dotenv').config();

// --- Configuration Variables ---
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = '!';
const PORT = process.env.PORT || 3000;

// Firebase configuration loaded from environment variables for Render hosting
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    // measurementId: process.env.FIREBASE_MEASUREMENT_ID // Uncomment if you use Measurement ID
};

// --- Basic Validation for Environment Variables ---
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set. Please provide your bot token.');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('Error: DISCORD_CLIENT_ID environment variable not set. This is required for slash commands.');
    console.error('You can find your Client ID (Application ID) in the Discord Developer Portal under "General Information".');
    process.exit(1);
}
// Basic validation for Firebase environment variables
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('Error: Firebase environment variables (e.g., FIREBASE_API_KEY, FIREBASE_PROJECT_ID) not fully set.');
    process.exit(1);
}


// --- Firebase Initialization ---
let firebaseApp;
let db;
let auth;
let userId = 'unknown'; // Default until authenticated
let isAuthReady = false; // Flag to indicate Firebase auth is ready

// Function to initialize Firebase and authenticate
async function initializeFirebase() {
    try {
        firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
        auth = getAuth(firebaseApp);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log(`Firebase authenticated. User ID: ${userId}`);
            } else {
                userId = crypto.randomUUID(); // Fallback for anonymous/unauthenticated
                console.log(`Firebase not authenticated. Using anonymous/random User ID: ${userId}`);
            }
            isAuthReady = true; // Auth state has been checked
            await setupFirestoreListeners(); // Now that we have a userId and auth is ready, set up listeners
        });

        // Attempt to sign in anonymously (since __initial_auth_token is not available on Render)
        await signInAnonymously(auth);
        console.log('Signed in anonymously to Firebase.');

    } catch (error) {
        console.error('Error initializing Firebase or signing in:', error);
    }
}

// Function to set up Firestore listeners
async function setupFirestoreListeners() {
    // Ensure Firebase is initialized and auth state is ready before proceeding
    if (!db || !userId || !isAuthReady) {
        console.warn('Firestore, User ID, or Auth not ready for listeners. Retrying...');
        // You might want a more robust retry mechanism or wait for isAuthReady to be true
        return;
    }

    // Define the app ID for Firestore paths (can be a fixed string or derived from your Render service ID)
    // For Render, you might use a fixed string like 'my-discord-bot-app'
    const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app'; // Use Render's service ID if available

    // Example: Listen to a public bot status document
    // Data will be stored in /artifacts/{APP_ID_FOR_FIRESTORE}/public/data/botStatus/mainStatus
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

    // Example: Update bot status in Firestore on ready
    try {
        await setDoc(botStatusDocRef, {
            status: 'Online',
            lastUpdated: new Date().toISOString(),
            botName: client.user ? client.user.tag : 'Discord Bot',
            connectedUserId: userId // Displaying the userId as required for multi-user apps
        }, { merge: true });
        console.log("Bot status updated in Firestore.");
    } catch (e) {
        console.error("Error writing bot status to Firestore:", e);
    }
}


// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// --- Command Handling Setup ---
client.commands = new Collection();
const slashCommandsToRegister = [];

// path and fs are needed for dynamic command loading
const path = require('path');
const fs = require('fs');

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        slashCommandsToRegister.push(command.data.toJSON());
    } else {
        console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// --- Discord Event Handlers ---

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');

    // Initialize Firebase and authenticate when the bot is ready
    await initializeFirebase();

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);

        const GUILD_ID_FOR_TESTING = '1192414247196573747'; // Your specific guild ID for testing
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID_FOR_TESTING),
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${data.length} guild (/) commands.`);

    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (commandName === 'ping') {
        const latency_ms = Math.round(client.ws.ping);
        await message.reply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.` });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// Log in to Discord with your bot's token.
client.login(TOKEN);

// --- Web Server for Hosting Platforms (e.g., Render) ---
const app = express();

app.get('/', (req, res) => {
    res.send('Discord bot is running and listening for commands!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
