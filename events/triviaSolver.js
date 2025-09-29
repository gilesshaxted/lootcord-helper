const statsTracker = require('../utils/statsTracker');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { doc, collection, setDoc } = require('firebase/firestore');

const TARGET_BOT_ID = '493316754689359874';
const GEMINI_MODEL = 'gemini-2.5-flash';

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return;
        if (!message.guild) return;

        if (!isFirestoreReady) {
            console.warn('Trivia Solver: Firestore not ready. Skipping processing.');
            return;
        }

        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.title && embed.title.endsWith('?') && embed.description) {
                const question = embed.title;
                const options = embed.description;

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

                // FIX 1: DECLARE VARIABLES IN THE WIDER SCOPE
                let llmResponseParsed = null;
                let mostLikelyAnswerLetter = null;
                let confidencePercentage = 0;
                let explanations = {}; 
                let jsonString = ''; // Initialize to an empty string

                try {
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    
                    const payload = {
                        contents: chatHistory,
                        tools: [{ googleSearch: {} }], 
                        generationConfig: {}
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
                        
                        const rawJsonText = result.candidates[0].content.parts[0].text;
                        
                        // Use rawJsonText as the default, defined outside the inner logic
                        jsonString = rawJsonText; 
                        
                        const startMarker = "START_JSON";
                        const endMarker = "END_JSON";

                        const startIndex = rawJsonText.indexOf(startMarker);
                        const endIndex = rawJsonText.indexOf(endMarker);

                        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                            // Delimiter found: extract and trim
                            jsonString = rawJsonText.substring(startIndex + startMarker.length, endIndex).trim();
                        } else {
                            // Delimiter not found: try to clean up code blocks and surrounding text
                            console.warn('Trivia Solver: Could not find JSON delimiters. Attempting robust cleanup.');
                            
                            // FIX 2: STRIP COMMON MARKDOWN CODE BLOCKS
                            jsonString = jsonString.replace(/```json\s*/g, '')
                                                   .replace(/```\s*$/g, '')
                                                   .trim();
                        }

                        // This is line 123 where the SyntaxError occurred previously
                        llmResponseParsed = JSON.parse(jsonString); 

                        mostLikelyAnswerLetter = (llmResponseParsed.most_likely_answer || '').toUpperCase();
                        confidencePercentage = llmResponseParsed.confidence_percentage ?? 0;
                        explanations.A = llmResponseParsed.explanation_A || 'No explanation provided.';
                        explanations.B = llmResponseParsed.explanation_B || 'No explanation provided.';
                        explanations.C = llmResponseParsed.explanation_C || 'No explanation provided.';
                        explanations.D = llmResponseParsed.explanation_D || 'No explanation provided.';

                        const validAnswers = ['A', 'B', 'C', 'D'];
                        if (!validAnswers.includes(mostLikelyAnswerLetter)) {
                            console.warn(`Trivia Solver: Invalid answer received from LLM: ${mostLikelyAnswerLetter}`);
                            mostLikelyAnswerLetter = null; 
                        }

                    } else {
                        console.warn('Trivia Solver: LLM response structure unexpected or empty for question:', question);
                    }

                } catch (error) {
                    // This catch block handles the SyntaxError (and other API errors)
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
                    replyContent += `Most Likely: \`${mostLikelyAnswerLetter}\` (Confidence: ${confidencePercentage}%)\n`;
                    replyContent += `Click a button for an explanation.\n`;
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); 
                } else {
                    replyContent += `I apologize, but I couldn't determine a definitive answer from the LLM.`;
                    if (jsonString.length > 0) { // jsonString is now defined outside the try block (Fix 1)
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
