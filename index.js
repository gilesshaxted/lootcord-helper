// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection, InteractionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express'); // Required for Render web service type
const path = require('path');
const fs = require('fs');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
const { getFirestore, doc, setDoc, onSnapshot, collection, getDocs } = require('firebase/firestore');

// Import Stats Tracker Utility
const statsTracker = require('./utils/statsTracker');

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
    // measurementId: process.env.MEASUREMENT_ID // Uncomment if you use Measurement ID
};

// --- Pagination Specific Configuration (used by helper function) ---
const CHANNELS_PER_PAGE = 25;
const TARGET_CATEGORY_ID = '1192414248299675663';

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

    const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
    onSnapshot(statsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            statsTracker.updateInMemoryStats(docSnap.data());
            updateBotStatus();
        } else {
            console.log("Stats Tracker: No botStats document found in Firestore. Initializing with defaults.");
            statsTracker.initializeStats({});
            updateBotStatus();
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
        GatewayIntentBits.GuildPresences, // NEW: Required for setting bot status/presence
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
        // Pass message as the first argument, followed by other context variables
        client.once(event.name, (message, ...args) => event.execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE, ...args));
    } else {
        // Pass message as the first argument, followed by other context variables
        client.on(event.name, (message, ...args) => event.execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE, ...args));
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
        .setCustomId(`select-channels-to-set_page_${currentPage}`)
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

// --- Bot Status Update Function ---
function updateBotStatus() {
    const stats = statsTracker.getBotStats();
    const statusText = `Helped ${stats.uniqueActiveUsers} players ${stats.totalHelps} times`;
    if (client.user) {
        client.user.setActivity(statusText, { type: 'PLAYING' });
        console.log(`Bot status updated to: "${statusText}"`);
    } else {
        console.warn('Cannot set bot status: client.user is not available.');
    }
}

// --- Function to check and rename channels on startup (Downtime Recovery) ---
async function checkAndRenameChannelsOnStartup() {
    if (!db || !isFirestoreReady || !client.isReady()) {
        console.warn('Startup Channel Check: Firestore or Client not ready. Skipping startup check.');
        return;
    }

    console.log('Startup Channel Check: Initiating channel status check after bot restart...');

    // Get all guilds the bot is in
    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);

        try {
            const channelDocs = await getDocs(guildChannelsRef);
            if (channelDocs.empty) {
                console.log(`Startup Channel Check: No configured channels for guild ${guild.name}.`);
                continue;
            }

            for (const docSnap of channelDocs.docs) {
                const channelData = docSnap.data();
                const channelId = channelData.channelId;
                const originalChannelName = channelData.originalChannelName;

                const channel = guild.channels.cache.get(channelId);
                if (!channel || channel.type !== ChannelType.GuildText) {
                    console.warn(`Startup Channel Check: Configured channel ${channelId} not found or not a text channel in guild ${guild.name}. Skipping.`);
                    continue;
                }

                // Fetch the last message in the channel
                const messages = await channel.messages.fetch({ limit: 1 });
                const lastMessage = messages.first();

                if (!lastMessage || lastMessage.author.id !== '493316754689359874' || lastMessage.embeds.length === 0) {
                    // If no relevant last message, revert to original name if current name is not original
                    if (channel.name !== originalChannelName) {
                        try {
                            await channel.setName(originalChannelName, 'Automated revert on startup: no relevant last message found.');
                            console.log(`Startup Channel Check: Reverted ${channel.name} to ${originalChannelName} in ${guild.name}.`);
                        } catch (error) {
                            console.error(`Startup Channel Check: Failed to revert ${channel.name} to ${originalChannelName} on startup:`, error);
                        }
                    }
                    continue; // No relevant message to check for renaming
                }

                const embedTitle = lastMessage.embeds[0].title;
                const messageContent = lastMessage.content;
                let newName = null;

                // Apply renaming logic (similar to MobDetect.js)
                if (embedTitle) {
                    if (embedTitle.includes('Heavy Scientist')) {
                        newName = '🐻╏heavy';
                    } else if (embedTitle.includes('Scientist')) {
                        newName = '🥼╏scientist';
                    } else if (embedTitle.includes('Tunnel Dweller')) {
                        newName = '🧟╏dweller';
                    } else if (embedTitle.includes('Patrol Helicopter')) {
                        newName = '🚁╏heli';
                    } else if (embedTitle.includes('Bradley APC')) {
                        newName = '🚨╏brad';
                    }
                }

                // Apply revert logic (similar to MobDetect.js)
                const embed = lastMessage.embeds[0];
                const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
                const embedDescriptionRevert = embed && embed.description && embed.description.includes('killed a mob');
                const contentDiedRevert = messageContent.includes(':deth: The **') && messageContent.includes('DIED!**');
                const revertCondition = embedTitleRevert || embedDescriptionRevert || contentDiedRevert;

                if (revertCondition) {
                    if (channel.name !== originalChannelName) {
                        try {
                            await channel.setName(originalChannelName, 'Automated revert on startup: death/left message detected.');
                            console.log(`Startup Channel Check: Reverted ${channel.name} to ${originalChannelName} in ${guild.name}.`);
                        } catch (error) {
                            console.error(`Startup Channel Check: Failed to revert ${channel.name} to ${originalChannelName} on startup:`, error);
                        }
                    }
                } else if (newName && channel.name !== newName) { // Only rename if a newName is determined and current name is different
                    try {
                        await channel.setName(newName, 'Automated rename on startup: enemy spawn detected.');
                        console.log(`Startup Channel Check: Renamed ${channel.name} to ${newName} in ${guild.name}.`);
                    } catch (error) {
                        console.error(`Startup Channel Check: Failed to rename ${channel.name} to ${newName} on startup:`, error);
                    }
                } else {
                    console.log(`Startup Channel Check: Channel ${channel.name} in ${guild.name} is already correctly named.`);
                }
            }
        } catch (error) {
            console.error(`Startup Channel Check: Error processing guild ${guild.name} (${guild.id}):`, error);
        }
    }
    console.log('Startup Channel Check: Completed channel status check.');
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

    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);

        const GUILD_ID_FOR_TESTING = '1192414247196573747';
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID_FOR_TESTING),
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${data.length} guild (/) commands.`);

    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }

    updateBotStatus();
    setInterval(updateBotStatus, 300000); // Update status every 5 minutes

    // NEW: Run channel check and rename on startup
    await checkAndRenameChannelsOnStartup();
});

// The messageCreate event listener is now in events/MobDetect.js and events/unscrambleListener.js
// A new activePlayerTracker.js will be added for t- commands.

// The interactionCreate event listener remains here because it handles
// both slash commands and component interactions (buttons, select menus).
client.on('interactionCreate', async interaction => {
    if (!isFirestoreReady) {
        console.error('Firestore is not yet ready to process interactions. Skipping interaction.');
        if (interaction.isChatInputCommand() && !interaction.deferred && !interaction.replied) {
            await interaction.reply({ content: 'The bot is still starting up. Please try the command again in a moment.', ephemeral: false });
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${command.data.name} was found.`);
            return;
        }

        try {
            if (command.data.name === 'channel-set') {
                await interaction.deferReply({ ephemeral: false });
                const { content, components } = await createChannelPaginationMessage(interaction.guild, 0);
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

            const { content, components } = await createChannelPaginationMessage(interaction.guild, newPage);
            await interaction.editReply({ content, components, ephemeral: false });
        }
    }

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

client.login(TOKEN);

const app = express();

app.get('/', (req, res) => {
    res.send('Discord bot is running and listening for commands!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
