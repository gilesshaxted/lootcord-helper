const { Client, GatewayIntentBits } = require('discord.js');
const { LOOTCORD_GAME_KNOWLEDGE } = require('../utils/gameKnowledge'); // 1. Import the knowledge file

// --- Configuration ---
const TARGET_CHANNEL_ID = '1311341302570549401'; // The channel where the bot should chat
const RESPONSE_CHANCE = 0.10; // Base chance of responding

// Role ID for users who should ONLY receive direct responses (no random chat)
const EXCLUDED_ROLE_ID = '1192414247276265512'; 

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        // 1. Initial Checks and Channel Filter
        if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) {
            return;
        }

        const client = message.client; // Get client for bot ID check
        const botId = client.user.id;
        const isDirectlyAddressed = message.mentions.has(botId) || 
                                    (message.reference && message.type === 19);

        console.log(`\n--- [AI Chat Debug] Message received in target channel from ${message.author.tag} ---`);
        console.log(`[AI Chat Debug] Directly Addressed: ${isDirectlyAddressed}`);
        console.log(`[AI Chat Debug] Message content: "${message.content.substring(0, 50)}..."`);

        // 2. Role Check: Determine if the author has the excluded role (requires message.member)
        let hasExcludedRole = false;
        if (message.member && message.member.roles.cache.has(EXCLUDED_ROLE_ID)) {
            hasExcludedRole = true;
            console.log(`[AI Chat Debug] User has excluded role (${EXCLUDED_ROLE_ID}).`);
        }
        
        // 3. Determine Response Trigger
        let shouldRespond = false;
        
        if (isDirectlyAddressed) {
            // Always respond if directly addressed (mention/reply), regardless of role
            shouldRespond = true;
            console.log(`[AI Chat Debug] Forced response due to mention/reply.`);
        } else if (hasExcludedRole) {
            // If not directly addressed AND user has excluded role, DO NOT respond.
            console.log(`[AI Chat Debug] Skipping random response: User has excluded role.`);
            return;
        } else {
            // Random chance for everyone else (who wasn't directly addressed)
            const roll = Math.random();
            if (roll <= RESPONSE_CHANCE) {
                shouldRespond = true;
                console.log(`[AI Chat Debug] Roll successful (${roll.toFixed(4)} vs ${RESPONSE_CHANCE}). Proceeding to API call.`);
            } else {
                console.log(`[AI Chat Debug] Roll failed (${roll.toFixed(4)} vs ${RESPONSE_CHANCE}). Skipping response.`);
                return;
            }
        }
        
        // If we reach here, shouldRespond must be true.
        
        // 4. Define the LLM's persona and inject knowledge
        const generalPersona = "You are Loot Helper, a helpful, enthusiastic, and slightly silly Discord bot. You are designed to be concise, friendly, and you always respond in 1-2 sentences.";
        
        // The new system prompt directs the AI to use the knowledge base.
        const systemPrompt = `${generalPersona} You have been provided with a game database below. When asked a question about the game, reference this database. If the question is about something else, respond socially but concisely.

${LOOTCORD_GAME_KNOWLEDGE}

Your response must be short and focused.`;

        const userQuery = message.content;
        
        // The model will read the full prompt and answer based on the facts provided.
        const chatHistory = [{ role: "user", parts: [{ text: userQuery }] }];

        try {
            // 5. Call the LLM (Gemini API)
            const apiKey = process.env.GOOGLE_API_KEY; 
            if (!apiKey) {
                console.error('AI Chat Listener: GOOGLE_API_KEY not set. Cannot generate response.');
                await message.channel.send(`*Self-diagnostics: AI key is missing. Cannot chat.*`);
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            console.log(`[AI Chat Debug] Preparing API call for user message length: ${userQuery.length}`);

            const payload = {
                contents: chatHistory,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { 
                    temperature: 0.9,
                    maxOutputTokens: 1024 
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // 6. Process API Response
            if (!response.ok) {
                   console.error(`[AI Chat Debug] API HTTP Error: ${response.status} ${response.statusText}`);
                   const errorBody = await response.json().catch(() => ({}));
                   console.error('[AI Chat Debug] Raw Error Body (API Failed):', JSON.stringify(errorBody, null, 2));
                   return;
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const aiResponse = candidate.content.parts[0].text.trim();
                
                // 7. Send the AI-generated reply
                await message.channel.send({ content: aiResponse });
                console.log(`[AI Chat Debug] Response sent: "${aiResponse.substring(0, 50)}..."`);
            } else {
                   console.error('[AI Chat Debug] API Failure: No text found in candidate response (may be filtered or empty).');
                   console.error('[AI Chat Debug] Raw Result (LLM Filtered):', JSON.stringify(result, null, 2));
            }
        } catch (error) {
            console.error('AI Chat Listener: Critical Error calling LLM or sending message:', error);
        }
    },
};
