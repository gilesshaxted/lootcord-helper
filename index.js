const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const { WEAPON_DATA } = require('../utils/damageData');

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const BLEEDING_SELECT_ID = 'damage_calc_bleeding_select';
const STRENGTH_BUTTON_ID = 'damage_calc_strength_button';
const STRENGTH_INPUT_ID = 'damage_calc_strength_input';
const MODAL_SUBMIT_ID = 'damage_calc_modal_submit';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('damage-calc')
        .setDescription('Calculates potential damage for a chosen weapon and ammo.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        await interaction.deferReply({ flags: 0 });

        const userId = interaction.user.id;
        const userSkillsRef = doc(db, `artifacts/${APP_ID_FOR_FIRESTORE}/users/${userId}/skills`, 'main');
        const docSnap = await getDoc(userSkillsRef);

        if (!docSnap.exists() || !docSnap.data().strength) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('Strength Skill Not Set')
                .setDescription("Your damage Strength Skill has not been set. Please use `t-p` and try this command again.");
            return await interaction.editReply({ embeds: [embed], components: [], flags: 0 });
        }

        const strengthSkill = docSnap.data().strength;

        const weaponOptions = Object.keys(WEAPON_DATA).map(weaponName => ({
            label: weaponName,
            value: weaponName,
        }));

        const weaponSelect = new StringSelectMenuBuilder()
            .setCustomId(`${WEAPON_SELECT_ID}:${strengthSkill}`)
            .setPlaceholder('Select a weapon...')
            .addOptions(weaponOptions);

        const row = new ActionRowBuilder().addComponents(weaponSelect);

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Damage Calculator')
            .setDescription(`Your Strength Skill is currently - **${strengthSkill}x**\n\nPlease select a weapon.`);

        await interaction.editReply({
            embeds: [embed],
            components: [row],
            flags: 0,
        });
    },

    async handleInteraction(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        const extractState = (customId, prefix) => {
            const parts = customId.split(':');
            if (!customId.startsWith(prefix) || parts.length < 4) {
                return { weapon: null, ammo: null, bleeding: null };
            }
            return {
                weapon: parts[1],
                ammo: parts[2],
                bleeding: parts[3]
            };
        };

        if (interaction.customId.startsWith(WEAPON_SELECT_ID)) {
            await interaction.deferUpdate();
            const selectedWeapon = interaction.values[0];
            const strengthSkill = parseFloat(interaction.customId.split(':')[1]);
            const ammoTypes = WEAPON_DATA[selectedWeapon];

            if (!ammoTypes || Object.keys(ammoTypes).length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Damage Calculator Error')
                    .setDescription(`No ammo data found for **${selectedWeapon}**. Please select another weapon.`);
                return await interaction.editReply({ embeds: [embed], components: [], flags: 0 });
            }

            const ammoOptions = Object.keys(ammoTypes).map(ammoName => ({
                label: ammoName,
                value: ammoName,
            }));

            const ammoSelect = new StringSelectMenuBuilder()
                .setCustomId(`${AMMO_SELECT_ID}:${strengthSkill}:${selectedWeapon}:false`)
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
        } else if (interaction.customId.startsWith(AMMO_SELECT_ID)) {
            await interaction.deferUpdate();
            const selectedAmmo = interaction.values[0];
            const [ , strengthSkill, selectedWeapon] = interaction.customId.split(':');

            const bleedingOptions = [
                { label: 'ON ✅ (1.5x)', value: 'true' },
                { label: 'OFF ❌ (1.0x)', value: 'false' },
            ];

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
        } else if (interaction.customId.startsWith(BLEEDING_SELECT_ID)) {
            await interaction.deferUpdate();
            const selectedBleedingBuff = interaction.values[0];
            const [ , strengthSkill, selectedWeapon, selectedAmmo] = interaction.customId.split(':');

            const skillButton = new ButtonBuilder()
                .setCustomId(`${STRENGTH_BUTTON_ID}:${strengthSkill}:${selectedWeapon}:${selectedAmmo}:${selectedBleedingBuff}`)
                .setLabel('Enter Skill')
                .setStyle(ButtonStyle.Primary);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Damage Calculator')
                .setDescription(
                    `Your Strength Skill is currently - **${strengthSkill}x**\n` +
                    `Weapon: **${selectedWeapon}**\n` +
                    `Ammo: **${selectedAmmo}**\n` +
                    `Bleeding Buff: **${selectedBleedingBuff === 'true' ? 'ON ✅' : 'OFF ❌'}**\n\n` +
                    `Click the button to enter your Strength Skill.`
                );

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(skillButton)],
                flags: 0,
            });
        } else if (interaction.customId.startsWith(STRENGTH_BUTTON_ID)) {
            const [ , strengthSkill, selectedWeapon, selectedAmmo, selectedBleedingBuff] = interaction.customId.split(':');

            const modal = new ModalBuilder()
                .setCustomId(`${MODAL_SUBMIT_ID}:${strengthSkill}:${selectedWeapon}:${selectedAmmo}:${selectedBleedingBuff}`)
                .setTitle('Enter Strength Skill');

            const strengthInput = new TextInputBuilder()
                .setCustomId(STRENGTH_INPUT_ID)
                .setLabel("Your Strength Skill (e.g., 10, 50, 100)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Enter a number between 1 and 1000');

            const firstActionRow = new ActionRowBuilder().addComponents(strengthInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);

        } else if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT_ID)) {
            await interaction.deferReply({ flags: 0 });
            const strengthSkill = parseFloat(interaction.fields.getTextInputValue(STRENGTH_INPUT_ID));
            const [ , skillFromButton, selectedWeapon, selectedAmmo, selectedBleedingBuff] = interaction.customId.split(':');

            if (isNaN(strengthSkill) || strengthSkill <= 0) {
                return await interaction.editReply({ content: 'Please enter a valid positive number for Strength Skill.', flags: 0 });
            }

            const damageRangeStr = WEAPON_DATA[selectedWeapon]?.[selectedAmmo];
            
            if (!damageRangeStr) {
                return await interaction.editReply({ content: 'Could not find damage data for the selected weapon/ammo combination. Please restart with `/damage-calc`.', flags: 0 });
            }

            const [minDamageStr, maxDamageStr] = damageRangeStr.split(' - ').map(s => s.replace(' (x2)', '').replace(' (x3)', ''));
            let minDamage = parseInt(minDamageStr, 10);
            let maxDamage = parseInt(maxDamageStr, 10);

            if (isNaN(minDamage) || isNaN(maxDamage)) {
                return await interaction.editReply({ content: 'Error parsing damage range. Please try again with `/damage-calc`.', flags: 0 });
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
                .setFooter({ text: 'Damage values are rounded to the nearest whole number.' });

            await interaction.editReply({ embeds: [resultEmbed], components: [], flags: 0 });
        }
    }
};
