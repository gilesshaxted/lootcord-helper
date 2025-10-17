const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Define a bright yellow color in HEX format
const BRIGHT_YELLOW = 0xFFD700; 

// Define the comprehensive message content using template literals and \n for breaks
const WELCOME_MESSAGE = 
`:wave: **Welcome** to **LPG - Lootcord Official PvE!**\n\n` + 
`We're glad to have you here! Here’s what you need to know to jump into the action:\n\n` + 
`:rocket: **First Steps**\nIf you haven't already, please **verify** your account above and unlock access to all the chat channels!\n\n` + 
`:robot: **Lootcord Helper Commands**\nThis bot is packed with features to help you farm efficiently! Here are a few key commands:\n` + 
`- Use \`/notify\` to sign up for cooldown notifications. Never miss a drop!\n` +
`- Use \`/solo\` and \`/solo-off\` to claim a mob for yourself. *(Note: Mob owners still retain kill priority.)*\n` +
`- Use \`/damage-calc\` to help work out your own personalized attack damage.\n\n` +
`:star2: **Automated Features**\nLootcord Helper also handles a lot automatically in the background:\n` +
`- **Automatic Channel Naming** for mobs in dedicated channels.\n` +
`- **Automatic Trivia & Scramble Answers** to help the server stay engaged.\n` +
`- **Specific Shop Pings** for desirable items when they appear.\n` +
`- You can also ask this bot questions about the game right here in this chat! \n\n` +
`Check out <id:customize> for all available ping roles (e.g., for specific mobs or items)!\nGood luck, and happy looting!`;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome-post')
        .setDescription('Posts the official server welcome message embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Acknowledge the command immediately (required for all slash commands)
        // Since index.js handles the initial deferral, we skip it here.

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.followUp({ content: '❌ You need Administrator permissions to run this command.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(BRIGHT_YELLOW)
            .setTitle(':wave: Welcome to LPG - Lootcord Official PvE! :rocket:')
            .setDescription(WELCOME_MESSAGE)
            .setTimestamp();

        try {
            // Send the final message publicly
            await interaction.channel.send({ embeds: [embed] });
            
            // Delete the interaction message (the /welcome-post command itself)
            // We use followUp and deleteReply since the interaction was deferred globally in index.js
            await interaction.editReply({ content: '✅ Welcome post successfully sent.', ephemeral: true });
        } catch (error) {
            console.error('[Welcome Post] Failed to send embed or edit interaction:', error);
            await interaction.followUp({ content: '❌ Failed to post welcome message. Check bot permissions (Send Messages, Embed Links).', ephemeral: true });
        }
    },
};
