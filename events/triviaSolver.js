// This event listener will listen for messageCreate events
// It will detect trivia questions from a specific bot, use an LLM to find the answer, and post it.

const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot posting trivia

module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, isFirestoreReady, and APP_ID_FOR_FIRESTORE from index.js
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return; // Ignore messages from this bot itself

        // Only process messages in guilds
        if (!message.guild) return;

        // Crucial: Check if Firestore is ready before attempting any DB operations (for stats tracking)
        if (!isFirestoreReady) {
            console.warn('Trivia Solver: Firestore not ready. Skipping processing.');
            return;
        }

        // Check if the message has an embed and if it's a trivia message
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            // Updated trigger: if the embed title exists, ends with '?', and there's a description
            if (embed.title && embed.title.endsWith('?') && embed.description) {
                const question = embed.title;
                const options = embed.description; // e.g., "**A**: 17\n**B**: 18\n**C**: 15\n**D**: 16"

                // Construct the prompt for the LLM
                // Updated prompt to ask for most likely, alternative, and explanation
                const prompt = `Answer the following multiple-choice question. Provide the single most likely correct answer (A, B, C, or D). If there is a plausible alternative answer, provide one. Also, provide a brief explanation for the choices. Format your response strictly as:
Most Likely: [Letter]
Possible Alternative: [Letter] (if applicable, otherwise omit this line)
Explanation:
[Brief explanation of why the choices are correct/incorrect]

Question: ${question}
Options:
${options}`;

                let llmAnswerRaw = null;
                let mostLikelyAnswer = null;
                let possibleAlternative = null;
                let explanation = null;

                try {
                    // Call the LLM (Gemini API)
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    const payload = { contents: chatHistory };
                    const apiKey = process.env.GOOGLE_API_KEY; // Get API key from environment variable

                    if (!apiKey) {
                        console.error('Trivia Solver: GOOGLE_API_KEY environment variable not set. Cannot solve trivia.');
                        return;
                    }

                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();
                    
                    if (result.candidates && result.candidates.length > 0 &&
                        result.candidates[0].content && result.candidates[0].content.parts &&
                        result.candidates[0].content.parts.length > 0) {
                        llmAnswerRaw = result.candidates[0].content.parts[0].text.trim();

                        // Parse the LLM's response based on the new format
                        const mostLikelyMatch = llmAnswerRaw.match(/Most Likely:\s*([A-D])/i);
                        const alternativeMatch = llmAnswerRaw.match(/Possible Alternative:\s*([A-D])/i);
                        const explanationMatch = llmAnswerRaw.match(/Explanation:\s*([\s\S]*)/i); // Capture everything after "Explanation:"

                        if (mostLikelyMatch && mostLikelyMatch[1]) {
                            mostLikelyAnswer = mostLikelyMatch[1].toUpperCase();
                        }
                        if (alternativeMatch && alternativeMatch[1]) {
                            possibleAlternative = alternativeMatch[1].toUpperCase();
                        }
                        if (explanationMatch && explanationMatch[1]) {
                            explanation = explanationMatch[1].trim();
                        }

                    } else {
                        console.warn('Trivia Solver: LLM response structure unexpected or empty for question:', question);
                    }

                } catch (error) {
                    console.error('Trivia Solver: Error calling LLM API for question:', question, error);
                }

                let replyContent = `**Trivia Answer for:** \`${question}\`\n`;
                if (mostLikelyAnswer) {
                    replyContent += `Most Likely: \`${mostLikelyAnswer}\`\n`;
                    if (possibleAlternative) {
                        replyContent += `Possible Alternative: \`${possibleAlternative}\`\n`;
                    }
                    if (explanation) {
                        // Corrected syntax for explanation block
                        replyContent += `\n-# **Explanation:**\n\-# `\`\`\n${explanation}\n\`\`\``;
                    }
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for answering trivia
                } else {
                    replyContent += `Could not determine the answer using LLM.`;
                    if (llmAnswerRaw) {
                         replyContent += `\nRaw LLM Output: \n\`\`\`\n${llmAnswerRaw.substring(0, 500)}...\n\`\`\``; // Truncate raw output
                    }
                }

                if (replyContent.length > 2000) {
                    replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
                }

                if (mostLikelyAnswer) { // Only send if we got a primary answer
                    try {
                        await message.channel.send({ content: replyContent });
                        console.log(`Trivia Solver: Answered '${question}' with '${mostLikelyAnswer}' in #${message.channel.name}`);
                    } catch (error) {
                        console.error(`Trivia Solver: Failed to post answer in #${message.channel.name}:`, error);
                    }
                } else {
                    console.log(`Trivia Solver: Could not determine primary answer for '${question}'.`);
                }
            }
        }
    },
};
