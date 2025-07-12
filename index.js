// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits } = require('discord.js');
// Note: REST, Routes, express, path, and fs are not needed for this basic prefix command bot.
// const { REST } = require('@discordjs/rest');
// const { Routes } = require('discord-api-types/v10');
// const express = require('express');
// const path = require('path');
// const fs = require('fs');

// Load environment variables from a .env file if it exists
// This is good practice for local development. For deployment,
// you'll set these variables directly in your hosting environment.
require('dotenv').config();

// Retrieve the bot token from environment variables
// It's crucial to keep this secret and never hardcode it.
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Define the prefix for your bot commands
const PREFIX = '!';

// Basic validation for environment variables
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set.');
    process.exit(1);
}

// Create a new Discord client instance
// For prefix commands, GatewayIntentBits.MessageContent is absolutely required.
// You must also enable "Message Content Intent" in your bot's settings on the Discord Developer Portal.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Required for guild-related events
        GatewayIntentBits.GuildMessages,    // Required for messages in guilds
        GatewayIntentBits.MessageContent,   // REQUIRED for reading message content (for prefix commands)
    ]
});

// --- Event Handlers ---

// Event: Client is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');
    // For prefix commands, there's no "syncing" like with slash commands.
    // The bot just starts listening for messages.
});

// Event: Message created (for prefix commands)
client.on('messageCreate', async message => {
    // Ignore messages from bots to prevent infinite loops
    if (message.author.bot) return;

    // Ignore messages that don't start with the defined prefix
    if (!message.content.startsWith(PREFIX)) return;

    // Extract the command and arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Handle the !ping command
    if (commandName === 'ping') {
        // Calculate the bot's current latency in milliseconds
        // client.ws.ping provides the WebSocket heartbeat latency.
        const latency_ms = Math.round(client.ws.ping);
        await message.reply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.` });
    }
});

// Log in to Discord with your client's token
client.login(TOKEN);

// --- No Web Server for Hosting Platforms ---
// The Express web server code has been completely removed as requested.
// If deploying to a platform that requires a web server to bind to a port,
// you may need to add this functionality back or configure your deployment
// as a background worker instead of a web service.
