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
        await interaction.deferReply({ ephemeral: false }); // Reply publicly

        // Permissions Check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await interaction.editReply({
                content: '❌ You need "Manage Channels" permission to use this command.',
                ephemeral: true,
            });
        }

        if (!db) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: false });
        }

        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        const guildId = interaction.guild.id;

        const soloCooldownsRef = collection(db, `SoloCooldowns`);
        const soloStickyMessagesRef = collection(db, `SoloStickyMessages`);

        const userCooldownDocRef = doc(soloCooldownsRef, userId);
        const channelStickyDocRef = doc(soloStickyMessagesRef, channelId);

        try {
            // --- Check Channel Cooldown/Active Solo ---
            const channelStickySnap = await getDoc(channelStickyDocRef);
            if (channelStickySnap.exists()) {
                const stickyData = channelStickySnap.data();
                const now = Date.now();
                if (stickyData.isActive && stickyData.expirationTimestamp > now) {
                    const remainingTime = Math.ceil((stickyData.expirationTimestamp - now) / (60 * 1000)); // In minutes
                    return await interaction.editReply({
                        content: `⚠️ This channel is already marked solo by <@${stickyData.userId}>. It will expire in approximately ${remainingTime} minutes.`,
                        ephemeral: false,
                    });
                }
            }

            // --- Check User Cooldown ---
            const userCooldownSnap = await getDoc(userCooldownDocRef);
            if (userCooldownSnap.exists()) {
                const cooldownData = userCooldownSnap.data();
                const now = Date.now();
                if (cooldownData.lastUsedTimestamp && (cooldownData.lastUsedTimestamp + COOLDOWN_DURATION_MS) > now) {
                    const remainingTime = Math.ceil(((cooldownData.lastUsedTimestamp + COOLDOWN_DURATION_MS) - now) / (60 * 1000)); // In minutes
                    return await interaction.editReply({
                        content: `⏳ You are on cooldown for this command. You can use it again in approximately ${remainingTime} minutes.`,
                        ephemeral: true,
                    });
                }
                // If user has an active solo in another channel, prevent new one
                if (cooldownData.activeChannelId && cooldownData.activeChannelId !== channelId) {
                    const otherChannel = client.channels.cache.get(cooldownData.activeChannelId);
                    const otherChannelName = otherChannel ? `#${otherChannel.name}` : 'another channel';
                    return await interaction.editReply({
                        content: `🚫 You already have an active solo message in ${otherChannelName}. You can only have one active solo at a time.`,
                        ephemeral: true,
                    });
                }
            }

            // --- Get original channel name for MobDetect revert ---
            const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);
            const channelConfigDocRef = doc(guildChannelsRef, channelId);
            const channelConfigSnap = await getDoc(channelConfigDocRef);
            const mobChannelOriginalName = channelConfigSnap.exists() ? channelConfigSnap.data().originalChannelName : interaction.channel.name;


            // --- Create and Send Sticky Message ---
            const embed = new EmbedBuilder()
                .setColor(0xFF0000) // Red color
                .setTitle('THIS MOB IS SOLO')
                .setDescription(`<@${userId}> has chosen to take this mob solo.\nPlease do not attack this mob.`)
                .setFooter({ text: `Thanks the Lemon Team - ${new Date().toLocaleString()}` });

            const stickyMessage = await interaction.channel.send({ embeds: [embed] });
            console.log(`Solo Command: Posted initial sticky message in #${interaction.channel.name} (ID: ${stickyMessage.id})`);

            // --- Store Sticky Message State in Firestore ---
            const expirationTimestamp = Date.now() + STICKY_DURATION_MS;
            await setDoc(channelStickyDocRef, {
                userId: userId,
                stickyMessageId: stickyMessage.id,
                channelId: channelId,
                guildId: guildId,
                expirationTimestamp: expirationTimestamp,
                mobChannelOriginalName: mobChannelOriginalName, // Store original name for revert trigger
                isActive: true,
                lastPostedTimestamp: Date.now()
            }, { merge: true });

            // --- Update User Cooldown ---
            await setDoc(userCooldownDocRef, {
                userId: userId,
                lastUsedTimestamp: Date.now(),
                activeChannelId: channelId, // Mark this channel as active for the user
            }, { merge: true });

            await interaction.editReply({ content: `✅ Solo message activated in <#${channelId}>! It will last for 3 hours or until the mob is killed.`, ephemeral: false });
            statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE); // Increment helps
            console.log(`Solo Command: Command executed successfully by ${interaction.user.tag} in #${interaction.channel.name}.`);

        } catch (error) {
            console.error('Solo Command: Error executing command:', error);
            await interaction.editReply({ content: '❌ An error occurred while trying to activate the solo message. Please check logs.', ephemeral: false });
        }
    },
};
