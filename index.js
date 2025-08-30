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
  AttachmentBuilder, // ADDED: Required for file attachments
  Collection, // ADDED: Required for command handler
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // ADDED: Required for crypto.randomUUID()

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, onAuthStateChanged } = require('firebase/auth');
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
  deleteDoc, // ADDED: Required for deleting documents
} = require('firebase/firestore');

// ... (rest of the code is the same) ...

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- Command Handling Setup ---
client.commands = new Collection(); // This line now works!
const slashCommandsToRegister = [];

// ... (rest of the code is the same) ...

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
      console.log('Firestore client initialized and ready.');
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
  
  // NOTE: This bot status update is better handled in the clientReady event
  // where client.user is guaranteed to be available.
  const botStatusDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`), 'mainStatus');
  onSnapshot(botStatusDocRef, (docSnap) => {
    if (docSnap.exists()) {
      console.log('Current bot status from Firestore:', docSnap.data());
    } else {
      console.log('No bot status document found in Firestore.');
    }
  }, (error) => {
    console.error('Error listening to bot status:', error);
  });

  // Listener for bot statistics
  const statsDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/stats`), 'botStats');
  onSnapshot(statsDocRef, (docSnap) => {
    if (docSnap.exists()) {
      statsTracker.updateInMemoryStats(docSnap.data());
    } else {
      console.log('Stats Tracker: No botStats document found in Firestore. Initializing with defaults.');
      statsTracker.initializeStats({});
    }
  }, (error) => {
    console.error('Stats Tracker: Error listening to botStats:', error);
  });
}

// ... (rest of the code is the same) ...

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

  // Now, update the bot status in Firestore since client.user is available
  if (db && APP_ID_FOR_FIRESTORE && userId !== 'unknown') {
    const botStatusDocRef = doc(collection(db, `artifacts/${APP_ID_FOR_FIRESTORE}/public/data/botStatus`), 'mainStatus');
    try {
      await setDoc(botStatusDocRef, {
        status: 'Online',
        lastUpdated: new Date().toISOString(),
        botName: client.user.tag,
        connectedUserId: userId,
      }, { merge: true });
      console.log('Bot status updated in Firestore from clientReady event.');
    } catch (e) {
      console.error('Error writing bot status to Firestore from clientReady:', e);
    }
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // ... (rest of the code is the same) ...
});
