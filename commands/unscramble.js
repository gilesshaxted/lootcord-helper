const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- Word Dictionary Loading ---
// Define the path to your dictionary file.
// This command will read 'words.txt' from the 'utils/' directory.
const DICTIONARY_FILE_PATH = path.join(__dirname, '../utils/words.txt'); // Path to words.txt in utils folder
let WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Dictionary to store words grouped by their sorted letters

// Helper function to sort a string alphabetically
function sortLetters(str) {
    return str.toLowerCase().split('').sort().join('');
}

// Function to load and preprocess the dictionary from the file
function loadAndPreprocessDictionary() {
    try {
        const data = fs.readFileSync(DICTIONARY_FILE_PATH, 'utf8');
        const rawWords = data.split('\n')
                             .map(word => word.trim().toLowerCase())
                             .filter(word => word.length > 0);

        // Preprocess the dictionary: group words by their sorted letters
        rawWords.forEach(word => {
            const sorted = sortLetters(word);
            if (!WORD_DICTIONARY_SORTED_BY_LETTERS[sorted]) {
                WORD_DICTIONARY_SORTED_BY_LETTERS[sorted] = [];
            }
            WORD_DICTIONARY_SORTED_BY_LETTERS[sorted].push(word);
        });

        console.log(`Unscramble Command: Loaded and preprocessed ${rawWords.length} words from ${DICTIONARY_FILE_PATH}`);
    } catch (error) {
        console.error(`Unscramble Command: Failed to load dictionary from ${DICTIONARY_FILE_PATH}:`, error);
        console.error('Please ensure words.txt exists in the utils/ directory and is readable.');
        WORD_DICTIONARY_SORTED_BY_LETTERS = {}; // Ensure dictionary is empty if loading fails
    }
}

// Load the dictionary when the script is first required (i.e., when bot starts)
loadAndPreprocessDictionary();

// Function to find all anagrams of a given scrambled word using the preprocessed dictionary
function findAnagramsFromDictionary(scrambledWord) {
    const sortedScrambled = sortLetters(scrambledWord);
    // Return a copy of the array, or an empty array if no matches
    return WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled] ? [...WORD_DICTIONARY_SORTED_BY_LETTERS[sortedScrambled]] : [];
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('unscramble')
        .setDescription('Unscrambles letters from a linked message and posts possible words.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message containing the scrambled word (e.g., in an embed description).')
                .setRequired(true)
        ),

    async execute(interaction, db, client) { // db is passed but not used by this specific command
        await interaction.deferReply({ ephemeral: false }); // Changed to non-ephemeral for testing

        const messageLink = interaction.options.getString('link');

        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        let scrambledLetters = null;
        let debugOutput = ''; // Initialize debug output

        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return await interaction.editReply({ content: 'Could not find the guild specified in the link. Is the bot in that guild?', ephemeral: false });
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                return await interaction.editReply({ content: 'Could not find the channel specified in the link. Is the bot in that channel?', ephemeral: false });
            }

            const targetMessage = await channel.messages.fetch(messageId);

            // Look for the scrambled letters in the first embed's description
            // And confirm the presence of a "Reward" field
            if (targetMessage.embeds.length > 0) {
                const embed = targetMessage.embeds[0];
                const embedDescription = embed.description;
                const embedFields = embed.fields;

                // Check for "Word:" in description and then capture letters AFTER "fix"
                // This regex now looks for "Word:", optional whitespace, "fix", optional whitespace,
                // then captures the letters, and then looks for "Reward".
                const wordMatch = embedDescription ? embedDescription.match(/Word:\s*fix\s*(.*?)(?:\n|$)/s) : null;
                
                // Check for "Reward" field
                const hasRewardField = embedFields.some(field => field.name && field.name.includes('Reward'));

                if (wordMatch && wordMatch[1] && hasRewardField) {
                    // Extract only alphabetic characters from the captured segment (which should now be just the scrambled letters)
                    scrambledLetters = wordMatch[1].replace(/[^a-zA-Z]/g, '').toLowerCase();
                }
            }

            if (!scrambledLetters) {
                return await interaction.editReply({ content: 'Could not find the scrambled word in the linked message\'s embed description (expected format: "Word: fix [letters]" and a "Reward" field).', ephemeral: false });
            }

        } catch (error) {
            console.error('Error fetching or parsing message for unscramble command:', error);
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) { // Unknown Channel, Unknown Message, Missing Access
                return await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message for unscrambling. Please check the bot\'s logs.', ephemeral: false });
            }
        }

        // --- Debug Output ---
        debugOutput += `**Extracted Letters:** \`${scrambledLetters || 'N/A'}\`\n\n`;

        // --- Find possible words using the local dictionary ---
        const possibleWords = findAnagramsFromDictionary(scrambledLetters);

        let replyContent = `${debugOutput}**Unscrambled word for \`${scrambledLetters}\`:**\n`;

        if (possibleWords.length > 0) {
            // Sorting is now handled inside findAnagramsFromDictionary
            replyContent += `Possible words (from local dictionary, using all letters): \n${possibleWords.map(word => `\`${word}\``).join(', ')}`;
        } else {
            replyContent += `No words found in the local dictionary using all letters.`;
        }

        if (replyContent.length > 2000) {
            replyContent = replyContent.substring(0, 1990) + '...\n(Output truncated due to character limit)';
        }

        await interaction.editReply({ content: replyContent, ephemeral: false });
    },
};
