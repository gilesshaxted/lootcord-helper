const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { doc, collection, getDoc, setDoc } = require('firebase/firestore');

// Main execute function for the /notify slash command
module.exports = {
    data: new SlashCommandBuilder()
        .setName('notify')
        .setDescription('Manage your personal notification preferences for Lootcord Helper.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ ephemeral: true });

        if (!db) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', ephemeral: true });
        }

        const userId = interaction.user.id;
        const prefsRefs = {
            attackCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'attackCooldown'),
            farmCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'farmCooldown'),
            medCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'medCooldown'),
            voteCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'voteCooldown'),
            repairCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'repairCooldown'),
            gamblingCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'gamblingCooldown'),
        };

        try {
            const currentPrefs = {};
            for (const type in prefsRefs) {
                const snap = await getDoc(prefsRefs[type]);
                currentPrefs[type] = snap.exists() ? snap.data().enabled : false;
            }

            const { embed, components } = await createNotificationMessage(currentPrefs);
            
            await interaction.editReply({ embeds: [embed], components: components, ephemeral: true });
        } catch (error) {
            console.error('[Notify Command] An unexpected error occurred during execution:', error);
            await interaction.editReply({ content: '❌ An unexpected error occurred while fetching your notification settings. Please check logs.', ephemeral: true });
        }
    },
};
// Add this function to your notify.js file after the `execute` function.
async function handleInteraction(interaction, db) {
    if (!interaction.isButton()) {
        return; // Only process button interactions
    }

    await interaction.deferUpdate();

    const userId = interaction.user.id;
    const customId = interaction.customId;

    let notificationType;
    if (customId === 'toggle_attack_notifications') {
        notificationType = 'attackCooldown';
    } else if (customId === 'toggle_farm_notifications') {
        notificationType = 'farmCooldown';
    } else if (customId === 'toggle_med_notifications') {
        notificationType = 'medCooldown';
    } else if (customId === 'toggle_vote_notifications') {
        notificationType = 'voteCooldown';
    } else if (customId === 'toggle_repair_notifications') {
        notificationType = 'repairCooldown';
    } else if (customId === 'toggle_gambling_notifications') {
        notificationType = 'gamblingCooldown';
    } else {
        return; // Not a notification button, do nothing
    }

    try {
        const docRef = doc(collection(db, `UserNotifications/${userId}/preferences`), notificationType);
        const docSnap = await getDoc(docRef);

        const isCurrentlyEnabled = docSnap.exists() ? docSnap.data().enabled : false;
        const newStatus = !isCurrentlyEnabled;

        await setDoc(docRef, { enabled: newStatus });

        const currentPrefs = {};
        const prefsRefs = {
            attackCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'attackCooldown'),
            farmCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'farmCooldown'),
            medCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'medCooldown'),
            voteCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'voteCooldown'),
            repairCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'repairCooldown'),
            gamblingCooldown: doc(collection(db, `UserNotifications/${userId}/preferences`), 'gamblingCooldown'),
        };

        for (const type in prefsRefs) {
            const snap = await getDoc(prefsRefs[type]);
            currentPrefs[type] = snap.exists() ? snap.data().enabled : false;
        }

        const { embed, components } = await createNotificationMessage(currentPrefs);
        await interaction.editReply({ embeds: [embed], components: components });

    } catch (error) {
        console.error(`[Notify Button] Error handling button click for ${customId}:`, error);
        await interaction.editReply({ content: '❌ An error occurred while updating your notification settings. Please try again later.' });
    }
}
// This function creates the embed and buttons for the notify message
async function createNotificationMessage(currentPrefs) {
    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Lootcord Helper Notifications')
        .setDescription(
            `Here you can manage your personal notification settings for Lootcord Helper.\n\n` +
            `**Attack Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.attackCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **weapon cooldowns** are over.\n\n` +
            `**Farm Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.farmCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **farming cooldowns** are over.\n\n` +
            `**Med Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.medCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **medical item cooldowns** are over.\n\n` +
            `**Vote Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.voteCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **voting cooldown** is over.\n\n` +
            `**Repair Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.repairCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **clan repair cooldown** is over.\n\n` +
            `**Gambling Cooldown Notifications:**\n` +
            `Status: **${currentPrefs.gamblingCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
            `You'll be pinged when your **gambling cooldowns** are over.`
        )
        .setFooter({ text: 'Use the buttons to toggle your notifications.' });

    const attackButton = new ButtonBuilder().setCustomId('toggle_attack_notifications').setLabel('Attack').setStyle(currentPrefs.attackCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
    const farmButton = new ButtonBuilder().setCustomId('toggle_farm_notifications').setLabel('Farm').setStyle(currentPrefs.farmCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
    const medButton = new ButtonBuilder().setCustomId('toggle_med_notifications').setLabel('Meds').setStyle(currentPrefs.medCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
    const voteButton = new ButtonBuilder().setCustomId('toggle_vote_notifications').setLabel('Vote').setStyle(currentPrefs.voteCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
    const repairButton = new ButtonBuilder().setCustomId('toggle_repair_notifications').setLabel('Repair').setStyle(currentPrefs.repairCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
    const gamblingButton = new ButtonBuilder().setCustomId('toggle_gambling_notifications').setLabel('Gambling').setStyle(currentPrefs.gamblingCooldown ? ButtonStyle.Success : ButtonStyle.Danger);

    const row1 = new ActionRowBuilder().addComponents(attackButton, farmButton, medButton, voteButton, repairButton);
    const row2 = new ActionRowBuilder().addComponents(gamblingButton);

    return { embed, components: [row1, row2] };
}
