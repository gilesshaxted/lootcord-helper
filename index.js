// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection, InteractionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path'); // Import path module
const fs = require('fs');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFirestore, doc, setDoc, onSnapshot, collection, getDocs, getDoc } = require('firebase/firestore');

// Import Utilities
const statsTracker = require('./utils/statsTracker');
const botStatus = require('./utils/botStatus');
const paginationHelpers = require('./utils/pagination');
const startupChecks = require('./utils/startupChecks');
const wordleHelpers = require('./utils/wordleHelpers');

// Load environment variables from a custom .env file
// Assumes lootcord-helper.env is in the same directory as index.js
require('dotenv').config({ path: path.resolve(__dirname, 'lootcord-helper.env') });


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
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    // measurementId: process.env.MEASUREMENT_ID // Uncomment if you use Measurement ID
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
    console.error('You can find your Client ID (Application ID) in the Discord Developer Portal under "General Information".');
    process.exit(1);
}
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

    // Listener for bot statistics - this will update in-memory stats
    const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
    onSnapshot(statsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            statsTracker.updateInMemoryStats(docSnap.data());
            // Removed: botStatus.updateBotPresence(client, statsTracker.getBotStats()); // This call is now removed
        } else {
            console.log("Stats Tracker: No botStats document found in Firestore. Initializing with defaults.");
            statsTracker.initializeStats({});
            // Removed: botStatus.updateBotPresence(client, statsTracker.getBotStats()); // This call is now removed
        }
    }, (error) => {
        console.error("Stats Tracker: Error listening to botStats:", error);
    });
}


// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences, // REQUIRED for setting bot status/presence
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

// --- Event Handling Setup ---
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


// --- Discord Event Handlers (main ones remaining in index.js) ---

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
    await setupFirestoreListeners();

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    // --- Slash Command Registration ---
    // This block registers commands globally.
    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID), // This line registers commands GLOBALLY
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${data.length} global (/) commands.`);
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }

    // Set interval for regular status updates (every 5 minutes)
    setInterval(async () => { // Made async to allow await for Firestore fetch
        // Ensure db and APP_ID_FOR_FIRESTORE are available before attempting to fetch stats
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
            
            // Call updateBotPresence with necessary arguments
            botStatus.updateBotPresence(client, {
                customText: null, // Not a custom text update
                activityType: 'PLAYING', // Default type for interval
                db: db, // Pass db
                appId: APP_ID_FOR_FIRESTORE, // Pass appId
                totalHelps: totalHelps, // Pass fetched stats
                uniqueActiveUsers: uniqueActiveUsers // Pass fetched stats
            });
        } catch (error) {
            console.error('Interval Status Update: Error fetching stats for presence update:', error);
        }
    }, 300000); // Every 5 minutes

    // Initial status update (will be handled by the first interval or manual command)
    // Removed direct call here as setInterval will handle the first update soon after ready.
    // botStatus.updateBotPresence(client, statsTracker.getBotStats()); 

    await startupChecks.checkAndRenameChannelsOnStartup(db, isFirestoreReady, client);
});

// --- Handle !wordlelog command ---
const WORDLE_LOG_CHANNEL_ID = '1394316724819591318'; // The channel where Wordle games are played
const WORDLE_LOG_REQUESTER_ID = '444211741774184458'; // User ID of the authorized requester

client.on('messageCreate', async message => {
    // Check for !wordlelog command
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
            await interaction.reply({ content: 'The bot is still starting up. Please try the command again in a moment.', ephemeral: false });
        }
        return;
    }

    // Handle Button Interactions (for pagination and trivia explanation)
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('page_prev_') || interaction.customId.startsWith('page_next_')) {
            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[1];
            const currentPage = parseInt(parts[2], 10);

            let newPage = currentPage;
            if (action === 'prev') {
                newPage--;
            } else if (action === 'next') {
                newPage++;
            }

            const { content, components } = await paginationHelpers.createChannelPaginationMessage(interaction.guild, newPage);
            await interaction.editReply({ content, components, ephemeral: false });
        } else if (interaction.customId.startsWith('show_trivia_explanation_')) { // Handle trivia explanation button
            await interaction.deferUpdate(); // Acknowledge button click

            const parts = interaction.customId.split('_');
            const originalMessageId = parts[3]; // Extract original message ID

            const triviaExplanationRef = doc(collection(db, `TriviaExplanations`), originalMessageId);

            try {
                const docSnap = await getDoc(triviaExplanationRef);

                if (docSnap.exists()) {
                    const explanationData = docSnap.data();
                    const explanations = explanationData.explanations;
                    const optionLetters = ['A', 'B', 'C', 'D'];

                    let explanationContent = `**Explanation for Trivia Question:** \`${explanationData.question}\`\n\n`;
                    explanationContent += `\`\`\`\n`;
                    optionLetters.forEach(letter => {
                        if (explanations[letter]) {
                            explanationContent += `${letter}: ${explanations[letter]}\n`;
                        }
                    });
                    explanationContent += `\`\`\``;

                    // Fetch the original message to edit its components
                    const originalMessage = interaction.message;
                    if (originalMessage) {
                        const newComponents = originalMessage.components.map(row => {
                            return new ActionRowBuilder().addComponents(
                                row.components.map(button => {
                                    return ButtonBuilder.from(button).setDisabled(true); // Disable all buttons
                                })
                            );
                        });
                        await originalMessage.edit({ components: newComponents });
                    }

                    await interaction.followUp({ content: explanationContent, ephemeral: false }); // Send publicly
                    console.log(`Trivia Solver: Posted explanation for message ID ${originalMessageId} in #${interaction.channel.name}.`);
                } else {
                    await interaction.followUp({ content: 'Could not find explanation for this trivia question.', ephemeral: false });
                    console.warn(`Trivia Solver: Explanation not found for message ID ${originalMessageId}.`);
                }
            } catch (error) {
                console.error(`Trivia Solver: Error fetching explanation for message ID ${originalMessageId}:`, error);
                await interaction.followUp({ content: 'An error occurred while fetching the explanation. Please check logs.', ephemeral: false });
            }
        }
    }

    // Handle Chat Input Commands (Slash Commands)
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${command.data.name} was found.`);
            return;
        }

        try {
            if (command.data.name === 'channel-set') {
                await interaction.deferReply({ ephemeral: false });
                const { content, components } = await paginationHelpers.createChannelPaginationMessage(interaction.guild, 0);
                await interaction.editReply({ content, components, ephemeral: false });
            } else {
                await command.execute(interaction, db, client, APP_ID_FOR_FIRESTORE);
            }
            if (command.data.name !== 'channel-set') {
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
            }
        } catch (error) {
            console.error(`Error executing command ${command.data.name}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: false });
            } else if (interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: false });
            }
        }
    }

    // Handle String Select Menu Interactions (for channel selection)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select-channels-to-set_page_')) {
            await interaction.deferUpdate();

            const selectedChannelIds = interaction.values;
            const guild = interaction.guild;
            const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

            if (!guild) {
                return await interaction.followUp({ content: 'This action can only be performed in a guild.', ephemeral: false });
            }

            const guildCollectionRef = collection(db, `Guilds`);
            const guildDocRef = doc(guildCollectionRef, guild.id);

            let successCount = 0;
            let failureCount = 0;
            let successMessages = [];

            for (const channelId of selectedChannelIds) {
                const channel = guild.channels.cache.get(channelId);
                if (!channel) {
                    console.warn(`Selected channel ID ${channelId} not found in guild cache.`);
                    failureCount++;
                    continue;
                }

                const channelsSubCollectionRef = collection(guildDocRef, 'channels');
                const channelDocRef = doc(channelsSubCollectionRef, channel.id);

                try {
                    await setDoc(guildDocRef, {
                        guildId: guild.id,
                        guildName: guild.name,
                        guildOwnerId: guild.ownerId,
                        lastUpdated: new Date().toISOString()
                    }, { merge: true });

                    await setDoc(channelDocRef, {
                        channelId: channel.id,
                        channelName: channel.name,
                        originalChannelName: channel.name,
                        setType: 'manual',
                        setByUserId: interaction.user.id,
                        setByUsername: interaction.user.tag,
                        timestamp: new Date().toISOString()
                    });
                    successCount++;
                    successMessages.push(`<#${channel.id}>`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                } catch (error) {
                    console.error(`Error saving channel ${channel.name} (${channel.id}) to Firestore:`, error);
                    failureCount++;
                }
            }

            let replyContent = `Successfully set ${successCount} channel(s).`;
            if (successMessages.length > 0) {
                replyContent += `\nChannels: ${successMessages.join(', ')}`;
            }
            if (failureCount > 0) {
                replyContent += `\nFailed to set ${failureCount} channel(s). Check logs for details.`;
            }

            await interaction.editReply({ content: replyContent, components: [], ephemeral: false });
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
