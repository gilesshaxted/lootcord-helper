const { Client, GatewayIntentBits } = require('discord.js');

// --- Configuration ---
const TARGET_CHANNEL_ID = '1311341302570549401'; // The channel where the bot should chat
const RESPONSE_CHANCE = 1.00; // Currently set to 1.00 for guaranteed response during testing

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        // 1. Initial Checks and Channel Filter
        if (message.author.bot) {
            // console.log(`[AI Chat Debug] Ignoring message: From a bot (${message.author.tag}).`);
            return;
        }
        if (message.channel.id !== TARGET_CHANNEL_ID) {
            // console.log(`[AI Chat Debug] Ignoring message: Not in target channel (${message.channel.id}).`);
            return;
        }

        console.log(`\n--- [AI Chat Debug] Message received in target channel from ${message.author.tag} ---`);
        console.log(`[AI Chat Debug] Message content: "${message.content.substring(0, 50)}..."`);


        // 2. Apply the probability filter
        const roll = Math.random();
        if (roll > RESPONSE_CHANCE) {
            console.log(`[AI Chat Debug] Roll failed (${roll.toFixed(4)} vs ${RESPONSE_CHANCE}). Skipping response.`);
            return;
        }
        
        console.log(`[AI Chat Debug] Roll successful (${roll.toFixed(4)}). Proceeding to API call.`);


        // 3. Define the LLM's persona and goal
        const systemPrompt = "You are Loot Helper, a helpful, enthusiastic, and slightly silly Discord bot whose primary function is to help users in a Rust/survival-themed game called Lootcord. You are designed to be concise, friendly, and you always respond in 1-2 sentences. Keep your responses relevant to the user's message and the context of a game helper.";
        const userQuery = message.content;
        
        // Use the user's message as chat history for the AI
        const chatHistory = [{ role: "user", parts: [{ text: userQuery }] }];

        try {
            // 4. Call the LLM (Gemini API)
            const apiKey = process.env.GOOGLE_API_KEY; 
            if (!apiKey) {
                console.error('AI Chat Listener: GOOGLE_API_KEY not set. Cannot generate response.');
                await message.channel.send(`*Self-diagnostics: AI key is missing. Cannot chat.*`); // Send bot-side error
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            console.log(`[AI Chat Debug] Preparing API call for user message length: ${userQuery.length}`);

            const payload = {
                contents: chatHistory,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { 
                    temperature: 0.9,
                    // FIX: Increased maxOutputTokens to give the AI space to finish its concise response
                    maxOutputTokens: 256 
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // 5. Process API Response
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
                
                // 6. Send the AI-generated reply
                await message.channel.send({ content: aiResponse });
                console.log(`[AI Chat Debug] Response sent: "${aiResponse.substring(0, 50)}..."`);
            } else {
                 // Log if response is empty or filtered
                 console.error('[AI Chat Debug] API Failure: No text found in candidate response (may be filtered or empty).');
                 console.error('[AI Chat Debug] Raw Result (LLM Filtered):', JSON.stringify(result, null, 2));
            }
        } catch (error) {
            console.error('AI Chat Listener: Critical Error calling LLM or sending message:', error);
        }
    },
};
