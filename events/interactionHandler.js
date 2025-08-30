const { doc, collection, getDoc, setDoc } = require('firebase/firestore');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { WEAPON_DATA } = require('../utils/damageData');
const paginationHelpers = require('../utils/pagination');
const damageCalcCommand = require('../commands/damage-calc.js');

const TRIVIA_EXPLANATION_BUTTON = 'show_trivia_explanation_';

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {
        if (!isFirestoreReady) {
            console.error('Firestore is not yet ready to process interactions. Skipping interaction.');
            if (interaction.isMessageComponent() || interaction.isModalSubmit() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'The bot is still starting up. Please try again in a moment.', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // --- Handle /damage-calc interactions ---
        if (interaction.customId.startsWith('damage_calc_')) {
            if (damageCalcCommand && damageCalcCommand.handleInteraction) {
                await damageCalcCommand.handleInteraction(interaction, db, client, APP_ID_FOR_FIRESTORE);
            }
            return;
        }

        // --- Notify Button Logic ---
        if (interaction.isButton() && interaction.customId.startsWith('toggle_')) {
            console.log(`[Notify Button - Debug] Button click received by ${interaction.user.tag} for customId: ${interaction.customId}`);
            await interaction.deferUpdate();

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
                let targetCooldownType;
                if (interaction.customId === 'toggle_gambling_notifications') {
                    targetCooldownType = 'gamblingCooldown';
                } else {
                    targetCooldownType = interaction.customId.replace('toggle_', '').replace('_notifications', '');
                }

                const currentPrefSnap = await getDoc(prefsRefs[targetCooldownType]);
                let newEnabledState = !(currentPrefSnap.exists() ? currentPrefSnap.data().enabled : false);
                console.log(`[Notify Button] User ${userId} toggled ${targetCooldownType} notifications to: ${newEnabledState}`);

                await setDoc(prefsRefs[targetCooldownType], { enabled: newEnabledState }, { merge: true });

                const currentPrefs = {};
                for (const type in prefsRefs) {
                    const snap = await getDoc(prefsRefs[type]);
                    currentPrefs[type] = snap.exists() ? snap.data().enabled : false;
                }

                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('Lootcord Helper Notifications')
                    .setDescription(
                        `Here you can manage your personal notification settings for Lootcord Helper.\n\n` +
                        `**Attack Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.attackCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your weapon cooldowns are over.\n\n` +
                        `**Farm Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.farmCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your farming cooldowns are over.\n\n` +
                        `**Med Cooldown Notifications:**\n` +
                        `Status: **${currentPrefs.medCooldown ? 'ON ✅' : 'OFF ❌'}**\n` +
                        `You'll be pinged when your medical item cooldowns are over.\n\n` +
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

                await interaction.editReply({ embeds: [embed], components: [row1, row2] });
                console.log(`[Notify Button] Updated original message with new notification status for ${userId}.`);

            } catch (error) {
                console.error(`[Notify Button] Error toggling notification preference for ${userId}:`, error);
                await interaction.followUp({ content: '❌ An error occurred while updating your notification settings. Please check logs.', flags: MessageFlags.Ephemeral });
            }
        }
        
        // --- Pagination Logic ---
        if (interaction.isButton() && (interaction.customId.startsWith('page_prev_') || interaction.customId.startsWith('page_next_'))) {
            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[1];
            const currentPage = parseInt(parts[2], 10);

            let newPage = currentPage;
            if (action === 'prev') {
                newPage--;
            } else if (action === 'next') {
                newPage++;
            }
            
            const { content, components } = await paginationHelpers.createChannelPaginationMessage(interaction.guild, newPage);
            await interaction.editReply({ content, components, flags: 0 });
        }
        
        // --- Trivia Explanation Logic ---
        if (interaction.isButton() && interaction.customId.startsWith(TRIVIA_EXPLANATION_BUTTON)) {
             await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const originalMessageId = parts[3];

            const triviaExplanationRef = doc(collection(db, `TriviaExplanations`), originalMessageId);

            try {
                const docSnap = await getDoc(triviaExplanationRef);

                if (docSnap.exists()) {
                    const explanationData = docSnap.data();
                    const explanations = explanationData.explanations;
                    const optionLetters = ['A', 'B', 'C', 'D'];

                    let explanationContent = `**Explanation for Trivia Question:** \`${explanationData.question}\`\n\n`;
                    explanationContent += `\`\`\`\n`;
                    optionLetters.forEach(letter => {
                        if (explanations[letter]) {
                            explanationContent += `${letter}: ${explanations[letter]}\n`;
                        }
                    });
                    explanationContent += `\`\`\``;

                    const originalMessage = interaction.message;
                    if (originalMessage) {
                        const newComponents = originalMessage.components.map(row => {
                            return new ActionRowBuilder().addComponents(
                                row.components.map(button => {
                                    return ButtonBuilder.from(button).setDisabled(true);
                                })
                            );
                        });
                        await originalMessage.edit({ embeds: [originalMessage.embeds[0]], components: newComponents });
                    }

                    await interaction.followUp({ content: explanationContent, flags: 0 });
                    console.log(`Trivia Solver: Posted explanation for message ID ${originalMessageId} in #${interaction.channel.name}.`);
                } else {
                    await interaction.followUp({ content: 'Could not find explanation for this trivia question.', flags: 0 });
                    console.warn(`Trivia Solver: Explanation not found for message ID ${originalMessageId}.`);
                }
            } catch (error) {
                console.error(`Trivia Solver: Error fetching explanation for message ID ${originalMessageId}:`, error);
                await interaction.followUp({ content: 'An error occurred while fetching the explanation. Please check logs.', flags: MessageFlags.Ephemeral });
            }
        }
    }
};
