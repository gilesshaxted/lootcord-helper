const { collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore'); // Firestore functions
const { MessageFlags } = require('discord.js'); // For ephemeral replies if needed
const statsTracker = require('./statsTracker'); // For incrementing helps

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot
const WORD_LENGTH = 5; // Standard Wordle word length

// Emoji to color/letter mapping
const EMOJI_MAP = {
    // Green emojis
    ':green_a:': { color: 'green', letter: 'a' }, ':green_b:': { color: 'green', letter: 'b' }, ':green_c:': { color: 'green', letter: 'c' },
    ':green_d:': { color: 'green', letter: 'd' }, ':green_e:': { color: 'green', letter: 'e' }, ':green_f:': { color: 'green', letter: 'f' },
    ':green_g:': { color: 'green', letter: 'g' }, ':green_h:': { color: 'green', letter: 'h' }, ':green_i:': { color: 'green', letter: 'i' },
    ':green_j:': { color: 'green', letter: 'j' }, ':green_k:': { color: 'green', letter: 'k' }, ':green_l:': { color: 'green', letter: 'l' },
    ':green_m:': { color: 'green', letter: 'm' }, ':green_n:': { color: 'green', letter: 'n' }, ':green_o:': { color: 'green', letter: 'o' },
    ':green_p:': { color: 'green', letter: 'p' }, ':green_q:': { color: 'green', letter: 'q' }, ':green_r:': { color: 'green', letter: 'r' },
    ':green_s:': { color: 'green', letter: 's' }, ':green_t:': { color: 'green', letter: 't' }, ':green_u:': { color: 'green', letter: 'u' },
    ':green_v:': { color: 'green', letter: 'v' }, ':green_w:': { color: 'green', letter: 'w' }, ':green_x:': { color: 'green', letter: 'x' },
    ':green_y:': { color: 'green', letter: 'y' }, ':green_z:': { color: 'green', letter: 'z' },

    // Yellow emojis
    ':yellow_a:': { color: 'yellow', letter: 'a' }, ':yellow_b:': { color: 'yellow', letter: 'b' }, ':yellow_c:': { color: 'yellow', letter: 'c' },
    ':yellow_d:': { color: 'yellow', letter: 'd' }, ':yellow_e:': { color: 'yellow', letter: 'e' }, ':yellow_f:': { color: 'yellow', letter: 'f' },
    ':yellow_g:': { color: 'yellow', letter: 'g' }, ':yellow_h:': { color: 'yellow', letter: 'h' }, ':yellow_i:': { color: 'yellow', letter: 'i' },
    ':yellow_j:': { color: 'yellow', letter: 'j' }, ':yellow_k:': { color: 'yellow', letter: 'k' }, ':yellow_l:': { color: 'yellow', letter: 'l' },
    ':yellow_m:': { color: 'yellow', letter: 'm' }, ':yellow_n:': { color: 'yellow', letter: 'n' }, ':yellow_o:': { color: 'yellow', letter: 'o' },
    ':yellow_p:': { color: 'yellow', letter: 'p' }, ':yellow_q:': { color: 'yellow', letter: 'q' }, ':yellow_r:': { color: 'yellow', letter: 'r' },
    ':yellow_s:': { color: 'yellow', letter: 's' }, ':yellow_t:': { color: 'yellow', letter: 't' }, ':yellow_u:': { color: 'yellow', letter: 'u' },
    ':yellow_v:': { color: 'yellow', letter: 'v' }, ':yellow_w:': { color: 'yellow', letter: 'w' }, ':yellow_x:': { color: 'yellow', letter: 'x' },
    ':yellow_y:': { color: 'yellow', letter: 'y' }, ':yellow_z:': { color: 'yellow', letter: 'z' },

    // Gray emojis
    ':gray_a:': { color: 'gray', letter: 'a' }, ':gray_b:': { color: 'gray', letter: 'b' }, ':gray_c:': { color: 'gray', letter: 'c' },
    ':gray_d:': { color: 'gray', letter: 'd' }, ':gray_e:': { color: 'gray', letter: 'e' }, ':gray_f:': { color: 'gray', letter: 'f' },
    ':gray_g:': { color: 'gray', letter: 'g' }, ':gray_h:': { color: 'gray', letter: 'h' }, ':gray_i:': { color: 'gray', letter: 'i' },
    ':gray_j:': { color: 'gray', letter: 'j' }, ':gray_k:': { color: 'gray', letter: 'k' }, ':gray_l:': { color: 'gray', letter: 'l' },
    ':gray_m:': { color: 'gray', letter: 'm' }, ':gray_n:': { color: 'gray', letter: 'n' }, ':gray_o:': { color: 'gray', letter: 'o' },
    ':gray_p:': { color: 'gray', letter: 'p' }, ':gray_q:': { color: 'gray', letter: 'q' }, ':gray_r:': { color: 'gray', letter: 'r' },
    ':gray_s:': { color: 'gray', letter: 's' }, ':gray_t:': { color: 'gray', letter: 't' }, ':gray_u:': { color: 'gray', letter: 'u' },
    ':gray_v:': { color: 'gray', letter: 'v' }, ':gray_w:': { color: 'gray', letter: 'w' }, ':gray_x:': { color: 'gray', letter: 'x' },
    ':gray_y:': { color: 'gray', letter: 'y' }, ':gray_z:': { color: 'gray', letter: 'z' },

    // Placeholder gray square
    ':medium_gray_square:': { color: 'placeholder', letter: '' }
};

// Updated regex to find all Discord custom emoji formats
const EMOJI_REGEX = /<:([a-z_]+):(\d+)>/g;

/**
 * Parses a single row of emoji results into structured letter feedback.
 * @param {string} emojiRowString E.g., "<:gray_a:ID><:green_r:ID>..."
 * @returns {Array<{letter: string, color: string, position: number}>} Array
