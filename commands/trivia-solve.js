const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Import ActionRowBuilder, ButtonBuilder, ButtonStyle
const { doc, collection, setDoc } = require('firebase/firestore'); // Import Firestore functions

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot posting trivia
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025'; // Updated to latest preview model for stability

// --- Configuration for Structured JSON Output ---
const TRIVIA_SCHEMA = {
    type: "OBJECT",
    properties: {
        "most_likely_answer": { 
            "type": "STRING",
            "description": "The letter of the most likely correct option (A, B, C, or D)."
        },
        "confidence_percentage": { 
            "type": "INTEGER",
            "description": "A confidence score for the chosen answer as a percentage (0-100)."
        },
        "explanation_A": { 
            "type": "STRING",
            "description": "Explanation for option A, indicating why it is correct or incorrect."
        },
        "explanation_B": { 
            "type": "STRING",
            "description": "Explanation for option B, indicating why it is correct or incorrect."
        },
        "explanation_C": { 
            "type": "STRING",
            "description": "Explanation for option C, indicating why it is correct or incorrect."
        },
        "explanation_D": { 
            "type": "STRING",
            "description": "Explanation for option D, indicating why it is correct or incorrect."
        }
    },
    "required": ["most_likely_answer", "confidence_percentage", "explanation_A", "explanation_B", "explanation_C", "explanation_D"],
    "propertyOrdering": ["most_likely_answer", "confidence_percentage", "explanation_A", "explanation_B", "explanation_C", "explanation_D"]
};

// Removed: extractFallbackData function as it is no longer needed with structured output

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return;

        if (!message.guild) return;

        if (!isFirestoreReady) {
            console.warn('Trivia Solver: Firestore not ready. Skipping processing.');
            return;
        }

        // Check if the message has an embed and if it's a trivia message
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            // Trigger: if the embed title exists, ends with '?', and there's a description
            if (embed.title && embed.title.endsWith('?') && embed.description) {
                const question = embed.title;
                const options = embed.description;

                const systemPrompt = `You are an expert trivia solver. You have access to a Google Search tool. Use the search tool to verify the correct fact before providing your answer. Given the following multiple-choice question and options, identify the single best answer. Your response MUST be a single, valid JSON object that strictly adheres to the provided schema.`;

                const userQuery = `Question: ${question}\nOptions:\n${options}`;
                
                let llmResponseParsed = null;
                let mostLikelyAnswerLetter = null;
                let confidencePercentage = 0;
                let explanations = {}; 

                try {
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: userQuery }] });
                    
                    const payload = {
                        contents: chatHistory,
                        tools: [{ google_search: {} }], // Use the standard Google Search grounding tool
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        generationConfig: {
                            responseMimeType: "application/json",
                            responseSchema: TRIVIA_SCHEMA,
                            maxOutputTokens: 8192
                        }
                    };
                    
                    const apiKey = process.env.GOOGLE_API_KEY;

                    if (!apiKey) {
                        console.error('Trivia Solver: GOOGLE_API_KEY environment variable not set. Cannot solve trivia.');
                        return;
                    }

                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();
                    
                    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                        const jsonText = result.candidates[0].content.parts[0].text;
                        llmResponseParsed = JSON.parse(jsonText); 

                        mostLikelyAnswerLetter = (llmResponseParsed.most_likely_answer || '').toUpperCase();
                        confidencePercentage = llmResponseParsed.confidence_percentage ?? 0;
                        explanations = {
                            A: llmResponseParsed.explanation_A || 'No explanation provided.',
                            B: llmResponseParsed.explanation_B || 'No explanation provided.',
                            C: llmResponseParsed.explanation_C || 'No explanation provided.',
                            D: llmResponseParsed.explanation_D || 'No explanation provided.'
                        };

                        const validAnswers = ['A', 'B', 'C', 'D'];
                        if (!validAnswers.includes(mostLikelyAnswerLetter)) {
                            console.warn(`Trivia Solver: Invalid answer received from LLM: ${mostLikelyAnswerLetter}`);
                            mostLikelyAnswerLetter = null; 
                        }
                    } else {
                        console.warn('Trivia Solver: LLM response structure unexpected or empty for question:', question, JSON.stringify(result, null, 2));
                    }

                } catch (error) {
                    console.error('Trivia Solver: Error calling LLM API or parsing JSON for question:', question, error);
                }

                let replyContent = `**Trivia Answer for:** \`${question}\`\n`;
                const buttons = [];
                const optionLetters = ['A', 'B', 'C', 'D'];

                let buttonColor = ButtonStyle.Danger; 
                if (mostLikelyAnswerLetter) {
                    if (confidencePercentage >= 90) {
                        buttonColor = ButtonStyle.Success; 
                    } else if (confidencePercentage >= 50) {
                        buttonColor = ButtonStyle.Primary; 
                    } else if (confidencePercentage >= 10) { 
                        buttonColor = ButtonStyle.Secondary; 
                    }
                }

                optionLetters.forEach(letter => {
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(`show_trivia_explanation_${message.id}_${letter}`)
                            .setLabel(letter)
                            .setStyle(letter === mostLikelyAnswerLetter ? buttonColor : ButtonStyle.Secondary)
                    );
                });

                const row = new ActionRowBuilder().addComponents(buttons);

                if (mostLikelyAnswerLetter) {
                    replyContent += `Most Likely: \`${mostLikelyAnswerLetter}\` (Confidence: ${confidencePercentage}%) \n`;
                    replyContent += `Click a button for an explanation.\n`;
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); 
                } else {
                    replyContent += `I apologize, but I couldn't determine a definitive answer from the LLM.`;
                }

                if (replyContent.length > 2000) {
                    replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
                }

                try {
                    const sentMessage = await message.channel.send({ content: replyContent, components: [row] });
                    console.log(`Trivia Solver: Answered '${question}' with '${mostLikelyAnswerLetter}' (Confidence: ${confidencePercentage}%) in #${message.channel.name}`);

                    const triviaExplanationRef = doc(collection(db, `TriviaExplanations`), message.id); 
                    await setDoc(triviaExplanationRef, {
                        question: question,
                        options: options,
                        mostLikelyAnswer: mostLikelyAnswerLetter,
                        confidence: confidencePercentage,
                        explanations: explanations, 
                        timestamp: new Date().toISOString(),
                        channelId: message.channel.id,
                        guildId: message.guild.id,
                        botReplyMessageId: sentMessage.id
                    });
                    console.log(`Trivia Solver: Stored explanations for original message ID ${message.id} in Firestore.`);

                } catch (error) {
                    console.error(`Trivia Solver: Failed to post reply or store explanations in #${message.channel.name}:`, error);
                }
            }
        }
    },
};
