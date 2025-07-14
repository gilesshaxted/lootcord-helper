module.exports = {
    name: 'messageCreate', // This event listener will also listen for messageCreate events
    once: false, // This event should run every time a relevant message is created
    // The execute function receives the message object, plus db, client, and isFirestoreReady from index.js
    async execute(message, db, client, isFirestoreReady) { // db and isFirestoreReady are passed but not used by this specific listener
        // --- DEBUGGING: Confirm listener is triggered ---
        console.log(`[Test Listener] Message received from ${message.author.tag} in #${message.channel.name}`);

        const TARGET_BOT_ID = '493316754689359874'; // User ID of the other bot to listen to
        const REPOST_CHANNEL_ID = '1329235188907114506'; // The channel where messages will be reposted

        // Ignore messages from bots other than the target bot, or from this bot itself
        if (message.author.bot && message.author.id !== TARGET_BOT_ID) {
            console.log(`[Test Listener] Ignoring message: Not from target bot or is self.`);
            return;
        }
        if (message.author.id === client.user.id) {
            console.log(`[Test Listener] Ignoring message: From self.`);
            return;
        }

        // Only process messages in guilds
        if (!message.guild) {
            console.log(`[Test Listener] Ignoring message: Not in a guild.`);
            return;
        }

        // Ensure the message is from the target bot (redundant check, but good for clarity in debugging)
        if (message.author.id !== TARGET_BOT_ID) {
            console.log(`[Test Listener] Ignoring message: Author ID ${message.author.id} does not match TARGET_BOT_ID.`);
            return;
        }

        // Get the channel to repost to
        const repostChannel = client.channels.cache.get(REPOST_CHANNEL_ID);

        if (!repostChannel) {
            console.warn(`[Test Listener] Repost channel with ID ${REPOST_CHANNEL_ID} not found.`);
            return;
        }

        let repostContent = `--- Raw Message from <@${TARGET_BOT_ID}> in <#${message.channel.id}> ---\n\n`;

        // Stringify the entire message object for raw output
        // Truncate to stay within Discord's 2000 character limit per message
        const rawMessageJson = JSON.stringify(message, (key, value) => {
            // Avoid circular references and excessively large objects
            if (key === 'client' || key === 'guild' || key === 'channel' || key === 'author' || key === 'member' || key === 'reactions' || key === 'attachments' || key === 'components') {
                return undefined; // Exclude large or circular properties
            }
            return value;
        }, 2); // Use 2 spaces for indentation

        // Truncate if necessary to fit in Discord message
        const MAX_JSON_LENGTH = 1800; // Leave room for other text
        const truncatedJson = rawMessageJson.length > MAX_JSON_LENGTH
            ? rawMessageJson.substring(0, MAX_JSON_LENGTH) + '...\n(Truncated)'
            : rawMessageJson;

        repostContent += `\`\`\`json\n${truncatedJson}\n\`\`\`\n`;
        repostContent += `------------------------------------\n`;

        try {
            await repostChannel.send({ content: repostContent });
            console.log(`[Test Listener] Reposted raw message from ${message.author.tag} in ${message.channel.name} to ${repostChannel.name}`);
        } catch (error) {
            console.error(`[Test Listener] Failed to repost raw message to channel ${repostChannel.name}:`, error);
        }
    },
};
