const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { doc, collection, setDoc, getDoc, updateDoc } = require('firebase/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel-add')
        .setDescription('Designates the current channel for Mob/Sticky Message monitoring.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        // NOTE: interaction is already deferred globally in index.js. 
        // REMOVED: await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const channel = interaction.channel;
        const channelId = channel.id;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            // Use followUp because the initial interaction was globally deferred in index.js
            return await interaction.followUp({ content: '❌ You need the "Manage Channels" permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        if (channel.type !== ChannelType.GuildText) {
            return await interaction.editReply({ content: '❌ This command must be used in a text channel.', flags: MessageFlags.Ephemeral });
        }

        // --- Firestore References ---
        const guildDocRef = doc(collection(db, `Guilds`), guild.id);
        // NEW: Reference to the specific channel document within the 'channels' subcollection
        const channelDocRef = doc(collection(guildDocRef, 'channels'), channelId);

        // 1. Check if channel already exists in the configured list (from the centralized array)
        const guildSnap = await getDoc(guildDocRef);
        const configuredChannels = guildSnap.exists() ? (guildSnap.data().configuredChannels || []) : [];

        // Check if the channel is already configured
        const isAlreadyConfigured = configuredChannels.some(c => c.channelId === channelId);
        
        if (isAlreadyConfigured) {
            // Even if it's already in the array, we proceed to ensure the subcollection document exists/is updated
            // We just don't add it to the array again.
            console.log(`[Channel-Add Debug] Channel ${channel.name} already in array. Skipping array push.`);
        } else {
             // 2. Add the new channel to the centralized array
            const newChannelEntry = {
                channelId: channelId,
                channelName: channel.name,
                originalChannelName: channel.name, // Store current name as original name
                setType: 'command_add',
                setByUserId: interaction.user.id,
                setByUsername: interaction.user.tag,
                timestamp: new Date().toISOString()
            };
            configuredChannels.push(newChannelEntry);
        }

        // 3. Perform ATOMIC WRITE 1: Update the Guild document with the centralized array
        try {
            await setDoc(guildDocRef, {
                guildId: guild.id,
                guildName: guild.name,
                lastUpdated: new Date().toISOString(),
                configuredChannels: configuredChannels // Overwrite the whole array
            }, { merge: true });
        } catch (error) {
            console.error(`[Channel-Add] Error updating centralized array for ${channel.name}:`, error);
            return await interaction.editReply({ content: '❌ An error occurred while updating the main configuration. Please check logs.', flags: MessageFlags.Ephemeral });
        }
        
        // 4. Perform ATOMIC WRITE 2: Create/Update the channel document in the subcollection
        // This is crucial for MobDetect/Mob-Off/StartupChecks to function.
        try {
            await setDoc(channelDocRef, {
                channelId: channelId,
                channelName: channel.name,
                originalChannelName: channel.name,
                status: 'configured',
                setByUserId: interaction.user.id,
                lastUpdated: new Date().toISOString()
            }, { merge: true });
        } catch (error) {
            console.error(`[Channel-Add] Error updating subcollection document for ${channel.name}:`, error);
            return await interaction.editReply({ content: '❌ An error occurred while creating the channel record. Please check logs.', flags: MessageFlags.Ephemeral });
        }


        // 5. Final Reply
        const replyMessage = isAlreadyConfigured 
            ? `ℹ️ Channel **#${channel.name}** was already configured. Configuration record updated.`
            : `✅ Channel **#${channel.name}** has been added for mob/sticky message monitoring.`;

        return await interaction.editReply({ content: replyMessage, flags: MessageFlags.Ephemeral });
    },
};
