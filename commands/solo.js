const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { doc, collection, getDoc, setDoc, deleteDoc } = require('firebase/firestore');

// Cooldown duration: 3 hours in milliseconds
const COOLDOWN_DURATION_MS = 3 * 60 * 60 * 1000;
// Sticky message duration: 3 hours in milliseconds
const STICKY_DURATION_MS = 3 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('solo')
        .setDescription('Activates a sticky "mob solo" message in the current channel.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        console.log(`[Solo Command - Debug] START: Command /solo received by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name}).`);

        try {
            await interaction.deferReply({ ephemeral: false }); 
            console.log(`[Solo Command - Debug] Interaction deferred.`);

            // --- REMOVED: Permissions Check for ManageChannels ---
            // if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            //     console.warn(`[Solo Command] User ${interaction.user.tag} tried to use /solo without Manage Channels permission.`);
            //     return await interaction.editReply({
            //         content: '❌ You need "Manage Channels" permission to use this command.',
            //         ephemeral: true,
            //     });
            // }
            // console.log(`[Solo Command - Debug] User has required permissions.`); // This log is no longer relevant here


            if (!db) {
                console.error('[Solo Command] Firestore DB not initialized.');
                return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
            }
            console.log(`[Solo Command - Debug] Firestore DB is ready.`);


            const userId = interaction.user.id;
            const channelId = interaction.channel.id;
            const guildId = interaction.guild.id;

            const soloCooldownsRef = collection(db, `SoloCooldowns`);
            const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);

            const userCooldownDocRef = doc(soloCooldownsRef, userId);
            const channelStickyDocRef = doc(soloStickyMessagesRef, channelId);

            // --- NEW: Check if channel is configured for the bot ---
            const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
            const channelConfigDocRef = doc(guildChannelsRef, channelId);
            const channelConfigSnap = await getDoc(channelConfigDocRef);

            if (!channelConfigSnap.exists()) {
                console.warn(`[Solo Command] Channel ${channelId} is not a configured channel. Command usage denied.`);
                return await interaction.editReply({
                    content: '❌ This command can only be used in channels that have been configured for the bot. Please use `/channel-set` first.',
                    ephemeral: true,
                });
            }
            console.log(`[Solo Command - Debug] Channel ${channelId} is a configured channel.`);


            // --- Debugging Cooldown/Active Solo Checks ---
            console.log(`[Solo Command - Debug] Checking solo status for channel ${channelId} and user ${userId}.`);

            // --- Check Channel Cooldown/Active Solo ---
            const channelStickySnap = await getDoc(channelStickyDocRef);
            if (channelStickySnap.exists()) {
                const stickyData = channelStickySnap.data();
                const now = Date.now();
                console.log(`[Solo Command - Debug] Existing sticky data for channel ${channelId}:`, stickyData);

                if (stickyData.isActive && stickyData.expirationTimestamp > now) {
                    const remainingTime = Math.ceil((stickyData.expirationTimestamp - now) / (60 * 1000)); // In minutes
                    console.warn(`[Solo Command] Channel ${channelId} already has an active solo. Remaining: ${remainingTime} minutes.`);
                    return await interaction.editReply({
                        content: `⚠️ This channel is already marked solo by <@${stickyData.userId}>. It will expire in approximately ${remainingTime} minutes.`,
                        ephemeral: false,
                    });
                }
            }
            console.log(`[Solo Command - Debug] Channel is available for solo.`);


            // --- Check User Cooldown ---
            const userCooldownSnap = await getDoc(userCooldownDocRef);
            if (userCooldownSnap.exists()) {
                const cooldownData = userCooldownSnap.data();
                const now = Date.now();
                console.log(`[Solo Command - Debug] Existing cooldown data for user ${userId}:`, cooldownData);

                if (cooldownData.lastUsedTimestamp && (cooldownData.lastUsedTimestamp + COOLDOWN_DURATION_MS) > now) {
                    const remainingTime = Math.ceil(((cooldownData.lastUsedTimestamp + COOLDOWN_DURATION_MS) - now) / (60 * 1000)); // In minutes
                    console.warn(`[Solo Command] User ${userId} is on cooldown. Remaining: ${remainingTime} minutes.`);
                    return await interaction.editReply({
                        content: `⏳ You are on cooldown for this command. You can use it again in approximately ${remainingTime} minutes.`,
                        ephemeral: true,
                    });
                }
                // If user has an active solo in another channel, prevent new one
                if (cooldownData.activeChannelId && cooldownData.activeChannelId !== channelId) {
                    const otherChannel = client.channels.cache.get(cooldownData.activeChannelId);
                    const otherChannelName = otherChannel ? `#${otherChannel.name}` : 'another channel';
                    console.warn(`[Solo Command] User ${userId} has active solo in another channel: ${otherChannelName}.`);
                    return await interaction.editReply({
                        content: `🚫 You already have an active solo message in ${otherChannelName}. You can only have one active solo at a time.`,
                        ephemeral: true,
                    });
                }
            }
            console.log(`[Solo Command - Debug] User is not on cooldown or has no active solo in another channel.`);


            // --- Get original channel name for MobDetect revert ---
            // This is fetched from the channelConfigSnap now, which we already have.
            const mobChannelOriginalName = channelConfigSnap.data().originalChannelName;
            console.log(`[Solo Command - Debug] Original channel name for mob revert: \`${mobChannelOriginalName}\``);


            // --- Create and Send Sticky Message ---
            const embed = new EmbedBuilder()
                .setColor(0xFF0000) // Red color
                .setTitle('THIS MOB IS SOLO')
                .setDescription(`<@${userId}> has chosen to take this mob solo.\nPlease do not attack this mob.`)
                .setFooter({ text: `Thanks the Lemon Team - ${new Date().toLocaleString()}` });

            const stickyMessage = await interaction.channel.send({ embeds: [embed] });
            console.log(`[Solo Command - Debug] Posted initial sticky message in #${interaction.channel.name} (ID: ${stickyMessage.id})`);

            // --- Store Sticky Message State in Firestore ---
            const expirationTimestamp = Date.now() + STICKY_DURATION_MS;
            await setDoc(channelStickyDocRef, {
                userId: userId,
                stickyMessageId: stickyMessage.id, // Store the ID of the bot's message
                channelId: channelId,
                guildId: guildId,
                expirationTimestamp: expirationTimestamp,
                mobChannelOriginalName: mobChannelOriginalName, // Store original name for revert trigger
                isActive: true,
                lastPostedTimestamp: Date.now()
            }, { merge: true });
            console.log(`[Solo Command - Debug] Stored sticky message state in Firestore for channel ${channelId}.`);

            // --- Update User Cooldown ---
            await setDoc(userCooldownDocRef, {
                userId: userId,
                lastUsedTimestamp: Date.now(),
                activeChannelId: channelId, // Mark this channel as active for the user
            }, { merge: true });
            console.log(`[Solo Command - Debug] Updated user cooldown for ${userId}.`);

            await interaction.editReply({ content: `✅ Solo message activated in <#${channelId}>! It will last for 3 hours or until the mob is killed.`, ephemeral: false });
            // statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Uncomment if you want to track solo command usage as a help
            console.log(`Solo Command: Command executed successfully by ${interaction.user.tag} in #${interaction.channel.name}.`);

        } catch (error) {
            console.error('Solo Command: An unexpected error occurred during execution:', error);
            // Ensure a reply is always sent, even for unexpected errors
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An unexpected error occurred while trying to activate the solo message. Please check logs.', ephemeral: false });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ An unexpected error occurred while trying to activate the solo message. Please check logs.', ephemeral: false });
            }
        }
        console.log(`[Solo Command - Debug] END: Command /solo execution for ${interaction.user.tag}.`);
    },
};
