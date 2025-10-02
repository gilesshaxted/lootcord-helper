const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Import ActionRowBuilder, ButtonBuilder, ButtonStyle
const { doc, collection, setDoc } = require('firebase/firestore'); // Import Firestore functions

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot posting trivia
const GEMINI_MODEL = 'gemini-2.5-flash'; // Using a stable and capable model

// --- NEW FUNCTION: FALLBACK TEXT PARSER ---
function extractFallbackData(text) {
    const data = {
        mostLikelyAnswer: null,
        confidence: 0
    };

    // Regex 1: Find the most_likely_answer field (A, B, C, or D)
    const answerMatch = text.match(/"most_likely_answer":\s*"([A-D])"/i);
    if (answerMatch && answerMatch[1]) {
        data.mostLikelyAnswer = answerMatch[1].toUpperCase();
    }

    // Regex 2: Find the confidence_percentage field (0-100)
    const confidenceMatch = text.match(/"confidence_percentage":\s*(\d+)/);
    if (confidenceMatch && confidenceMatch[1]) {
        data.confidence = parseInt(confidenceMatch[1], 10);
    }

    return data;
}
// ------------------------------------------

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
            // Trigger: if the embed title exists, ends with '?', and there's a description
            if (embed.title && embed.title.endsWith('?') && embed.description) {
                const question = embed.title;
                const options = embed.description; // e.g., "**A**: 17\n**B**: 18\n**C**: 15\n**D**: 16"

                const prompt = `You are an expert trivia solver. You have access to a Google Search tool. **Use the search tool to verify the correct fact before providing your answer**, especially for specific trivia like video game facts, dates, or numbers. Given the following multiple-choice question and options, identify the single best answer.
Provide the letter of the most likely correct option (A, B, C, or D), a confidence score for your chosen answer as a percentage (0-100), and a brief explanation for each option (A, B, C, D) indicating why it is correct or incorrect.

**IMPORTANT: Your final output MUST be only a single, valid JSON object, enclosed within a 'START_JSON' and 'END_JSON' block, with no other text, commentary, or markdown outside of these blocks.**

START_JSON
{
  "most_likely_answer": "A",
  "confidence_percentage": 95,
  "explanation_A": "Explanation for option A",
  "explanation_B": "Explanation for option B",
  "explanation_C": "Explanation for option C",
  "explanation_D": "Explanation for option D"
}
END_JSON

Question: ${question}
Options:
${options}`;

                let llmResponseParsed = null;
                let mostLikelyAnswerLetter = null;
                let confidencePercentage = 0;
                let explanations = {}; 
                let jsonString = ''; 
                let rawJsonText = ''; // New variable to store the original text output for fallback

                try {
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    
                    const payload = {
                        contents: chatHistory,
                        tools: [{ googleSearch: {} }], 
                        generationConfig: {
                            max_output_tokens: 8192
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
                    
                    if (result.candidates && result.candidates.length > 0 &&
                        result.candidates[0].content && result.candidates[0].content.parts &&
                        result.candidates[0].content.parts.length > 0) {
                        
                        rawJsonText = result.candidates[0].content.parts[0].text;
                        jsonString = rawJsonText;
                        
                        const startMarker = "START_JSON";
                        const endMarker = "END_JSON";

                        const startIndex = rawJsonText.indexOf(startMarker);
                        const endIndex = rawJsonText.indexOf(endMarker);

                        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                            jsonString = rawJsonText.substring(startIndex + startMarker.length, endIndex).trim();
                        } else {
                            console.warn('Trivia Solver: Could not find JSON delimiters. Attempting robust cleanup.');
                            jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                        }
                        
                        // ATTEMPT TO REPAIR TRUNCATED JSON BEFORE PARSING
                        if (!jsonString.endsWith('}')) {
                            // This attempts to fix partial JSON caused by token limits
                            jsonString = jsonString.trim().replace(/,$/, '').concat('}');
                            console.warn('Trivia Solver: Attempted to repair truncated JSON by adding "}".');
                        }
                        
                        llmResponseParsed = JSON.parse(jsonString); // PRIMARY PARSE ATTEMPT

                        mostLikelyAnswerLetter = (llmResponseParsed.most_likely_answer || '').toUpperCase();
                        confidencePercentage = llmResponseParsed.confidence_percentage ?? 0;
                        explanations.A = llmResponseParsed.explanation_A || 'No explanation provided (JSON parse successful).';
                        explanations.B = llmResponseParsed.explanation_B || 'No explanation provided (JSON parse successful).';
                        explanations.C = llmResponseParsed.explanation_C || 'No explanation provided (JSON parse successful).';
                        explanations.D = llmResponseParsed.explanation_D || 'No explanation provided (JSON parse successful).';

                        const validAnswers = ['A', 'B', 'C', 'D'];
                        if (!validAnswers.includes(mostLikelyAnswerLetter)) {
                            console.warn(`Trivia Solver: Invalid answer received from LLM: ${mostLikelyAnswerLetter}`);
                            mostLikelyAnswerLetter = null; 
                        }

                    } else {
                        console.warn('Trivia Solver: LLM response structure unexpected or empty for question:', question);
                    }

                } catch (error) {
                    // CATCH BLOCK: RUN FALLBACK EXTRACTION ON FAILURE
                    console.error('Trivia Solver: Error calling LLM API or parsing JSON for question:', question, error);
                    
                    // Only run fallback if we have raw text to work with (i.e., API call succeeded but parsing failed)
                    if (rawJsonText.length > 0) {
                        console.warn('Trivia Solver: Running fallback text extraction to salvage answer.');
                        const fallbackData = extractFallbackData(rawJsonText);
                        
                        mostLikelyAnswerLetter = fallbackData.mostLikelyAnswer;
                        confidencePercentage = fallbackData.confidence;
                        
                        // Clear explanations since we couldn't parse the full JSON
                        explanations = {
                            A: 'Explanation unavailable (JSON parse error).',
                            B: 'Explanation unavailable (JSON parse error).',
                            C: 'Explanation unavailable (JSON parse error).',
                            D: 'Explanation unavailable (JSON parse error).'
                        };
                    }
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
                    // ADDED NOTE if the answer was salvaged via regex
                    const confidenceNote = llmResponseParsed ? '' : ' (Salvaged via Text Parsing)';
                    
                    replyContent += `Most Likely: \`${mostLikelyAnswerLetter}\` (Confidence: ${confidencePercentage}%) ${confidenceNote}\n`;
                    replyContent += `Click a button for an explanation.\n`;
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); 
                } else {
                    replyContent += `I apologize, but I couldn't determine a definitive answer from the LLM.`;
                    if (jsonString.length > 0) { 
                         replyContent += `\nRaw LLM Text (Pre-Parse): \n\`\`\`\n${jsonString.substring(0, 500)}...\n\`\`\``;
                    }
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
