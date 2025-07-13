// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection, InteractionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
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

// --- Pagination Specific Configuration ---
const CHANNELS_PER_PAGE = 25; // Max options for StringSelectMenuBuilder
const TARGET_CATEGORY_ID = '1192414248299675663'; // Your specified category ID

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
// Enhanced validation for Firebase environment variables
if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    console.error('Error: Incomplete Firebase configuration. Please ensure ALL required Firebase environment variables are set on Render:');
    console.error('  - FIREBASE_API_KEY');
    console.error('  - FIREBASE_AUTH_DOMAIN');
    console.error('  - FIREBASE_PROJECT_ID');
    console.error('  - FIREBASE_APP_ID');
    console.error('You can find these in your Firebase Console > Project settings > Your apps (Web app config).');
    process.exit(1);
}


// --- Firebase Initialization ---
let firebaseApp;
let db;
let auth;
let userId = 'unknown'; // Default until authenticated
let isFirestoreReady = false; // Flag to indicate Firebase Firestore instance is ready

// Function to initialize Firebase and authenticate
async function initializeFirebase() {
    try {
        console.log('Firebase config being used:', firebaseConfig); // Diagnostic log

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
    }
}

// Function to set up Firestore listeners
async function setupFirestoreListeners() {
    if (!db || !userId || !isFirestoreReady) {
        console.warn('Firestore, User ID, or Auth not ready for listeners. Skipping setup.');
        return;
    }

    const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';
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

    try {
        await setDoc(botStatusDocRef, {
            status: 'Online',
            lastUpdated: new Date().toISOString(),
            botName: client.user ? client.user.tag : 'Discord Bot',
            connectedUserId: userId
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

// --- Helper Function for Channel Pagination UI ---
async function createChannelPaginationMessage(guild, currentPage) {
    const allChannelsInTargetCategory = guild.channels.cache.filter(channel =>
        channel.parentId === TARGET_CATEGORY_ID &&
        channel.type === ChannelType.GuildText
    ).sort((a, b) => a.position - b.position);

    const totalChannels = allChannelsInTargetCategory.size;
    const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);

    if (totalChannels === 0) {
        return {
            content: `No text channels found in the specified category (<#${TARGET_CATEGORY_ID}>) that the bot can see.`,
            components: []
        };
    }

    // Ensure currentPage is within bounds
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;

    const channelsForPage = allChannelsInTargetCategory.toJSON().slice(
        currentPage * CHANNELS_PER_PAGE,
        (currentPage + 1) * CHANNELS_PER_PAGE
    );

    const selectOptions = channelsForPage.map(channel => ({
        label: channel.name,
        value: channel.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select-channels-to-set_page_${currentPage}`) // Embed page in custom ID
        .setPlaceholder(`Select channels (Page ${currentPage + 1}/${totalPages})...`)
        .setMinValues(1)
        .setMaxValues(selectOptions.length > 0 ? selectOptions.length : 1)
        .addOptions(selectOptions);

    const prevButton = new ButtonBuilder()
        .setCustomId(`page_prev_${currentPage}`)
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`page_next_${currentPage}`)
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

    let contentMessage = `Please select channels from the category (<#${TARGET_CATEGORY_ID}>). Page ${currentPage + 1} of ${totalPages}:`;
    if (totalChannels > CHANNELS_PER_PAGE) {
        contentMessage += `\n(Showing ${channelsForPage.length} of ${totalChannels} channels)`;
    }

    return {
        content: contentMessage,
        components: [selectRow, buttonRow]
    };
}


// --- Discord Event Handlers ---

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');

    if (client.guilds.cache.size > 0) {
        const firstGuild = client.guilds.cache.first();
        console.log(`Bot is in guild: ${firstGuild.name} (ID: ${firstGuild.id})`);
    } else {
        console.log('Bot is not in any guilds yet.');
    }

    await initializeFirebase();

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);

        const GUILD_ID_FOR_TESTING = '1192414247196573747';
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID_FOR_TESTING),
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${data.length} guild (/) commands.`);

    } catch (error) {
        console.error('Fai
