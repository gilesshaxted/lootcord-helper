const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { doc, getDoc } = require('firebase/firestore'); // Import Firestore functions
const { WEAPON_DATA } = require('../utils/damageData');

// Custom IDs for interaction components
const WEAPON_SELECT_ID = 'damage_calc_weapon_select';
const AMMO_SELECT_ID = 'damage_calc_ammo_select';
const BLEEDING_SELECT_ID = 'damage_calc_bleeding_select';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('damage-calc')
        .setDescription('Calculates potential damage for a chosen weapon and ammo.'),

    async execute(interaction, db, client, APP_ID_FOR_FIRESTORE) {
        // Defer reply once, as the command itself handles the initial response
        await interaction.deferReply({ flags: 0 });

        if (!db) {
            return await interaction.editReply({ content: 'Bot is not fully initialized (Firestore not ready). Please try again in a moment.', flags: MessageFlags.Ephemeral });
        }
        
        const userId = interaction.user.id;
        
        // Use a more robust and readable path construction
        const userSkillsRef = doc(db, `artifacts/${APP_ID_FOR_FIRESTORE}/users/${userId}/skills`, 'main');
        
        try {
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
                .addOptions(weaponOptions.slice(0, 25)); // <-- FIX: Slices the array to the max of 25 options.

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
        } catch (error) {
            console.error('[Damage Calc Command] Error fetching user data or creating reply:', error);
            await interaction.editReply({ content: 'An unexpected error occurred while processing your command. Please try again.', flags: MessageFlags.Ephemeral });
        }
    },
};
