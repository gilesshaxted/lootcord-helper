const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { WEAPON_DATA } = require('../utils/damageData'); // Import the weapon data

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const STRENGTH_INPUT_ID = 'damage_calc_strength_input';
const BLEEDING_BUFF_TOGGLE_ID = 'damage_calc_bleeding_toggle';
const CALCULATE_BUTTON_ID = 'damage_calc_calculate_button';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('damage-calc')
        .setDescription('Calculates potential damage for a chosen weapon and ammo.'),

    async execute(interaction) {
        // Defer reply to prevent timeout, ephemeral so only the user sees it
        await interaction.deferReply({ ephemeral: true });

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
            ephemeral: true,
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
                return await interaction.editReply({ embeds: [embed], components: [], ephemeral: true });
            }

            const ammoOptions = Object.keys(ammoTypes).map(ammoName => ({
                label: ammoName,
                value: ammoName,
            }));

            const ammoSelect = new StringSelectMenuBuilder()
                .setCustomId(`${AMMO_SELECT_ID}_${selectedWeapon}`) // Include weapon in customId for state
                .setPlaceholder('Select ammo type...')
                .addOptions(ammoOptions);

            const strengthInput = new TextInputBuilder()
                .setCustomId(STRENGTH_INPUT_ID)
                .setLabel("Your Strength Skill (e.g., 10, 50, 100)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Enter a number between 1 and 1000');

            const bleedingBuffToggle = new ButtonBuilder()
                .setCustomId(BLEEDING_BUFF_TOGGLE_ID)
                .setLabel('Bleeding Buff: OFF ❌')
                .setStyle(ButtonStyle.Danger);

            const calculateButton = new ButtonBuilder()
                .setCustomId(CALCULATE_BUTTON_ID)
                .setLabel('Calculate Damage')
                .setStyle(ButtonStyle.Primary);

            const row1 = new ActionRowBuilder().addComponents(ammoSelect);
            const row2 = new ActionRowBuilder().addComponents(strengthInput); // Text inputs must be in ActionRows by themselves
            const row3 = new ActionRowBuilder().addComponents(bleedingBuffToggle, calculateButton);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Damage Calculator')
                .setDescription(`Weapon: **${selectedWeapon}**\n\nPlease select your ammo, enter your strength, and toggle bleeding buff if active.`);

            await interaction.editReply({
                embeds: [embed],
                components: [row1, row3], // row2 is a TextInput, handled in modal or separate interaction
                ephemeral: true,
            });
        } else if (interaction.customId === BLEEDING_BUFF_TOGGLE_ID) {
            await interaction.deferUpdate();
            const currentStyle = interaction.component.style;
            const newStyle = currentStyle === ButtonStyle.Danger ? ButtonStyle.Success : ButtonStyle.Danger;
            const newLabel = newStyle === ButtonStyle.Success ? 'Bleeding Buff: ON ✅' : 'Bleeding Buff: OFF ❌';

            const updatedButton = ButtonBuilder.from(interaction.component)
                .setLabel(newLabel)
                .setStyle(newStyle);

            // Rebuild the action row with the updated button
            const updatedRow = new ActionRowBuilder().addComponents(updatedButton, interaction.message.components[1].components[1]); // Keep calculate button

            await interaction.editReply({
                components: [interaction.message.components[0], updatedRow], // Keep weapon/ammo select row
                ephemeral: true,
            });
        } else if (interaction.customId.startsWith(AMMO_SELECT_ID)) {
            await interaction.deferUpdate();
            // Store selected ammo in a temporary state if needed, or rely on final calculation button
            // For now, just acknowledge the selection.
        } else if (interaction.customId === CALCULATE_BUTTON_ID) {
            await interaction.deferReply({ ephemeral: true });

            const selectedWeapon = interaction.message.components[0].components[0].customId.split('_')[3]; // Extract weapon from customId
            const selectedAmmo = interaction.message.components[0].components[0].values[0]; // Extract ammo from select menu

            // To get strength, we need a modal.
            const modal = new ModalBuilder()
                .setCustomId('damage_calc_modal_submit')
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
        } else if (interaction.isModalSubmit() && interaction.customId === 'damage_calc_modal_submit') {
            await interaction.deferReply({ ephemeral: true });

            const strengthSkill = parseInt(interaction.fields.getTextInputValue(STRENGTH_INPUT_ID), 10);
            
            // Re-extract weapon and ammo from the original message components
            const selectedWeapon = interaction.message.components[0].components[0].customId.split('_')[3]; 
            const selectedAmmo = interaction.message.components[0].components[0].values[0];

            const bleedingBuffActive = interaction.message.components[1].components[0].label.includes('ON ✅');

            if (isNaN(strengthSkill) || strengthSkill <= 0) {
                return await interaction.editReply({ content: 'Please enter a valid positive number for Strength Skill.', ephemeral: true });
            }

            const damageRangeStr = WEAPON_DATA[selectedWeapon][selectedAmmo];
            if (!damageRangeStr) {
                return await interaction.editReply({ content: 'Could not find damage data for the selected weapon/ammo combination.', ephemeral: true });
            }

            const [minDamageStr, maxDamageStr] = damageRangeStr.split(' - ').map(s => s.replace(' (x2)', '').replace(' (x3)', ''));
            let minDamage = parseInt(minDamageStr, 10);
            let maxDamage = parseInt(maxDamageStr, 10);

            if (isNaN(minDamage) || isNaN(maxDamage)) {
                return await interaction.editReply({ content: 'Error parsing damage range. Please try again.', ephemeral: true });
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

            await interaction.editReply({ embeds: [resultEmbed], components: [], ephemeral: true });
        }
    }
};
