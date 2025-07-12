const Discord = require('discord.js');
const client = new Discord.Client();
const prefix = '!';

// Retrieve the bot token and client ID from environment variables
// It's crucial to keep these secret and never hardcode them.
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Your bot's application ID

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

client.once('ready', () => {
  console.log('Bot is online!');
});

client.on('message', message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ping') {
    message.channel.send('Pong!');
  } else if (command === 'hello') {
    message.channel.send(`Hello, ${message.author}!`);
  }
});

// Log in to Discord with your client's token
client.login(TOKEN);
