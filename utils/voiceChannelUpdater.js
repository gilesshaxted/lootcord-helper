// This event listener will update a voice channel's name based on a role count.

// Configuration specific to this listener
const TARGET_VOICE_CHANNEL_ID = '1197626836029546546'; // The voice channel to update
const TARGET_ROLE_ID = '1192414247221727320'; // The role to count members from
const VOICE_CHANNEL_BASE_NAME = '🍋『Lemons』: '; // Base name for the voice channel

/**
 * Counts members with the target role and updates the voice channel name.
 * This function is shared by both event listeners and startup check.
 * @param {Client} client The Discord client instance.
 */
async function updateVoiceChannelName(client) {
    const channel = client.channels.cache.get(TARGET_VOICE_CHANNEL_ID);
    if (!channel || channel.type !== 2) { // ChannelType.GuildVoice is 2
        console.warn(`Voice Channel Updater: Target voice channel (${TARGET_VOICE_CHANNEL_ID}) not found or is not a voice channel.`);
        return;
    }

    const guild = channel.guild;
    if (!guild) {
        console.warn(`Voice Channel Updater: Guild for channel ${TARGET_VOICE_CHANNEL_ID} not found.`);
        return;
    }

    try {
        // Fetch all members to ensure cache is up-to-date for role checking
        await guild.members.fetch(); 
        const role = guild.roles.cache.get(TARGET_ROLE_ID);

        if (!role) {
            console.warn(`Voice Channel Updater: Target role (${TARGET_ROLE_ID}) not found in guild ${guild.name}.`);
            return;
        }

        const membersWithRole = guild.members.cache.filter(member => member.roles.cache.has(TARGET_ROLE_ID));
        const count = membersWithRole.size;
        const newChannelName = `${VOICE_CHANNEL_BASE_NAME}${count}`;

        if (channel.name !== newChannelName) {
            try {
                await channel.setName(newChannelName, `Updated member count for role ${role.name}`);
                console.log(`Voice Channel Updater: Renamed voice channel ${channel.name} to ${newChannelName} in ${guild.name}.`);
            } catch (error) {
                console.error(`Voice Channel Updater: Failed to rename voice channel ${channel.name}:`, error);
                if (error.code === 50013) { // Missing Permissions
                    console.error(`Voice Channel Updater: Bot lacks 'Manage Channels' permission for voice channel ${channel.name}.`);
                }
            }
        } else {
            console.log(`Voice Channel Updater: Voice channel ${channel.name} is already correctly named (${newChannelName}).`);
        }
    } catch (error) {
        console.error(`Voice Channel Updater: Error fetching members or roles in guild ${guild.name}:`, error);
    }
}

module.exports = {
    name: 'guildMemberUpdate', // Listen for role changes
    once: false,
    async execute(oldMember, newMember, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        // Check if roles have actually changed
        if (oldMember.roles.cache.size !== newMember.roles.cache.size || 
            !oldMember.roles.cache.every(role => newMember.roles.cache.has(role.id))) {
            console.log(`[Voice Channel Updater] Roles changed for ${newMember.user.tag}. Checking channel name.`);
            await updateVoiceChannelName(client);
        }
    },
    // Also listen for members joining/leaving to update count
    // These are not directly exported, but handled by client.on in index.js
    async guildMemberAdd(member, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        console.log(`[Voice Channel Updater] Member ${member.user.tag} joined. Checking channel name.`);
        await updateVoiceChannelName(client);
    },
    async guildMemberRemove(member, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        console.log(`[Voice Channel Updater] Member ${member.user.tag} left. Checking channel name.`);
        await updateVoiceChannelName(client);
    },
    // Export the main update function for startup checks
    updateVoiceChannelNameOnDemand: updateVoiceChannelName
};
