const { EmbedBuilder } = require('discord.js');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874'; // User ID of the game bot
const DEBUG_CHANNEL_ID = '1307628841799254026'; // Your designated debug channel ID
const STRENGTH_REGEX = /Strength:\s*(\d+\.\d+)x damage/i; // Regex to capture the strength value

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        // Only run in the specified debug channel
        if (message.channel.id !== DEBUG_CHANNEL_ID) {
            return;
        }

        // Only listen to the target game bot's messages that contain embeds
        if (message.author.id !== TARGET_GAME_BOT_ID || message.embeds.length === 0) {
            return;
        }

        console.log("[Strength Listener] Message detected from game bot with embed.");

        // Check the previous message to confirm it was a 't-p' command
        try {
            const messages = await message.channel.messages.fetch({ limit: 2 });
            const previousMessage = messages.last();

            if (previousMessage && !previousMessage.author.bot && previousMessage.content.toLowerCase() === 't-p') {
                console.log("[Strength Listener] Previous message was a 't-p' command.");

                // Search for the embed field that contains the strength value
                const upgradesField = message.embeds[0].fields.find(field => field.name.includes('Upgrades'));
                
                if (upgradesField) {
                    const strengthMatch = upgradesField.value.match(STRENGTH_REGEX);
                    
                    if (strengthMatch && strengthMatch[1]) {
                        const strengthValue = parseFloat(strengthMatch[1]);
                        console.log(`[Strength Listener] Extracted Strength Value: ${strengthValue}`);
                        
                        await message.channel.send(`Your strength skill is **${strengthValue}x**`);
                        return;
                    }
                }
                
                console.log("[Strength Listener] Could not find the strength value in the embed.");
                await message.channel.send("Could not find your strength skill value in the profile embed.");

            } else {
                console.log("[Strength Listener] Previous message was not a 't-p' command. Ignoring.");
            }
        } catch (error) {
            console.error("[Strength Listener] Error fetching previous message or processing embed:", error);
            await message.channel.send("An error occurred while trying to process the profile message.");
        }
    },
};
