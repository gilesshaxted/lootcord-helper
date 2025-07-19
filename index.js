// index.js

// Import necessary classes from the discord.js library
const {
  Client,
  GatewayIntentBits,
  Collection,
  InteractionType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Import Firebase modules
const { initializeApp } = require('firebase/app');
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
  getDoc
} = require('firebase/firestore');

// Import Utilities
const statsTracker = require('./utils/statsTracker');
const botStatus = require('./utils/botStatus');
const { startBotPresenceListener } = require('./utils/botStatus'); // <-- ✅ Added
const paginationHelpers = require('./utils/pagination');
const startupChecks = require('./utils/startupChecks');
const wordleHelpers = require('./utils/wordleHelpers');

require('dotenv').config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PORT = process.env.PORT || 3000;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const APP_ID_FOR_FIRESTORE = process.env.RENDER_SERVICE_ID || 'my-discord-bot-app';

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ]
});

// [rest of index.js unchanged...]
// Below is the relevant change in client.once('ready'):

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
    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: slashCommandsToRegister }
    );
    console.log(`Successfully reloaded ${data.length} global (/) commands.`);
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }

  botStatus.updateBotPresence(client, statsTracker.getBotStats());
  setInterval(() => botStatus.updateBotPresence(client, statsTracker.getBotStats()), 300000);

  // ✅ Start Firestore bot presence listener
  startBotPresenceListener(client, db);

  await startupChecks.checkAndRenameChannelsOnStartup(db, isFirestoreReady, client);
});
