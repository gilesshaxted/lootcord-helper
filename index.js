// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express'); // For the web server
const path = require('path'); // For resolving file paths
const fs = require('fs');     // For reading command files

// Load environment variables from a .env file
// This is crucial for local development and deployment.
require('dotenv').config();

// --- Configuration Variables ---
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = '!'; // Prefix for traditional message commands
const PORT = process.env.PORT || 3000; // Port for the web server

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

// --- Discord Client Setup ---
// Create a new Discord client instance with necessary intents.
// - GatewayIntentBits.Guilds: Required for guild-related events and interactions.
// - GatewayIntentBits.GuildMessages: Required for messages in guilds.
// - GatewayIntentBits.MessageContent: REQUIRED for reading message content (for prefix commands like !ping).
//   You MUST enable "Message Content Intent" in your bot's settings on the Discord Developer Portal.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// --- Command Handling Setup ---
// Collection to store slash commands, making them easily accessible by name.
client.commands = new Collection();
const slashCommandsToRegister = []; // Array to hold slash command data for Discord API registration.

// Dynamically load slash commands from the 'commands' directory.
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Ensure the command has 'data' and 'execute' properties.
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        slashCommandsToRegister.push(command.data.toJSON()); // Convert to JSON for Discord API.
    } else {
        console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// --- Discord Event Handlers ---

// Event: Client is ready and connected to Discord.
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('------');

    // Register slash commands with Discord's API.
    // This happens only once when the bot starts or when commands are updated.
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log(`Started refreshing ${slashCommandsToRegister.length} application (/) commands.`);

        // --- IMPORTANT: Choose one of the following for command deployment ---

        // FOR DEVELOPMENT/TESTING (INSTANT REFRESH): Use guild-specific commands.
        // Replace '1192414247196573747' with the ID of your specific Discord server (guild) for testing.
        // This updates commands instantly in that guild.
        const GUILD_ID_FOR_TESTING = '1192414247196573747';
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID_FOR_TESTING),
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${data.length} guild (/) commands.`);


        // FOR PRODUCTION (GLOBAL DEPLOYMENT): Use global commands.
        // These commands will be available in all servers your bot is in but can take up to an hour to propagate.
        // Uncomment the following block when you are ready for global deployment:
        /*
        const globalData = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: slashCommandsToRegister },
        );
        console.log(`Successfully reloaded ${globalData.length} global (/) commands.`);
        */

    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

// Event: Message created (for prefix commands like !ping)
client.on('messageCreate', async message => {
    // Ignore messages from bots to prevent infinite loops.
    if (message.author.bot) return;

    // Check if the message starts with the defined prefix.
    if (!message.content.startsWith(PREFIX)) return;

    // Extract the command name and arguments from the message.
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Handle the !ping command.
    if (commandName === 'ping') {
        const latency_ms = Math.round(client.ws.ping);
        await message.reply({ content: `Pong! 🏓 My ping is \`${latency_ms}ms\`.` });
    }
});

// Event: Interaction created (for slash commands)
client.on('interactionCreate', async interaction => {
    // Only process chat input (slash) commands.
    if (!interaction.isChatInputCommand()) return;

    // Retrieve the command from the client's commands collection.
    const command = client.commands.get(interaction.commandName);

    // If the command doesn't exist in our collection, log an error and return.
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        // Execute the command's logic.
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        // Reply to the user if an error occurs during command execution.
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// Log in to Discord with your bot's token.
client.login(TOKEN);

// --- Web Server for Hosting Platforms (e.g., Render) ---
// This simple Express server ensures the application binds to a port,
// satisfying requirements of web service hosting platforms.
const app = express();

app.get('/', (req, res) => {
    res.send('Discord bot is running and listening for commands!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
