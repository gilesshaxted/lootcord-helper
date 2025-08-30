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
    console.error('  - FIREBASE_API_KEY');
    console.error('  - FIREBASE_AUTH_DOMAIN');
    console.error('  - FIREBASE_PROJECT_ID');
    console.error('  - FIREBASE_APP_ID');
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
            statsTracker.initializeStats({});
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
            Routes.applicationCommands(CLIENT_ID),
            {
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
        }
        console.log(`Cooldown Notifier: Rescheduled ${rescheduledCount} active cooldowns on startup.`);
    } catch (error) {
        console.error('Cooldown Notifier: Error rescheduling cooldowns on startup:', error);
    }

    setInterval(() => stickyMessageManager.cleanupExpiredStickyMessages(db, client), 10 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!isFirestoreReady) {
        console.error('Firestore is not yet ready to process interactions. Skipping interaction.');
        if (interaction.isChatInputCommand() && !interaction.deferred && !interaction.replied) {
            await interaction.reply({
                content: 'The bot is still starting up. Please try the command again in a moment.',
                flags: 0
            });
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

            const {
                content,
                components
            } = await paginationHelpers.createChannelPaginationMessage(interaction.guild, newPage);
            await interaction.editReply({
                content,
                components,
                flags: 0
            });
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

                await setDoc(prefsRefs[targetCooldownType], {
                    enabled: newStates[targetCooldownType]
                }, {
                    merge: true
                });

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
                        `You'll be pinged when your **clan repair cooldown** is over.\n\n` +
                        `**Gambling Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.gamblingCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your **gambling cooldowns** are over.`
                    )
                    .setFooter({
                        text: 'Use the buttons to toggle your notifications.'
                    });

                const attackButton = new ButtonBuilder()
                    .setCustomId('toggle_attack_notifications')
                    .setLabel('Attack')
                    .setStyle(currentPrefs.attackCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const farmButton = new ButtonBuilder()
                    .setCustomId('toggle_farm_notifications')
                    .setLabel('Farm')
                    .setStyle(currentPrefs.farmCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const medButton = new ButtonBuilder()
                    .setCustomId('toggle_med_notifications')
                    .setLabel('Meds')
                    .setStyle(currentPrefs.medCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const voteButton = new ButtonBuilder()
                    .setCustomId('toggle_vote_notifications')
                    .setLabel('Vote')
                    .setStyle(currentPrefs.voteCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const repairButton = new ButtonBuilder()
                    .setCustomId('toggle_repair_notifications')
                    .setLabel('Repair')
                    .setStyle(currentPrefs.repairCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const gamblingButton = new ButtonBuilder()
                    .setCustomId('toggle_gambling_notifications')
                    .setLabel('Gambling')
                    .setStyle(currentPrefs.gamblingCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

                const row1 = new ActionRowBuilder().addComponents(attackButton, farmButton, medButton, voteButton, repairButton);
                const row2 = new ActionRowBuilder().addComponents(gamblingButton);

                await interaction.editReply({
                    embeds: [embed],
                    components: [row1, row2]
                });
                console.log(`[Notify Button] Updated original message with new notification status for ${userId}.`);

            } catch (error) {
                console.error(`[Notify Button] Error toggling notification preference for ${userId}:`, error);
                await interaction.followUp({
                    content: '❌ An error occurred while updating your notification settings. Please check logs.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } else if (interaction.customId.startsWith('show_trivia_explanation_')) {
            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const originalMessageId = parts[3];

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

                    const originalMessage = interaction.message;
                    if (originalMessage) {
                        const newComponents = originalMessage.components.map(row => {
                            return new ActionRowBuilder().addComponents(
                                row.components.map(button => {
                                    return ButtonBuilder.from(button).setDisabled(true);
                                })
                            );
                        });
                        await originalMessage.edit({
                            embeds: [originalMessage.embeds[0]],
                            components: newComponents
                        });
                    }

                    await interaction.followUp({
                        content: explanationContent,
                        flags: 0
                    });
                    console.log(`Trivia Solver: Posted explanation for message ID ${originalMessageId} in #${interaction.channel.name}.`);
                } else {
                    await interaction.followUp({
                        content: 'Could not find explanation for this trivia question.',
                        flags: 0
                    });
                    console.warn(`Trivia Solver: Explanation not found for message ID ${originalMessageId}.`);
                }
            } catch (error) {
                console.error(`Trivia Solver: Error fetching explanation for message ID ${originalMessageId}:`, error);
                await interaction.followUp({
                    content: 'An error occurred while fetching the explanation. Please check logs.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } else if (interaction.customId.startsWith('select-channels-to-set_page_')) {
            await interaction.deferUpdate();

            const selectedChannelIds = interaction.values;
            const guild = interaction.guild;
            const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

            if (!guild) {
                return await interaction.followUp({
                    content: 'This action can only be performed in a guild.',
                    flags: 0
                });
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
                    }, {
                        merge: true
                    });

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

            await interaction.editReply({
                content: replyContent,
                components: [],
                flags: 0
            });
        }
    }

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            if (command.data.name === 'damage-calc') {
                await command.execute(interaction, db, client, APP_ID_FOR_FIRESTORE);
            } else if (command.data.name === 'channel-set') {
                const {
                    content,
                    components
                } = await paginationHelpers.createChannelPaginationMessage(interaction.guild, 0);
                await interaction.reply({
                    content,
                    components,
                    ephemeral: true
                });
            } else {
                await command.execute(interaction, db, client, APP_ID_FOR_FIRESTORE);
            }
            if (command.data.name !== 'channel-set') {
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
            }
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: 0
                });
            } else if (interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    flags: 0
                });
            }
        }
    }
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
