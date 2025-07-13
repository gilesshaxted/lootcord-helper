const https = require('https'); // Node.js HTTPS module for API calls

// --- API Configuration ---
// IMPORTANT: Get your RapidAPI key from an environment variable for security!
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // This must be set on Render
const RAPIDAPI_HOST = 'unscramble1.p.rapidapi.com';

// Basic validation for API key
if (!RAPIDAPI_KEY) {
    console.error('API Helpers: RAPIDAPI_KEY environment variable not set. API calls will not work.');
}

/**
 * Calls the Unscramble API to find possible words for a given scrambled word.
 * @param {string} scrambledWord The jumbled letters to unscramble.
 * @returns {Promise<string[]>} A promise that resolves to an array of possible words (lowercase).
 */
async function callUnscrambleApi(scrambledWord) {
    if (!RAPIDAPI_KEY) {
        console.error('API Helpers: API key is missing. Cannot call Unscramble API.');
        return [];
    }

    const options = {
        method: 'GET',
        hostname: RAPIDAPI_HOST,
        port: null,
        path: `/unscramble?word=${encodeURIComponent(scrambledWord)}`,
        headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            const chunks = [];

            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const body = Buffer.concat(chunks);
                const rawResponse = body.toString();

                // Diagnostic log: See the raw API response in your bot's console
                console.log(`Unscramble API raw response for '${scrambledWord}':`, rawResponse);

                try {
                    const responseData = JSON.parse(rawResponse);
                    // Assuming the API returns an array of words directly, or an object with a 'words' key
                    if (Array.isArray(responseData)) {
                        resolve(responseData.map(word => word.toLowerCase()));
                    } else if (responseData && Array.isArray(responseData.words)) {
                        resolve(responseData.words.map(word => word.toLowerCase()));
                    } else {
                        console.warn('API Helpers: Unexpected API response format:', responseData);
                        resolve([]);
                    }
                } catch (parseError) {
                    console.error('API Helpers: Error parsing API response:', parseError);
                    resolve([]); // Resolve with empty array on parse error
                }
            });
        });

        req.on('error', (e) => {
            console.error('API Helpers: API request error:', e);
            reject(e); // Reject the promise on request error
        });

        req.end();
    });
}

module.exports = {
    callUnscrambleApi
};
