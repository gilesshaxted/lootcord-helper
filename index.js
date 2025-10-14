const { Client, GatewayIntentBits, Collection, InteractionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFirestore, doc, setDoc, onSnapshot, collection, getDocs, getDoc, query, where, deleteDoc } = require('firebase/firestore');

// Import Utilities
const statsTracker = require('./utils/statsTracker');
const botStatus = require('./utils/botStatus');
const paginationHelpers = require('./utils/pagination');
const startupChecks = require('./utils/startupChecks');
const wordleHelpers = require('./utils/wordleHelpers');
const stickyMessageManager = require('./utils/stickyMessageManager');
const { sendCooldownPing } = require('./events/cooldownNotifier');
const interactionHandler = require('./events/interactionHandler'); // Import the interaction handler

// Load environment variables from a custom .env file
require('dotenv').config({ path: path.resolve(__dirname, 'lootcord-helper.env') });

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = '!';
const PORT = process.env.PORT || 3000;

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
};

const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

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
    console.error('  - FIREBASE_API_KEY');
    console.error('  - FIREBASE_AUTH_DOMAIN');
    console.error('  - FIREBASE_PROJECT_ID');
    console.error('  - FIREBASE_APP_ID');
    process.exit(1);
}

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

    // --- Safety Wrapper for Listeners to handle startup permission race condition ---
    const listenerErrorHandler = (error) => {
        if (error.code === 'permission-denied') {
            // Suppress the expected, temporary permission denied error during initial asynchronous startup
            console.warn(`[Listener Suppressed Error] Initial permission denied error: ${error.message}. This should resolve once auth completes.`);
        } else {
            console.error("Error listening to Firestore:", error);
        }
    };
    // --- End Safety Wrapper ---


    const botStatusDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`), 'mainStatus');
    onSnapshot(botStatusDocRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Current bot status from Firestore:", docSnap.data());
        } else {
            console.log("No bot status document found in Firestore.");
        }
        // Write attempt inside listener is prone to the same permission error, so use try/catch
        try {
            setDoc(botStatusDocRef, {
                status: 'Online',
                lastUpdated: new Date().toISOString(),
                botName: client.user ? client.user.tag : 'Discord Bot',
                connectedUserId: userId
            }, { merge: true });
        } catch (e) {
            if (e.code !== 'permission-denied') {
                 console.error("Error writing bot status within onSnapshot:", e);
            }
        }
    }, listenerErrorHandler); // Use the safety wrapper

    // Listener for bot statistics
    const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
    onSnapshot(statsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            statsTracker.updateInMemoryStats(docSnap.data());
        } else {
            console.log("Stats Tracker: No botStats document found in Firestore. Initializing with defaults.");
            statsTracker.initializeStats({});
        }
    }, listenerErrorHandler); // Use the safety wrapper

    // Note: SoloStickyMessages listener is handled by MobDetect.js/SoloStickyMessage.js if required
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ]
});

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

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (message, ...args) => event.execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE, ...args));
    } else {
        client.on(event.name, (message, ...args) => event.execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE, ...args));
    }
}

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
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
    console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: slashCommandsToRegister },
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
        }
        console.log(`Cooldown Notifier: Rescheduled ${rescheduledCount} active cooldowns on startup.`);
    } catch (error) {
        console.error('Cooldown Notifier: Error rescheduling cooldowns on startup:', error);
    }
    setInterval(() => stickyMessageManager.cleanupExpiredStickyMessages(db, client), 10 * 60 * 1000);
});

const WORDLE_LOG_CHANNEL_ID = '1394316724819591318';
const WORDLE_LOG_REQUESTER_ID = '444211741774184458';
client.on('messageCreate', async message => {
    if (message.author.id === WORDLE_LOG_REQUESTER_ID && message.content === '!wordlelog') {
        if (message.channel.id !== WORDLE_LOG_CHANNEL_ID) {
            await message.reply('This command can only be used in the designated Wordle channel.');
            return;
        }
        try {
            const messages = await message.channel.messages.fetch({ limit: 50 });
            let logContent = `--- Wordle Channel Log (${message.channel.name}) ---\n\n`;
            messages.reverse().forEach(msg => {
                logContent += `[${msg.createdAt.toISOString()}] ${msg.author.tag} (${msg.author.id}):\n`;
                if (msg.content) {
                    logContent += `  Content: "${msg.content}"\n`;
                }
                if (msg.embeds.length > 0) {
                    logContent += `  Embeds (${msg.embeds.length}):\n`;
                    msg.embeds.forEach((embed, index) => {
                        logContent += `    Embed ${index + 1}:\n`;
                        if (embed.title) logContent += `      Title: "${embed.title}"\n`;
                        if (embed.description) logContent += `      Description:\n\`\`\`\n${embed.description}\n\`\`\`\n`;
                        if (embed.fields.length > 0) {
                            logContent += `      Fields:\n`;
                            embed.fields.forEach(field => logContent += `        - ${field.name}: ${field.value}\n`);
                        }
                    });
                }
                logContent += `\n`;
            });
            const logBuffer = Buffer.from(logContent, 'utf8');
            const attachment = new AttachmentBuilder(logBuffer, { name: 'wordle_log.txt' });
            await message.channel.send({
                content: 'Here is the recent Wordle channel log:',
                files: [attachment]
            });
            console.log(`Generated and sent Wordle log to #${message.channel.name}`);
        } catch (error) {
            console.error('Error generating wordle log:', error);
            await message.channel.send('Failed to generate Wordle log. Check bot permissions or logs.');
        }
    }
});
client.on('interactionCreate', async interaction => {
    if (!isFirestoreReady) {
        console.error('Firestore is not yet ready to process interactions. Skipping interaction.');
        if (interaction.isChatInputCommand() && !interaction.deferred && !interaction.replied) {
            await interaction.reply({ content: 'The bot is still starting up. Please try the command again in a moment.', flags: 0 });
        }
        return;
    }
    // --- START CRITICAL FIX FOR COMMAND TIMEOUTS ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // CRITICAL STEP 1: Acknowledge interaction immediately before heavy logic runs
        try {
             await interaction.deferReply({ flags: 0 }); // Defer publicly
        } catch (error) {
             console.error(`Error deferring reply for command ${interaction.commandName}:`, error);
             // If deferring fails (likely due to timeout > 3s), stop processing to prevent 40060 error later
             return; 
        }

        // CRITICAL STEP 2: Execute command logic using editReply/followUp
        try {
            await command.execute(interaction, db, client, APP_ID_FOR_FIRESTORE);
            
            // Check for stats increment
            if (command.data.name !== 'channel-set') {
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
            }
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            // Use editReply since we already deferred
            await interaction.editReply({ content: '❌ There was an unexpected error while executing this command. Please check logs.', flags: 0 });
        }
        return; // Handled slash command
    }
    // --- END CRITICAL FIX FOR COMMAND TIMEOUTS ---

    // New interaction handler logic (for buttons/select menus)
    interactionHandler.execute(interaction, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE);
}); 

// Log in to Discord with your bot's token.
client.login(TOKEN);

// --- Web Server for Platforms (e.g., Render) ---
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
