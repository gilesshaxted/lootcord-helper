const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    // Defines the slash command's name, description, and options.
    data: new SlashCommandBuilder()
        .setName('message-read')
        .setDescription('Reads and breaks down the details of a Discord message from its link.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the Discord message (e.g., https://discord.com/channels/...).')
                .setRequired(true)
        ),

    // The execute function now accepts the 'client' object as an argument.
    async execute(interaction, db, client) { // db is passed but not used by this specific command
        // Changed to non-ephemeral for testing
        await interaction.deferReply({ ephemeral: false });

        const messageLink = interaction.options.getString('link');

        // Regex to parse Discord message links:
        // Now handles both discord.com and discordapp.com domains
        const linkRegex = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = messageLink.match(linkRegex);

        if (!match) {
            // Changed to non-ephemeral for testing
            return await interaction.editReply({ content: 'Invalid Discord message link provided. Please ensure it is a direct link to a message.', ephemeral: false });
        }

        const [, guildId, channelId, messageId] = match;

        try {
            // client is passed as an argument to the execute function
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                // Changed to non-ephemeral for testing
                return await interaction.editReply({ content: 'Could not find the guild specified in the link. Is the bot in that guild?', ephemeral: false });
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                // Changed to non-ephemeral for testing
                return await interaction.editReply({ content: 'Could not find the channel specified in the link. Is the bot in that channel?', ephemeral: false });
            }

            const targetMessage = await channel.messages.fetch(messageId);

            let breakdown = `--- Breakdown of Message ID: \`${targetMessage.id}\` ---\n`;
            breakdown += `**Author:** <@${targetMessage.author.id}> (\`${targetMessage.author.tag}\`)\n`;
            breakdown += `**Channel:** <#${targetMessage.channel.id}> (\`${targetMessage.channel.name}\`)\n`;
            breakdown += `**Guild:** \`${targetMessage.guild.name}\` (\`${targetMessage.guild.id}\`)\n`;
            breakdown += `**Timestamp:** \`${targetMessage.createdAt.toUTCString()}\`\n\n`;

            // 1. Message Content
            if (targetMessage.content) {
                breakdown += `**Content:**\n\`\`\`\n${targetMessage.content}\n\`\`\`\n`;
            } else {
                breakdown += `**Content:** (None)\n`;
            }

            // 2. Embeds
            if (targetMessage.embeds.length > 0) {
                breakdown += `**Embeds (${targetMessage.embeds.length}):**\n`;
                targetMessage.embeds.forEach((embed, index) => {
                    breakdown += `  **Embed ${index + 1}:**\n`;
                    if (embed.title) breakdown += `    **Title:** \`${embed.title}\`\n`;
                    if (embed.description) breakdown += `    **Description:**\n\`\`\`\n${embed.description}\n\`\`\`\n`;
                    if (embed.fields.length > 0) {
                        breakdown += `    **Fields (${embed.fields.length}):**\n`;
                        embed.fields.forEach(field => {
                            breakdown += `      - \`${field.name}\`: \`${field.value}\` (Inline: ${field.inline})\n`;
                        });
                    }
                    if (embed.url) breakdown += `    **URL:** <${embed.url}>\n`;
                    if (embed.color) breakdown += `    **Color:** \`#${embed.color.toString(16)}\`\n`;
                    if (embed.image) breakdown += `    **Image:** ${embed.image.url}\n`;
                    if (embed.thumbnail) breakdown += `    **Thumbnail:** ${embed.thumbnail.url}\n`;
                    if (embed.footer) breakdown += `    **Footer:** \`${embed.footer.text}\`\n`;
                    if (embed.author) breakdown += `    **Author:** \`${embed.author.name}\`\n`;
                });
            } else {
                breakdown += `**Embeds:** (None)\n`;
            }

            // 3. Attachments
            if (targetMessage.attachments.size > 0) {
                breakdown += `**Attachments (${targetMessage.attachments.size}):**\n`;
                targetMessage.attachments.forEach(attachment => {
                    breakdown += `  - Name: \`${attachment.name}\`, URL: <${attachment.url}>\n`;
                });
            } else {
                breakdown += `**Attachments:** (None)\n`;
            }

            // 4. Components (e.g., buttons, select menus)
            if (targetMessage.components.length > 0) {
                breakdown += `**Components (${targetMessage.components.length}):**\n`;
                targetMessage.components.forEach((row, rowIndex) => {
                    breakdown += `  - ActionRow ${rowIndex + 1} (${row.components.length} components):\n`;
                    row.components.forEach(component => {
                        breakdown += `    Type: \`${component.type}\`, Custom ID: \`${component.customId || 'N/A'}\`, Label: \`${component.label || 'N/A'}\`\n`;
                    });
                });
            } else {
                breakdown += `**Components:** (None)\n`;
            }

            // 5. Reactions
            if (targetMessage.reactions.cache.size > 0) {
                breakdown += `**Reactions (${targetMessage.reactions.cache.size}):**\n`;
                targetMessage.reactions.cache.forEach(reaction => {
                    breakdown += `  - ${reaction.emoji.name} (${reaction.count} users)\n`;
                });
            } else {
                breakdown += `**Reactions:** (None)\n`;
            }

            // Discord has a message character limit of 2000.
            // If the breakdown is too long, send it in multiple messages or truncate.
            if (breakdown.length > 2000) {
                breakdown = breakdown.substring(0, 1990) + '...\n(Output truncated due to character limit)';
            }

            // Changed to non-ephemeral for testing
            await interaction.editReply({ content: breakdown, ephemeral: false });

        } catch (error) {
            console.error('Error fetching or breaking down message:', error);
            // Check if the error is due to unknown message/channel/guild
            if (error.code === 10003 || error.code === 10008 || error.code === 50001) { // Unknown Channel, Unknown Message, Missing Access
                // Changed to non-ephemeral for testing
                await interaction.editReply({ content: 'Could not fetch the message. Please ensure the link is correct and the bot has access to the channel and message.', ephemeral: false });
            } else {
                // Changed to non-ephemeral for testing
                await interaction.editReply({ content: 'An unexpected error occurred while trying to read the message. Please check the bot\'s logs.', ephemeral: false });
            }
        }
    },
};
