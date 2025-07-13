const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name, description, and options.
    data: new SlashCommandBuilder()
        .setName('trivia-solve')
        .setDescription('Attempts to solve a trivia question from a linked message using an LLM.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message containing the trivia question embed.')
                .setRequired(true)
        ),

    // The execute function now accepts the 'client' object as an argument.
    async execute(interaction, db, client) { // db is passed but not used by this specific command
        // Defer the reply immediately. Non-ephemeral for testing.
        await interaction.deferReply({ ephemeral: false });

        const messageLink = interaction.options.getString('link');

        // Regex to parse Discord message links
        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        let question = null;
        let options = null;

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

            // Check if the message has an embed and if it's a trivia message
            if (targetMessage.embeds.length > 0) {
                const embed = targetMessage.embeds[0];
                const hasTriviaStreakField = embed.fields.some(field => field.name && field.name.includes('Trivia Streak'));

                if (hasTriviaStreakField && embed.title && embed.description) {
                    question = embed.title;
                    options = embed.description;
                }
            }

            if (!question || !options) {
                return await interaction.editReply({ content: 'Could not find a valid trivia question embed in the linked message (expected: "Trivia Streak" field, title, and description).', ephemeral: false });
            }

        } catch (error) {
            console.error('Error fetching or parsing message for trivia command:', error);
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) { // Unknown Channel, Unknown Message, Missing Access
                return await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                return await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message for trivia. Please check the bot\'s logs.', ephemeral: false });
            }
        }

        // --- Construct the prompt for the LLM ---
        const prompt = `Answer the following multiple-choice question by selecting only the letter (A, B, C, or D) that corresponds to the correct answer. Do not provide any other text, explanation, or punctuation.

Question: ${question}
Options:
${options}`;

        let llmAnswer = null;
        let replyContent = `**Attempting to solve trivia:**\nQuestion: \`${question}\`\nOptions:\n\`\`\`\n${options}\n\`\`\`\n`;

        try {
            // Call the LLM (Gemini API)
            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            // --- IMPORTANT: For outside environments like Render, get API key from environment variables ---
            const apiKey = process.env.GOOGLE_API_KEY; // <-- Updated: Get API key from environment variable
            if (!apiKey) {
                console.error('Trivia Solver Command: GOOGLE_API_KEY environment variable not set.');
                replyContent += `**LLM Answer:** API key is missing. Please set GOOGLE_API_KEY environment variable.`;
                await interaction.editReply({ content: replyContent, ephemeral: false });
                return;
            }
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            
            // --- DIAGNOSTIC LOG: Log the raw LLM response ---
            console.log('Trivia Solver Command: Raw LLM response:', JSON.stringify(result, null, 2));

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                llmAnswer = result.candidates[0].content.parts[0].text.trim();
                // Ensure the answer is just a single letter (A, B, C, D)
                llmAnswer = llmAnswer.charAt(0).toUpperCase();
                replyContent += `**LLM Answer:** \`${llmAnswer}\``;
            } else {
                replyContent += `**LLM Answer:** Could not get a valid response from the LLM.`;
                console.warn('Trivia Solver Command: LLM response structure unexpected or empty.');
            }

        } catch (error) {
            replyContent += `**LLM Answer:** An error occurred while calling the LLM.`;
            console.error('Trivia Solver Command: Error calling LLM API:', error);
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
    },
};
