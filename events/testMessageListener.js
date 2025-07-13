module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, and isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady) { // db and isFirestoreReady are passed but not used by this specific listener
        // Configuration specific to this test listener
        const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to
        const REPOST_CHANNEL_ID = '1329235188907114506'; // The channel where messages will be reposted

        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) return;
        if (message.author.id === client.user.id) return; // Ignore messages from this bot itself

        // Only process messages in guilds
        if (!message.guild) return;

        // Ensure the message is from the target bot
        if (message.author.id !== TARGET_BOT_ID) return;

        // Get the channel to repost to
        const repostChannel = client.channels.cache.get(REPOST_CHANNEL_ID);

        if (!repostChannel) {
            console.warn(`Test listener: Repost channel with ID ${REPOST_CHANNEL_ID} not found.`);
            return;
        }

        let repostContent = `--- Message from <@${TARGET_BOT_ID}> in <#${message.channel.id}> ---\n\n`;

        // Break down message content
        if (message.content) {
            repostContent += `**Content:**\n\`\`\`\n${message.content}\n\`\`\`\n`;
        } else {
            repostContent += `**Content:** (None)\n`;
        }

        // Break down embed details if present
        if (message.embeds.length > 0) {
            const embed = message.embeds[0]; // Assuming we're interested in the first embed

            repostContent += `**Embed Details:**\n`;
            if (embed.title) {
                repostContent += `  **Title:** \`${embed.title}\`\n`;
            }
            if (embed.description) {
                repostContent += `  **Description:**\n\`\`\`\n${embed.description}\n\`\`\`\n`;
            }
            // You can add more embed fields here if needed (e.g., embed.fields, embed.footer, embed.image)
        } else {
            repostContent += `**Embeds:** (None)\n`;
        }

        repostContent += `------------------------------------\n`;

        try {
            await repostChannel.send({ content: repostContent });
            console.log(`Test listener: Reposted message from ${message.author.tag} in ${message.channel.name} to ${repostChannel.name}`);
        } catch (error) {
            console.error(`Test listener: Failed to repost message to channel ${repostChannel.name}:`, error);
        }
    },
};
