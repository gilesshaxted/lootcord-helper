const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
require('dotenv').config(); // Load .env file for local testing

// --- IMPORTANT: Replace with your actual Bot Token and Client ID ---
// You can also rely on your .env file if it's configured correctly.
const TOKEN = process.env.DISCORD_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('Error: DISCORD_BOT_TOKEN is not set or is placeholder. Please set it in your .env or directly in this script for temporary use.');
    process.exit(1);
}
if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    console.error('Error: DISCORD_CLIENT_ID is not set or is placeholder. Please set it in your .env or directly in this script for temporary use.');
    process.exit(1);
}


const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Attempting to delete all global application (/) commands...');

        // Fetch all existing global commands
        const commands = await rest.get(Routes.applicationCommands(CLIENT_ID));
        
        if (commands.length === 0) {
            console.log('No global commands found to delete.');
            return;
        }

        // Delete each command by its ID
        for (const command of commands) {
            await rest.delete(Routes.applicationCommand(CLIENT_ID, command.id));
            console.log(`Deleted global command: ${command.name} (ID: ${command.id})`);
        }

        console.log('Successfully deleted all global application (/) commands.');
    } catch (error) {
        console.error('Error deleting global commands:', error);
    }
})();
