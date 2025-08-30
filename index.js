const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonBuilder, ButtonStyle, MessageFlags, Client, GatewayIntentBits, Collection, AttachmentBuilder } = require('discord.js');
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
const interactionHandler = require('./events/interactionHandler');

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
        } else {
            console.log("Stats Tracker: No botStats document found in Firestore. Initializing with defaults.");
            statsTracker.initializeStats({});
        }
    }, (error) => {
        console.error("Stats Tracker: Error listening to botStats:", error);
    });
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
            await interaction.editReply({ content, components, flags: 0 });
        } else if (interaction.customId.startsWith('toggle_attack_notifications') ||
                   interaction.customId.startsWith('toggle_farm_notifications') ||
                   interaction.customId.startsWith('toggle_med_notifications') ||
                   interaction.customId.startsWith('toggle_vote_notifications') ||
                   interaction.customId.startsWith('toggle_repair_notifications') ||
                   interaction.customId.startsWith('toggle_gambling_notifications')) {
            console.log(`[Notify Button - Debug] Button click received by ${interaction.user.tag} for customId: ${interaction.customId}`);
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const prefsRefs = {
                attackCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'attackCooldown'),
                farmCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'farmCooldown'),
                medCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'medCooldown'),
                voteCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'voteCooldown'),
                repairCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'repairCooldown'),
                gamblingCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'gamblingCooldown'),
            };
            try {
                let targetCooldownType;
                if (interaction.customId === 'toggle_gambling_notifications') {
                    targetCooldownType = 'gamblingCooldown';
                } else {
                    targetCooldownType = interaction.customId.replace('toggle_', '').replace('_notifications', '');
                }
                const currentPrefSnap = await getDoc(prefsRefs[targetCooldownType]);
                let newStates = {};
                newStates[targetCooldownType] = !(currentPrefSnap.exists() ? currentPrefSnap.data().enabled : false);
                console.log(`[Notify Button] User ${userId} toggled ${targetCooldownType} notifications to: ${newStates[targetCooldownType]}`);
                await setDoc(prefsRefs[targetCooldownType], { enabled: newStates[targetCooldownType] }, { merge: true });
                const currentPrefs = {};
                for (const type in prefsRefs) {
                    const snap = await getDoc(prefsRefs[type]);
                    currentPrefs[type] = snap.exists() ? snap.data().enabled : false;
                }
                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('Lootcord Helper Notifications')
                    .setDescription(
                        `Here you can manage your personal notification settings for Lootcord Helper.\n\n` +
                        `**Attack Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.attackCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your weapon cooldowns are over.\n\n` +
                        `**Farm Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.farmCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your farming cooldowns are over.\n\n` +
                        `**Med Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.medCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your medical item cooldowns are over.\n\n` +
                        `**Vote Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.voteCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your **voting cooldown** is over.\n\n` +
                        `**Repair Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.repairCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You
