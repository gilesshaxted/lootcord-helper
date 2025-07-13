// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and find anagrams using a local dictionary file.

// Removed the import for findAnagramsFromDictionary as LLM is now used
// const { findAnagramsFromDictionary } = require('../utils/dictionary');
const { collection, getDocs } = require('firebase/firestore'); // Import Firestore functions needed
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

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

        // --- NEW: Ignore Logic for "You got it correct!" messages with specific embed color ---
        if (message.content.includes('You got it correct!') && message.embeds.length > 0) {
            const embed = message.embeds[0];
            // Discord embed colors are stored as integers. #89ff58 is 8912472 in decimal.
            if (embed.color === 8912472) {
                console.log('Unscrambler: Ignoring "You got it correct!" message with correct embed color.');
                return; // Ignore this message for unscrambling
            } else {
                // --- DIAGNOSTIC LOG: Log if content matches but color doesn't ---
                console.log(`Unscrambler: "You got it correct!" message detected, but embed color (${embed.color}) does not match expected (8912472).`);
            }
        }

        // Crucial: Check if Firestore is ready before attempting any DB operations
        if (!isFirestoreReady) {
            console.warn('Firestore not ready for messageCreate event. Skipping processing.');
            return;
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        // Fetch stored channels for this guild from Firestore
        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
        const channelDocs = await getDocs(guildChannelsRef);
        const storedChannels = {};
        channelDocs.forEach(d => {
            storedChannels[d.id] = d.data();
        });

        // Check if the current channel is one of the stored channels
        if (!storedChannels[channelId]) {
            return; // Not a configured channel, ignore
        }

        const currentChannelData = storedChannels[channelId];
        const originalChannelName = currentChannelData.originalChannelName;

        // --- Channel Renaming Logic (triggered by embed title alone for any message from target bot) ---
        // This block will execute for any message from the target bot with an embed.
        if (message.embeds.length > 0) {
            const embedTitle = message.embeds[0].title;
            let newName = null;

            if (embedTitle) { // Ensure embedTitle exists
                if (embedTitle.includes('Heavy Scientist')) {
                    newName = '🐻╏heavy';
                } else if (embedTitle.includes('Scientist')) { // Check Scientist after Heavy Scientist
                    newName = '🥼╏scientist';
                } else if (embedTitle.includes('Tunnel Dweller')) {
                    newName = '🧟╏dweller';
                } else if (embedTitle.includes('Patrol Helicopter')) {
                    newName = '🚁╏heli';
                } else if (embedTitle.includes('Bradley APC')) {
                    newName = '🚨╏brad';
                }
            }

            if (newName && message.channel.name !== newName) {
                try {
                    await message.channel.setName(newName, 'Automated rename due to enemy embed title.');
                    console.log(`Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                } catch (error) {
                    console.error(`Failed to rename channel ${message.channel.name}:`, error);
                }
                // Important: If a rename occurs, we don't want to immediately check for revert conditions
                // in the same message. The revert will happen on a subsequent message.
                return;
            }
        }

        // --- Logic for Reverting to original name (updated conditions) ---
        // This block will only execute if the channel was NOT renamed in the current message.
        if (message.embeds.length > 0 || message.content) { // Check if there's content or embeds
            const embed = message.embeds.length > 0 ? message.embeds[0] : null;

            // Condition 1: Embed title includes 'left...'
            const embedTitleRevert = embed && embed.title && embed.title.includes('left...');
            
            // Condition 2: Embed description includes 'killed a mob'
            const embedDescriptionRevert = embed && embed.description && embed.description.includes('killed a mob');

            // Condition 3: Message content contains ":deth: The **[Enemy Name] DIED!**"
            const contentDiedRevert = message.content.includes(':deth: The **') && message.content.includes('DIED!**');

            const revertCondition = embedTitleRevert || embedDescriptionRevert || contentDiedRevert;

            if (revertCondition) {
                if (originalChannelName && message.channel.name !== originalChannelName) {
                    try {
                        await message.channel.setName(originalChannelName, 'Automated revert to original name.');
                        console.log(`Reverted channel ${message.channel.name} to ${originalChannelName} in guild ${message.guild.name}`);
                    } catch (error) {
                        console.error(`Failed to revert channel ${message.channel.name} to original name:`, error);
                    }
                }
            }
        }

        // --- Unscrambler Logic (now using LLM) ---
        let scrambledLetters = null;
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            const embedDescription = embed.description;
            const embedFields = embed.fields; // Also need to check fields for "Reward"

            // Updated regex: Matches "Word:", then optional whitespace, then "```fix\n",
            // then captures the letters, and then looks for "```"
            const wordMatch = embedDescription ? embedDescription.match(/Word:\s*```fix\n([a-zA-Z]+)```/s) : null;
            
            // Check for "Reward" field as a validation
            const hasRewardField = embedFields.some(field => field.name && field.name.includes('Reward'));

            if (wordMatch && wordMatch[1] && hasRewardField) {
                scrambledLetters = wordMatch[1].toLowerCase();
            }
        }

        if (scrambledLetters) {
            const prompt = `Unscramble the following letters to form a single, most likely English word. Only provide the unscrambled word, no other text or punctuation: ${scrambledLetters}`;
            let llmAnswer = null;

            try {
                // Call the LLM (Gemini API)
                const chatHistory = [];
                chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                const payload = { contents: chatHistory };
                const apiKey = process.env.GOOGLE_API_KEY; // Get API key from environment variable

                if (!apiKey) {
                    console.error('Unscrambler: GOOGLE_API_KEY environment variable not set. Cannot unscramble.');
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
                    llmAnswer = result.candidates[0].content.parts[0].text.trim().toLowerCase();
                } else {
                    console.warn('Unscrambler: LLM response structure unexpected or empty for scrambled letters:', scrambledLetters);
                }

            } catch (error) {
                console.error('Unscrambler: Error calling LLM API for scrambled letters:', scrambledLetters, error);
            }

            let replyContent = `**Unscrambled word for \`${scrambledLetters}\`:**\n`;

            if (llmAnswer) {
                replyContent += `Most likely word (from LLM): \`${llmAnswer}\``;
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps for unscramble
            } else {
                replyContent += `Could not determine the most likely word using LLM.`;
            }

            if (replyContent.length > 2000) {
                replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
            }

            try {
                await message.channel.send({ content: replyContent });
                console.log(`Unscrambler: Posted LLM-based word for '${scrambledLetters}' in #${message.channel.name}`);
            } catch (error) {
                console.error(`Unscrambler: Failed to post LLM-based word in #${message.channel.name}:`, error);
            }
        }
    },
};
