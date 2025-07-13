const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { findAnagramsFromDictionary } = require('../utils/dictionary');
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unscramble')
        .setDescription('Unscrambles letters from a linked message and posts possible words.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message containing the scrambled word (e.g., in an embed description).')
                .setRequired(true)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) { // Added APP_ID_FOR_FIRESTORE
        await interaction.deferReply({ ephemeral: false });

        const messageLink = interaction.options.getString('link');
        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        let scrambledLetters = null;
        let debugOutput = '';

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

            if (targetMessage.embeds.length > 0) {
                const embed = targetMessage.embeds[0];
                const embedDescription = embed.description;
                const embedFields = embed.fields;

                const wordMatch = embedDescription ? embedDescription.match(/Word:\s*```fix\n([a-zA-Z]+)```/s) : null;
                const hasRewardField = embedFields.some(field => field.name && field.name.includes('Reward'));

                if (wordMatch && wordMatch[1] && hasRewardField) {
                    scrambledLetters = wordMatch[1].toLowerCase();
                }
            }

            if (!scrambledLetters) {
                debugOutput += 'Could not find the scrambled word based on current regex and conditions.\n';
                return await interaction.editReply({ content: debugOutput + 'Expected format: "Word: ```fix\\n[letters]```" and a "Reward" field.', ephemeral: false });
            }

        } catch (error) {
            console.error('Error fetching or parsing message for unscramble command:', error);
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) {
                return await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message for unscrambling. Please check the bot\'s logs.', ephemeral: false });
            }
        }

        const possibleWords = findAnagramsFromDictionary(scrambledLetters);

        let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

        if (possibleWords.length > 0) {
            replyContent += `Possible words (from local dictionary, using all letters): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
            statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for unscramble
        } else {
            replyContent += `No words found in the local dictionary using all letters.`;
        }

        if (replyContent.length > 2000) {
            replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
    },
};
