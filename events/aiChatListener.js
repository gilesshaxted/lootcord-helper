const { Client, GatewayIntentBits } = require('discord.js');

// --- Configuration ---
const TARGET_CHANNEL_ID = '1311341302570549401'; // The channel where the bot should chat
const RESPONSE_CHANCE = 0.25; // 25% chance of responding to a message

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        // 1. Ignore messages from bots and messages outside the target channel
        if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) {
            return;
        }

        // 2. Apply the probability filter
        if (Math.random() > RESPONSE_CHANCE) {
            return;
        }

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
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

            const payload = {
                contents: chatHistory,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                config: {
                    temperature: 0.9, // Higher temperature for more creative responses
                    maxOutputTokens: 100 // Keep responses short
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const aiResponse = candidate.content.parts[0].text.trim();
                
                // 5. Send the AI-generated reply
                await message.channel.send({ content: aiResponse });
                console.log(`AI Chat Listener: Responded to user ${message.author.tag} in #${message.channel.name}.`);
            }
        } catch (error) {
            console.error('AI Chat Listener: Error calling LLM or sending message:', error);
        }
    },
};
