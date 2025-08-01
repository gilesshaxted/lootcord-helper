// This event listener will listen for messageCreate events
// It will extract scrambled words from a specific bot's messages and use an LLM to find the most likely word.

const { collection, getDocs } = require('firebase/firestore'); // Import Firestore functions needed
const statsTracker = require('../utils/statsTracker'); // Import Stats Tracker

// Configuration specific to this listener
const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to

/**
 * Validates if a suggested word is a perfect anagram of the scrambled letters.
 * Checks for exact length and character counts.
 * @param {string} scrambled The original scrambled letters.
 * @param {string} suggested The word suggested by the LLM.
 * @returns {boolean} True if the suggested word is a valid anagram, false otherwise.
 */
function isValidAnagram(scrambled, suggested) {
    if (scrambled.length !== suggested.length) {
        return false;
    }
    const charCountScrambled = {};
    for (const char of scrambled.toLowerCase()) {
        charCountScrambled[char] = (charCountScrambled[char] || 0) + 1;
    }
    const charCountSuggested = {};
    for (const char of suggested.toLowerCase()) {
        charCountSuggested[char] = (charCountSuggested[char] || 0) + 1;
    }

    for (const char in charCountScrambled) {
        if (charCountScrambled[char] !== charCountSuggested[char]) {
            return false;
        }
    }
    // Also check if suggested word has any extra characters not in scrambled
    for (const char in charCountSuggested) {
        if (!charCountScrambled[char]) { // If suggested has a char not in scrambled
            return false;
        }
    }
    return true;
}


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

        // --- Ignore Logic for "You got it correct!" messages regardless of embed color ---
        if (message.content.includes('You got it correct!')) {
            console.log('Unscrambler: Ignoring message with "You got it correct!" content.');
            return; // Ignore this message for unscrambling
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
                    console.log(`MobDetect: Renamed channel ${message.channel.name} to ${newName} in guild ${message.guild.name}`);
                    statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
                } catch (error) {
                    console.error(`MobDetect: Failed to rename channel ${message.channel.name}:`, error);
                    if (error.code === 50013) { // Missing Permissions
                        console.error(`MobDetect: Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);
                    }
                }
                return;
            }
        }

        // --- Logic for Reverting to original name has been removed from MobDetect.js ---
        // This functionality is now handled by the /mob-off command and startup checks.


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
            // Refined prompt to emphasize word types and strict anagram rules
            const prompt = `Unscramble the following jumbled letters to form a single, most likely English word.
The unscrambled word MUST use ALL of the provided letters exactly once, and therefore MUST be the same length as the provided jumbled letters.
Prioritize common English words. If no common English word is found, then consider proper nouns (like a person's name, country, or city), demonyms (e.g., British, French, American), languages, or common slang.

Examples of desired output:
- Jumbled: "tesnea" -> Word: "senate"
- Jumbled: "nairt" -> Word: "train"
- Jumbled: "sraeh" -> Word: "share"
- Jumbled: "tihsrib" -> Word: "british"
- Jumbled: "tworrak" -> Word: "artwork"
- Jumbled: "nadole" -> Word: "london"
- Jumbled: "ailartsu" -> Word: "australia"
- Jumbled: "hcnref" -> Word: "french"
- Jumbled: "yertuk" -> Word: "turkey"
- Jumbled: "anacda" -> Word: "canada"
- Jumbled: "sihnaps" -> Word: "spanish"
- Jumbled: "olleh" -> Word: "hello"
- Jumbled: "namreg" -> Word: "german"
- Jumbled: "aind" -> Word: "india"

Only provide the unscrambled word. Do not include any other text, explanations, or punctuation.

Jumbled letters: ${scrambledLetters}`;
            let llmAnswer = null;

            try {
                // --- Debugging: Log the prompt being sent ---
                console.log(`Unscrambler: Sending prompt to LLM for '${scrambledLetters}':\n\`\`\`\n${prompt}\n\`\`\``);

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
                    
                    // NEW: Validate LLM's answer against anagram rules
                    if (!isValidAnagram(scrambledLetters, llmAnswer)) {
                        console.warn(`Unscrambler: LLM suggested word '${llmAnswer}' for '${scrambledLetters}' is NOT a valid anagram. Ignoring LLM answer.`);
                        llmAnswer = null; // Invalidate if not a perfect anagram
                    }

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
