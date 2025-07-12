// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
// Import express to create a simple web server
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from a .env file if it exists
// This is good practice for local development. For deployment,
// you'll set these variables directly in your hosting environment.
require('dotenv').config();

// Retrieve the bot token and client ID from environment variables
// It's crucial to keep these secret and never hardcode them.
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Your bot's application ID
// Define the port for the web server, defaulting to 3000 if not set by the environment
const PORT = process.env.PORT || 3000;

// Basic validation for environment variables
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set.');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('Error: DISCORD_CLIENT_ID environment variable not set.');
    console.error('You can find your Client ID (Application ID) in the Discord Developer Portal under "General Information" for your application.');
    process.exit(1);
}

// Create a new Discord client instance
// GatewayIntentBits are crucial for your bot to receive specific events from Discord.
// For slash commands, GatewayIntentBits.Guilds and GatewayIntentBits.GuildMessages are often sufficient.
// If your bot needs to read message content (e.g., for prefix commands), you would also need GatewayIntentBits.MessageContent.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Required for guild-related events like guild creation, deletion, etc.
        GatewayIntentBits.GuildMessages, // Required for messages in guilds
        // GatewayIntentBits.MessageContent, // Uncomment if you need to read message content
    ]
});

// Create a Collection to store your commands
// This makes it easy to manage and access your slash commands.
client.commands = new Collection();
const commands = []; // Array to hold command data for Discord API registration

// --- Command Loading ---
// In a larger bot, you'd typically have commands in separate files.
// For this basic example, we'll define the ping command directly.

// Define the /ping command structure
const pingCommand = {
    data: {
        name: 'ping',
        description: 'Responds with the bot\'s latency.',
    },
    async execute(interaction) {
        // Calculate the bot's current latency in milliseconds
        // client.ws.ping provides the WebSocket heartbeat latency.
        const latency_ms = Math.round(client.ws.ping);
        await interaction.reply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.`, ephemeral: false });
        // ephemeral: true means only the user who used the command can see the response.
        // ephemeral: false (default) means everyone can see the response.
    },
};

// Add the ping command to the commands collection and array
client.commands.set(pingCommand.data.name, pingCommand);
commands.push(pingCommand.data);

// --- Event Handlers ---

// Event: Client is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');

    // Register slash commands globally (or per guild)
    // Global commands can take up to an hour to propagate.
    // Guild-specific commands register instantly for testing.
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Register commands globally
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID), // For global commands
            // Routes.applicationGuildCommands(CLIENT_ID, 'YOUR_GUILD_ID'), // For guild-specific commands (faster for testing)
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // Catch any errors and log them
        console.error('Failed to register slash commands:', error);
    }
});

// Event: Interaction created (for slash commands)
client.on('interactionCreate', async interaction => {
    // Only process slash command interactions
    if (!interaction.isChatInputCommand()) return;

    // Get the command from the client's commands collection
    const command = client.commands.get(interaction.commandName);

    // If the command doesn't exist, return
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        // Execute the command
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        // Reply to the user if an error occurs
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
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
