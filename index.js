// Import necessary classes from the discord.js library
const { Client, GatewayIntentBits, Collection } = require('discord.js');
// REST and Routes are needed for slash commands
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

// Load environment variables from a .env file if it exists
// This is good practice for local development. For deployment,
// you'll set these variables directly in your hosting environment.
require('dotenv').config();

// Retrieve the bot token and client ID from environment variables
// It's crucial to keep these secret and never hardcode them.
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Your bot's application ID (REQUIRED for slash commands)

// Define the prefix for your bot commands (re-introduced for !ping)
const PREFIX = '!';

// Basic validation for environment variables
if (!TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set.');
    process.exit(1);
}
// CLIENT_ID is required for slash commands
if (!CLIENT_ID) {
    console.error('Error: DISCORD_CLIENT_ID environment variable not set.');
    console.error('You can find your Client ID (Application ID) in the Discord Developer Portal under "General Information" for your application.');
    process.exit(1);
}

// Create a new Discord client instance
// GatewayIntentBits.MessageContent is now REQUIRED again for prefix commands.
// You must also enable "Message Content Intent" in your bot's settings on the Discord Developer Portal.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Required for guild-related events (and slash commands)
        GatewayIntentBits.GuildMessages,    // Required for messages in guilds (and interactions)
        GatewayIntentBits.MessageContent,   // REQUIRED for reading message content (for prefix commands)
    ]
});

// Create a Collection to store your commands (good practice for slash commands)
client.commands = new Collection();
const slashCommands = []; // Array to hold slash command data for Discord API registration

// --- Command Loading ---
// Define the /ping slash command structure
const pingSlashCommand = {
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

// Add the slash command to the commands collection and array
client.commands.set(pingSlashCommand.data.name, pingSlashCommand);
slashCommands.push(pingSlashCommand.data);


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
        console.log(`Started refreshing ${slashCommands.length} application (/) commands.`);

        // FOR DEVELOPMENT/TESTING: Use Routes.applicationGuildCommands for instant refresh.
        // Replaced 'YOUR_GUILD_ID_HERE' with the provided guild ID.
        const GUILD_ID = '1192414247196573747'; // Your specific guild ID for testing
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // For guild-specific commands (faster for testing)
            { body: slashCommands },
        );

        // FOR PRODUCTION: Use Routes.applicationCommands for global deployment (takes time to propagate).
        // Commented out for now to prioritize guild-specific testing.
        // const data = await rest.put(
        //     Routes.applicationCommands(CLIENT_ID), // For global commands
        //     { body: slashCommands },
        // );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // Catch any errors and log them
        console.error('Failed to register slash commands:', error);
    }
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
