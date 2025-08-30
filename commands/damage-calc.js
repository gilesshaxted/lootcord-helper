const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { WEAPON_DATA } = require('../utils/damageData'); // Import the weapon data

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const STRENGTH_INPUT_ID = 'damage_calc_strength_input';
const BLEEDING_BUFF_TOGGLE_ID = 'damage_calc_bleeding_toggle';
const CALCULATE_BUTTON_ID = 'damage_calc_calculate_button';
const MODAL_SUBMIT_ID = 'damage_calc_modal_submit'; // Define modal custom ID

module.exports = {
    data: new SlashCommandBuilder()
        .setName('damage-calc')
        .setDescription('Calculates potential damage for a chosen weapon and ammo.'),

    async execute(interaction) {
        // Defer reply to prevent timeout, and make it visible (not ephemeral)
        await interaction.deferReply({ flags: 0 }); // Changed to flags: 0 for visible message

        // Create the initial weapon selection dropdown
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
            flags: 0, // Changed to flags: 0 for visible message
        });
    },

    // This function will be called by index.js to handle subsequent interactions
    async handleInteraction(interaction) {
        if (interaction.customId === WEAPON_SELECT_ID) {
            await interaction.deferUpdate(); // Acknowledge the select menu interaction

            const selectedWeapon = interaction.values[0];
            const ammoTypes = WEAPON_DATA[selectedWeapon];

            if (!ammoTypes || Object.keys(ammoTypes).length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Damage Calculator Error')
                    .setDescription(`No ammo data found for **${selectedWeapon}**. Please select another weapon.`);
                return await interaction.editReply({ embeds: [embed], components: [], flags: 0 }); // Visible error
            }

            const ammoOptions = Object.keys(ammoTypes).map(ammoName => ({
                label: ammoName,
                value: ammoName,
            }));

            const ammoSelect = new StringSelectMenuBuilder()
                .setCustomId(`${AMMO_SELECT_ID}_${selectedWeapon}`) // Include weapon in customId for state
                .setPlaceholder('Select ammo type...')
                .addOptions(ammoOptions);

            // Initial state for bleeding buff button
            const bleedingBuffToggle = new ButtonBuilder()
                .setCustomId(BLEEDING_BUFF_TOGGLE_ID)
                .setLabel('Bleeding Buff: OFF ❌')
                .setStyle(ButtonStyle.Danger);

            const calculateButton = new ButtonBuilder()
                .setCustomId(CALCULATE_BUTTON_ID)
                .setLabel('Calculate Damage')
                .setStyle(ButtonStyle.Primary);

            const row1 = new ActionRowBuilder().addComponents(ammoSelect);
            const row2 = new ActionRowBuilder().addComponents(bleedingBuffToggle, calculateButton);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Damage Calculator')
                .setDescription(`Weapon: **${selectedWeapon}**\n\nPlease select your ammo, enter your strength, and toggle bleeding buff if active.`);

            await interaction.editReply({
                embeds: [embed],
                components: [row1, row2], // Display ammo select, toggle, and calculate button
                flags: 0, // Visible message
            });
        } else if (interaction.customId === BLEEDING_BUFF_TOGGLE_ID) {
            await interaction.deferUpdate();
            const currentStyle = interaction.component.style;
            const newStyle = currentStyle === ButtonStyle.Danger ? ButtonStyle.Success : ButtonStyle.Danger;
            const newLabel = newStyle === ButtonStyle.Success ? 'Bleeding Buff: ON ✅' : 'Bleeding Buff: OFF ❌';

            const updatedButton = ButtonBuilder.from(interaction.component)
                .setLabel(newLabel)
                .setStyle(newStyle);

            // Rebuild the action row with the updated button, keeping the calculate button
            const updatedRow = new ActionRowBuilder().addComponents(updatedButton, interaction.message.components[1].components[1]);

            await interaction.editReply({
                components: [interaction.message.components[0], updatedRow], // Keep weapon/ammo select row
                flags: 0, // Visible message
            });
        } else if (interaction.customId.startsWith(AMMO_SELECT_ID)) {
            await interaction.deferUpdate();
            // This interaction primarily updates the internal state of the message.
            // The selected ammo will be read when the calculate button is pressed.
        } else if (interaction.customId === CALCULATE_BUTTON_ID) {
            await interaction.deferUpdate(); // Defer the button click

            // --- Defensive checks and correct state extraction ---
            const components = interaction.message.components;
            if (!components || components.length < 2 || !components[0].components || components[0].components.length === 0 || !components[1].components || components[1].components.length < 2) {
                return await interaction.followUp({ content: 'Error: Could not retrieve selections from the message. Please restart the calculation with `/damage-calc`.', flags: MessageFlags.Ephemeral });
            }

            const ammoSelectComponent = components[0].components[0];
            if (!ammoSelectComponent || !ammoSelectComponent.customId || !ammoSelectComponent.values || ammoSelectComponent.values.length === 0) {
                return await interaction.followUp({ content: 'Error: Ammo selection is missing or invalid. Please select an ammo type.', flags: MessageFlags.Ephemeral });
            }
            
            // Correctly extract selectedWeapon from the ammoSelectComponent's customId
            const selectedWeaponParts = ammoSelectComponent.customId.split('_');
            if (selectedWeaponParts.length < 5) { // Expecting e.g., ['damage', 'calc', 'ammo', 'select', 'WeaponName']
                return await interaction.followUp({ content: 'Error: Could not determine selected weapon from ammo selection. Please restart the calculation with `/damage-calc`.', flags: MessageFlags.Ephemeral });
            }
            const selectedWeapon = selectedWeaponParts[4]; // Corrected index

            const selectedAmmo = ammoSelectComponent.values[0];
            const bleedingBuffActive = components[1].components[0].label.includes('ON ✅');

            // --- Show Modal for Strength Input ---
            const modal = new ModalBuilder()
                .setCustomId(`${MODAL_SUBMIT_ID}_${selectedWeapon}_${selectedAmmo}_${bleedingBuffActive}`) // Encode state in modal customId
                .setTitle('Finalize Damage Calculation');

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
            
            // Extract state from modal's customId
            const modalCustomIdParts = interaction.customId.split('_');
            const selectedWeapon = modalCustomIdParts[3];
            const selectedAmmo = modalCustomIdParts[4];
            const bleedingBuffActive = modalCustomIdParts[5] === 'true'; // Convert string to boolean

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
