const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { WEAPON_DATA } = require('../utils/damageData'); // Import the weapon data

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const BLEEDING_BUFF_TOGGLE_ID = 'damage_calc_bleeding_toggle';
const STRENGTH_INPUT_ID = 'damage_calc_strength_input'; // Used in modal
const MODAL_SUBMIT_ID = 'damage_calc_modal_submit';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('damage-calc')
        .setDescription('Calculates potential damage for a chosen weapon and ammo.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: 0 }); // Visible reply

        const weaponOptions = Object.keys(WEAPON_DATA).map(weaponName => ({
            label: weaponName,
            value: weaponName,
        }));

        const weaponSelect = new StringSelectMenuBuilder()
            .setCustomId(WEAPON_SELECT_ID)
            .setPlaceholder('Select a weapon...')
            .addOptions(weaponOptions);

        const row = new ActionRowBuilder().addComponents(weaponSelect);

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Damage Calculator')
            .setDescription('Please select a weapon to begin your damage calculation.');

        await interaction.editReply({
            embeds: [embed],
            components: [row],
            flags: 0,
        });
    },

    async handleInteraction(interaction) {
        // Helper function to safely extract state from a customId
        // Format: PREFIX:weapon:ammo:bleeding
        const extractState = (customId, prefix) => {
            const parts = customId.split(':');
            if (!customId.startsWith(prefix) || parts.length < 4) {
                return { weapon: null, ammo: null, bleeding: false };
            }
            return {
                weapon: parts[1],
                ammo: parts[2],
                bleeding: parts[3] === 'true'
            };
        };

        if (interaction.customId === WEAPON_SELECT_ID) {
            await interaction.deferUpdate();

            const selectedWeapon = interaction.values[0];
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
                .setCustomId(`${AMMO_SELECT_ID}:${selectedWeapon}:NO_AMMO_SELECTED:false`) // Encode weapon, placeholder ammo, default bleeding
                .setPlaceholder('Select ammo type...')
                .addOptions(ammoOptions);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Damage Calculator')
                .setDescription(`Weapon: **${selectedWeapon}**\n\nPlease select your ammo type.`);

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(ammoSelect)],
                flags: 0,
            });
        } else if (interaction.customId.startsWith(AMMO_SELECT_ID)) {
            await interaction.deferUpdate();

            const selectedAmmo = interaction.values[0];
            const { weapon: selectedWeapon } = extractState(interaction.customId, AMMO_SELECT_ID);

            // Initial state for bleeding buff button
            const bleedingBuffToggle = new ButtonBuilder()
                .setCustomId(`${BLEEDING_BUFF_TOGGLE_ID}:${selectedWeapon}:${selectedAmmo}:false`) // Encode weapon, ammo, default bleeding
                .setLabel('Bleeding Buff: OFF ❌')
                .setStyle(ButtonStyle.Danger);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Damage Calculator')
                .setDescription(`Weapon: **${selectedWeapon}**\nAmmo: **${selectedAmmo}**\n\nPlease toggle bleeding buff if active.`);

            await interaction.editReply({
                embeds: [embed],
                components: [
                    ActionRowBuilder.from(interaction.message.components[0]), // Keep weapon select row
                    new ActionRowBuilder().addComponents(bleedingBuffToggle) // New row for bleeding toggle
                ],
                flags: 0,
            });
        } else if (interaction.customId.startsWith(BLEEDING_BUFF_TOGGLE_ID)) {
            await interaction.deferUpdate();

            const currentStyle = interaction.component.style;
            const bleedingBuffActive = currentStyle === ButtonStyle.Danger; // If current is Danger, new will be Success (ON)
            const newStyle = bleedingBuffActive ? ButtonStyle.Success : ButtonStyle.Danger;
            const newLabel = bleedingBuffActive ? 'Bleeding Buff: ON ✅' : 'Bleeding Buff: OFF ❌';

            const updatedBleedingButton = ButtonBuilder.from(interaction.component)
                .setLabel(newLabel)
                .setStyle(newStyle);

            // Extract weapon and ammo from the button's customId
            const { weapon: selectedWeapon, ammo: selectedAmmo } = extractState(interaction.customId, BLEEDING_BUFF_TOGGLE_ID);

            // Update the button's customId with the new bleeding state
            updatedBleedingButton.setCustomId(`${BLEEDING_BUFF_TOGGLE_ID}:${selectedWeapon}:${selectedAmmo}:${newStyle === ButtonStyle.Success}`);

            // Rebuild the action row with the updated button
            const updatedRow = new ActionRowBuilder().addComponents(updatedBleedingButton);

            await interaction.editReply({
                components: [
                    ActionRowBuilder.from(interaction.message.components[0]), // Keep weapon select row
                    updatedRow // Updated bleeding toggle row
                ],
                flags: 0,
            });

            // --- Immediately show modal for Strength Input after final selection ---
            const modal = new ModalBuilder()
                .setCustomId(`${MODAL_SUBMIT_ID}:${selectedWeapon}:${selectedAmmo}:${(newStyle === ButtonStyle.Success)}`) // Encode all state
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
            await interaction.deferReply({ flags: 0 }); // Visible reply for calculation result

            const strengthSkill = parseInt(interaction.fields.getTextInputValue(STRENGTH_INPUT_ID), 10);
            
            // Extract state from modal's customId using helper
            const { weapon: selectedWeapon, ammo: selectedAmmo, bleeding: bleedingBuffActive } = extractState(interaction.customId, MODAL_SUBMIT_ID);

            if (isNaN(strengthSkill) || strengthSkill <= 0) {
                return await interaction.editReply({ content: 'Please enter a valid positive number for Strength Skill.', flags: 0 }); // Visible error
            }

            const damageRangeStr = WEAPON_DATA[selectedWeapon]?.[selectedAmmo];
            if (!damageRangeStr) {
                return await interaction.editReply({ content: 'Could not find damage data for the selected weapon/ammo combination. Please restart with `/damage-calc`.', flags: 0 }); // Visible error
            }

            const [minDamageStr, maxDamageStr] = damageRangeStr.split(' - ').map(s => s.replace(' (x2)', '').replace(' (x3)', ''));
            let minDamage = parseInt(minDamageStr, 10);
            let maxDamage = parseInt(maxDamageStr, 10);

            if (isNaN(minDamage) || isNaN(maxDamage)) {
                return await interaction.editReply({ content: 'Error parsing damage range. Please try again with `/damage-calc`.', flags: 0 }); // Visible error
            }

            const buffMultiplier = bleedingBuffActive ? 1.5 : 1;

            const finalMinDamage = Math.round(minDamage * strengthSkill * buffMultiplier);
            const finalMaxDamage = Math.round(maxDamage * strengthSkill * buffMultiplier);

            const resultEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('Damage Calculation Result')
                .setDescription(
                    `**Weapon:** ${selectedWeapon}\n` +
                    `**Ammo:** ${selectedAmmo}\n` +
                    `**Strength Skill:** ${strengthSkill}\n` +
                    `**Bleeding Buff:** ${bleedingBuffActive ? 'ON ✅ (x1.5)' : 'OFF ❌ (x1.0)'}\n\n` +
                    `**Calculated Damage Range:** \`${finalMinDamage} - ${finalMaxDamage}\``
                )
                .setFooter({ text: 'Damage values are rounded to the nearest whole number.' });

            await interaction.editReply({ embeds: [resultEmbed], components: [], flags: 0 }); // Visible result
        }
    }
};
