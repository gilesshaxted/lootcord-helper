const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Import ActionRowBuilder, ButtonBuilder, ButtonStyle

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
                // Updated prompt to ask for correct answer and explanations for each option.
                const prompt = `Given the following multiple-choice question and options, identify the single correct answer and provide a brief explanation for each option (A, B, C, D) indicating why it is correct or incorrect. Format your response strictly as a JSON object with the following structure:
{
  "correct_answer": "A",
  "explanation_A": "Explanation for option A",
  "explanation_B": "Explanation for option B",
  "explanation_C": "Explanation for option C",
  "explanation_D": "Explanation for option D"
}

Question: ${question}
Options:
${options}`;

                let llmResponseJson = null;
                let mostLikelyAnswerLetter = null;
                let explanations = {}; // Store explanations for A, B, C, D

                try {
                    // Call the LLM (Gemini API)
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    const payload = { 
                        contents: chatHistory,
                        generationConfig: {
                            responseMimeType: "application/json", // Request JSON output
                            responseSchema: { // Define expected JSON schema
                                type: "OBJECT",
                                properties: {
                                    "correct_answer": { "type": "STRING" },
                                    "explanation_A": { "type": "STRING" },
                                    "explanation_B": { "type": "STRING" },
                                    "explanation_C": { "type": "STRING" },
                                    "explanation_D": { "type": "STRING" }
                                },
                                "propertyOrdering": ["correct_answer", "explanation_A", "explanation_B", "explanation_C", "explanation_D"]
                            }
                        }
                    };
                    const apiKey = process.env.GOOGLE_API_KEY;

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
                        
                        const rawJsonText = result.candidates[0].content.parts[0].text;
                        llmResponseJson = JSON.parse(rawJsonText); // Parse the JSON string

                        if (llmResponseJson.correct_answer) {
                            mostLikelyAnswerLetter = llmResponseJson.correct_answer.toUpperCase();
                        }
                        explanations.A = llmResponseJson.explanation_A || 'No explanation provided.';
                        explanations.B = llmResponseJson.explanation_B || 'No explanation provided.';
                        explanations.C = llmResponseJson.explanation_C || 'No explanation provided.';
                        explanations.D = llmResponseJson.explanation_D || 'No explanation provided.';

                    } else {
                        console.warn('Trivia Solver: LLM response structure unexpected or empty for question:', question);
                    }

                } catch (error) {
                    console.error('Trivia Solver: Error calling LLM API or parsing JSON for question:', question, error);
                }

                let replyContent = `**Trivia Answer for:** \`${question}\``;
                const buttons = [];
                const optionLetters = ['A', 'B', 'C', 'D'];

                optionLetters.forEach(letter => {
                    const isCorrect = mostLikelyAnswerLetter === letter;
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(`trivia_answer_${letter}`) // Custom ID for button interaction
                            .setLabel(letter)
                            .setStyle(isCorrect ? ButtonStyle.Success : ButtonStyle.Secondary) // Green for correct, gray for others
                            .setDisabled(true) // Disable buttons after sending
                    );
                });

                const row = new ActionRowBuilder().addComponents(buttons);

                if (mostLikelyAnswerLetter) {
                    // No "Most Likely" text here, as the green button indicates it.
                    // No "Possible Alternative" line needed as per new format
                    
                    if (explanations.A || explanations.B || explanations.C || explanations.D) {
                        replyContent += `\n-# **Explanation:**\n`; // Updated format for heading
                        optionLetters.forEach(letter => {
                            if (explanations[letter]) {
                                replyContent += `-# ${letter}: \`${explanations[letter]}\`\n`; // Updated format for each explanation line
                            }
                        });
                    }
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps
                } else {
                    replyContent += `I apologize, but I couldn't determine a definitive answer from the LLM.`;
                    if (llmResponseJson) {
                         replyContent += `\nRaw LLM Output (JSON): \n\`\`\`json\n${JSON.stringify(llmResponseJson, null, 2).substring(0, 500)}...\n\`\`\``;
                    }
                }

                if (replyContent.length > 2000) {
                    replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
                }

                try {
                    await message.channel.send({ content: replyContent, components: [row] }); // Send with buttons
                    if (mostLikelyAnswerLetter) {
                        console.log(`Trivia Solver: Answered '${question}' with '${mostLikelyAnswerLetter}' in #${message.channel.name}`);
                    } else {
                        console.log(`Trivia Solver: Posted apology for '${question}' in #${message.channel.name}.`);
                    }
                } catch (error) {
                    console.error(`Trivia Solver: Failed to post reply with buttons in #${message.channel.name}:`, error);
                }
            }
        }
    },
};
