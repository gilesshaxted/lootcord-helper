// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection } = require('discord.js');
// Note: REST and Routes are primarily for slash commands, not needed for prefix commands
// const { REST } = require('@discordjs/rest');
// const { Routes } = require('discord-api-types/v10');
// Import express to create a simple web server
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from a .env file if it exists
// This is good practice for local development. For deployment,
// you'll set these variables directly in your hosting environment.
require('dotenv').config();

// Retrieve the bot token from environment variables
// It's crucial to keep this secret and never hardcode it.
const TOKEN = process.env.DISCORD_BOT_TOKEN;
// CLIENT_ID is not strictly needed for prefix commands unless you're also registering slash commands
// const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

// Define the prefix for your bot commands
const PREFIX = '!';

// Define the port for the web server, defaulting to 3000 if not set by the environment
const PORT = process.env.PORT || 3000;

// Basic validation for environment variables
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set.');
    process.exit(1);
}
// If you were to use CLIENT_ID for slash commands, you'd keep this check:
// if (!CLIENT_ID) {
//     console.error('Error: DISCORD_CLIENT_ID environment variable not set.');
//     console.error('You can find your Client ID (Application ID) in the Discord Developer Portal under "General Information" for your application.');
//     process.exit(1);
// }

// Create a new Discord client instance
// For prefix commands, GatewayIntentBits.MessageContent is absolutely required
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

// --- Web Server for Hosting Platforms ---
// Create an Express application
const app = express();

// Define a simple root route
app.get('/', (req, res) => {
    res.send('Discord bot is running and listening for commands!');
});

// Start the web server
app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
