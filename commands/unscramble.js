const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { findAnagramsFromDictionary } = require('../utils/dictionary'); // Import from new utility file

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unscramble')
        .setDescription('Unscrambles letters from a linked message and posts possible words.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message containing the scrambled word (e.g., in an embed description).')
                .setRequired(true)
        ),

    async execute(interaction, db, client) { // db is passed but not used by this specific command
        await interaction.deferReply({ ephemeral: false }); // Changed to non-ephemeral for testing

        const messageLink = interaction.options.getString('link');

        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        let scrambledLetters = null;
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return await interaction.editReply({ content: 'Could not find the guild specified in the link. Is the bot in that guild?', ephemeral: false });
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                return await interaction.editReply({ content: 'Could not find the channel specified in the link. Is the bot in that channel?', ephemeral: false });
            }

            const targetMessage = await channel.messages.fetch(messageId);

            // Look for the scrambled letters in the first embed's description
            // The regex matches "Word: " followed by "fix" and then captures the letters on the next line.
            if (targetMessage.embeds.length > 0) {
                const embedDescription = targetMessage.embeds[0].description;
                if (embedDescription) {
                    const contentMatch = embedDescription.match(/Word:\s*fix\s*\n\s*([a-zA-Z]+)/);
                    if (contentMatch && contentMatch[1]) {
                        scrambledLetters = contentMatch[1].toLowerCase();
                    }
                }
            }

            if (!scrambledLetters) {
                return await interaction.editReply({ content: 'Could not find the scrambled word in the linked message\'s embed description (expected format: "Word: fix\\nletters").', ephemeral: false });
            }

        } catch (error) {
            console.error('Error fetching or parsing message for unscramble command:', error);
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) { // Unknown Channel, Unknown Message, Missing Access
                return await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                return await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message for unscrambling. Please check the bot\'s logs.', ephemeral: false });
            }
        }

        // --- Find possible words using the local dictionary ---
        const possibleWords = findAnagramsFromDictionary(scrambledLetters);

        let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

        if (possibleWords.length > 0) {
            // Sorting is now handled inside findAnagramsFromDictionary
            replyContent += `Possible words (from local dictionary, using all letters): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
        } else {
            replyContent += `No words found in the local dictionary using all letters.`;
        }

        if (replyContent.length > 2000) {
            replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
    },
};
