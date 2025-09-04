const { doc, collection, getDoc, setDoc } = require('firebase/firestore');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { WEAPON_DATA } = require('../utils/damageData');

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const BLEEDING_SELECT_ID = 'damage_calc_bleeding_select';

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (!isFirestoreReady) {
            console.error('Firestore is not yet ready to process interactions. Skipping interaction.');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'The bot is still starting up. Please try again in a moment.', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            try {
                await command.execute(interaction, db, client, APP_ID_FOR_FIRESTORE);
            } catch (error) {
                console.error(`Error executing command ${interaction.commandName}:`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'There was an error while executing this command!',
                        flags: MessageFlags.Ephemeral
                    });
                } else if (interaction.deferred) {
                    await interaction.followUp({
                        content: 'There was an error while executing this command!',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        }
        
        // Handle button interactions
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('toggle_')) {
                console.log(`[Notify Button - Debug] Button click received by ${interaction.user.tag} for customId: ${interaction.customId}`);
                try {
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
                        return;
                    }
        
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
        
                    const attackButton = new ButtonBuilder().setCustomId('toggle_attack_notifications').setLabel('Attack').setStyle(currentPrefs.attackCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
                    const farmButton = new ButtonBuilder().setCustomId('toggle_farm_notifications').setLabel('Farm').setStyle(currentPrefs.farmCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
                    const medButton = new ButtonBuilder().setCustomId('toggle_med_notifications').setLabel('Meds').setStyle(currentPrefs.medCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
                    const voteButton = new ButtonBuilder().setCustomId('toggle_vote_notifications').setLabel('Vote').setStyle(currentPrefs.voteCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
                    const repairButton = new ButtonBuilder().setCustomId('toggle_repair_notifications').setLabel('Repair').setStyle(currentPrefs.repairCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
                    const gamblingButton = new ButtonBuilder().setCustomId('toggle_gambling_notifications').setLabel('Gambling').setStyle(currentPrefs.gamblingCooldown ? ButtonStyle.Success : ButtonStyle.Danger);
        
                    const row1 = new ActionRowBuilder().addComponents(attackButton, farmButton, medButton, voteButton, repairButton);
                    const row2 = new ActionRowBuilder().addComponents(gamblingButton);
                        
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
        
                    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        
                } catch (error) {
                    if (error.code === 10062) {
                        console.error(`[Notify Button] Failed to defer update due to unknown interaction. This may be a double-click or stale interaction.`);
                    } else {
                        console.error(`[Notify Button] An unexpected error occurred in handleNotifyButton:`, error);
                        try {
                            await interaction.followUp({ content: '❌ An error occurred while updating your notification settings. Please try again later.', ephemeral: true });
                        } catch (followUpError) {
                            console.error(`[Notify Button] Failed to send a follow-up reply.`, followUpError);
                        }
                    }
                }
            }
        }
        
        // Handle select menus
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            if (customId.startsWith(WEAPON_SELECT_ID)) {
                await interaction.deferUpdate();
                const selectedWeapon = interaction.values[0];
                const strengthSkill = parseFloat(customId.split(':')[1]);
                const ammoTypes = WEAPON_DATA[selectedWeapon];

                if (!ammoTypes || Object.keys(ammoTypes).length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Damage Calculator Error')
                        .setDescription(`No ammo data found for **${selectedWeapon}**. Please select another weapon.`);
                    return await interaction.editReply({
                        embeds: [embed],
                        components: [],
                        flags: 0
                    });
                }

                const ammoOptions = Object.keys(ammoTypes).map(ammoName => ({
                    label: ammoName,
                    value: ammoName,
                }));

                const ammoSelect = new StringSelectMenuBuilder()
                    .setCustomId(`${AMMO_SELECT_ID}:${strengthSkill}:${selectedWeapon}`)
                    .setPlaceholder('Select ammo type...')
                    .addOptions(ammoOptions);

                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('Damage Calculator')
                    .setDescription(`Your Strength Skill is currently - **${strengthSkill}x**\nWeapon: **${selectedWeapon}**\n\nPlease select your ammo type.`);

                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(ammoSelect)],
                    flags: 0,
                });
            } else if (customId.startsWith(AMMO_SELECT_ID)) {
                await interaction.deferUpdate();
                const selectedAmmo = interaction.values[0];
                const [, strengthSkill, selectedWeapon] = customId.split(':');

                const bleedingOptions = [{
                    label: 'ON ✅ (1.5x)',
                    value: 'true'
                }, {
                    label: 'OFF ❌ (1.0x)',
                    value: 'false'
                }, ];

                const bleedingSelect = new StringSelectMenuBuilder()
                    .setCustomId(`${BLEEDING_SELECT_ID}:${strengthSkill}:${selectedWeapon}:${selectedAmmo}`)
                    .setPlaceholder('Bleeding Buff...')
                    .addOptions(bleedingOptions);

                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('Damage Calculator')
                    .setDescription(
                        `Your Strength Skill is currently - **${strengthSkill}x**\n` +
                        `Weapon: **${selectedWeapon}**\n` +
                        `Ammo: **${selectedAmmo}**\n\n` +
                        `Please select bleeding buff status.`
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(bleedingSelect)],
                    flags: 0,
                });
            } else if (customId.startsWith(BLEEDING_SELECT_ID)) {
                await interaction.deferUpdate();
                const selectedBleedingBuff = interaction.values[0];
                const [, strengthSkill, selectedWeapon, selectedAmmo] = customId.split(':');

                const damageRangeStr = WEAPON_DATA[selectedWeapon]?.[selectedAmmo];

                if (!damageRangeStr) {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Damage Calculator Error')
                        .setDescription('Could not find damage data for the selected weapon/ammo combination. Please restart with `/damage-calc`.');
                    return await interaction.editReply({
                        embeds: [embed],
                        components: [],
                        flags: 0
                    });
                }

                const [minDamageStr, maxDamageStr] = damageRangeStr.split(' - ').map(s => s.replace(' (x2)', '').replace(' (x3)', ''));
                let minDamage = parseInt(minDamageStr, 10);
                let maxDamage = parseInt(maxDamageStr, 10);

                if (isNaN(minDamage) || isNaN(maxDamage)) {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Damage Calculator Error')
                        .setDescription('Error parsing damage range. Please try again with `/damage-calc`.');
                    return await interaction.editReply({
                        embeds: [embed],
                        components: [],
                        flags: 0
                    });
                }

                const buffMultiplier = selectedBleedingBuff === 'true' ? 1.5 : 1;

                const finalMinDamage = Math.round(minDamage * strengthSkill * buffMultiplier);
                const finalMaxDamage = Math.round(maxDamage * strengthSkill * buffMultiplier);

                const resultEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('Damage Calculation Result')
                    .setDescription(
                        `**Strength Skill:** ${strengthSkill}x\n` +
                        `**Weapon:** ${selectedWeapon}\n` +
                        `**Ammo:** ${selectedAmmo}\n` +
                        `**Bleeding Buff:** ${selectedBleedingBuff === 'true' ? 'ON ✅ (x1.5)' : 'OFF ❌ (x1.0)'}\n\n` +
                        `**Calculated Damage Range:** \`${finalMinDamage} - ${finalMaxDamage}\``
                    )
                    .setFooter({
                        text: 'Damage values are rounded to the nearest whole number.'
                    });

                await interaction.editReply({
                    embeds: [resultEmbed],
                    components: [],
                    flags: 0
                });
            }
        }
    }
};
