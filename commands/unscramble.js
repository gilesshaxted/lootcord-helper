const { SlashCommandBuilder, MessageFlags } = require('discord.js');
// Removed fs and path imports as local dictionary is no longer used
// const fs = require('fs');
// const path = require('path');
// Removed findAnagramsFromDictionary import as local dictionary is no longer used
// const { findAnagramsFromDictionary } = require('../utils/dictionary');
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unscramble')
        .setDescription('Unscrambles letters from a linked message and posts possible words using an LLM.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message containing the scrambled word (e.g., in an embed description).')
                .setRequired(true)
        ),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) { // APP_ID_FOR_FIRESTORE is passed for stats tracking
        await interaction.deferReply({ ephemeral: false }); // Changed to non-ephemeral for testing

        const messageLink = interaction.options.getString('link');

        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        let scrambledLetters = null;
        let debugOutput = ''; // Initialize debug output for intermediate checks

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
            // And confirm the presence of a "Reward" field
            if (targetMessage.embeds.length > 0) {
                const embed = targetMessage.embeds[0];
                const embedDescription = embed.description;
                const embedFields = embed.fields;

                // Updated regex: Matches "Word:", then optional whitespace, then "```fix\n",
                // then captures the letters, and then looks for "```"
                const wordMatch = embedDescription ? embedDescription.match(/Word:\s*```fix\n([a-zA-Z]+)```/s) : null;
                
                // Check for "Reward" field as a validation
                const hasRewardField = embedFields.some(field => field.name && field.name.includes('Reward'));

                if (wordMatch && wordMatch[1] && hasRewardField) {
                    scrambledLetters = wordMatch[1].toLowerCase();
                }
            }

            if (!scrambledLetters) {
                return await interaction.editReply({ content: 'Could not find the scrambled word in the linked message\'s embed description (expected format: "Word: ```fix\\n[letters]```" and a "Reward" field).', ephemeral: false });
            }

        } catch (error) {
            console.error('Error fetching or parsing message for unscramble command:', error);
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) { // Unknown Channel, Unknown Message, Missing Access
                return await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message for unscrambling. Please check the bot\'s logs.', ephemeral: false });
            }
        }

        // --- Find possible words using the LLM ---
        const prompt = `Unscramble the following letters to form a single, most likely English word. Only provide the unscrambled word, no other text or punctuation: ${scrambledLetters}`;
        let llmAnswer = null;
        let apiErrorOccurred = false;

        try {
            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = process.env.GOOGLE_API_KEY; // Get API key from environment variable

            if (!apiKey) {
                console.error('Unscramble Command: GOOGLE_API_KEY environment variable not set.');
                apiErrorOccurred = true;
                llmAnswer = "API key is missing.";
            } else {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                
                // Diagnostic log for LLM response
                console.log('Unscramble Command: Raw LLM response:', JSON.stringify(result, null, 2));

                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    llmAnswer = result.candidates[0].content.parts[0].text.trim().toLowerCase();
                } else {
                    console.warn('Unscramble Command: LLM response structure unexpected or empty for scrambled letters:', scrambledLetters);
                    llmAnswer = "Could not get a valid response from the LLM.";
                }
            }
        } catch (error) {
            console.error(`Unscramble Command: Error calling LLM API for '${scrambledLetters}':`, error);
            apiErrorOccurred = true;
            llmAnswer = "An error occurred while calling the LLM.";
        }

        let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

        if (apiErrorOccurred) {
            replyContent += `*Failed to get words from LLM: ${llmAnswer}*`;
        } else if (llmAnswer && llmAnswer !== "Could not get a valid response from the LLM.") {
            replyContent += `Most likely word (from LLM): \`${llmAnswer}\``;
            statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for unscramble
        } else {
            replyContent += `No likely word found by the LLM.`;
        }

        if (replyContent.length > 2000) {
            replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
    },
};
