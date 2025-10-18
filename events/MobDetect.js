const { EmbedBuilder } = require('discord.js');

const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs } = require('firebase/firestore');

const stickyMessageManager = require('../utils/stickyMessageManager');



// --- Configuration ---

const TARGET_GAME_BOT_IDS = ['493316754689359874'];

const BOT_ID = '1393708735104422040';



// Regex to detect mob spawn messages

const MOB_MESSAGE_REGEX = /A \*\*(.*?)\*\* has spawned!/i;



module.exports = {

    name: 'messageCreate',

    once: false,

    async execute(message, db, client, isFirestoreReady, APP_ID_FOR_FIRESTORE) {

        // Ignore messages from this bot or from a non-target bot.

        if (message.author.id === BOT_ID || !TARGET_GAME_BOT_IDS.includes(message.author.id)) {

            return;

        }

        

        if (!isFirestoreReady) {

            console.warn(`[MobDetect] Firestore is not ready. Skipping message processing for mob events.`);

            return;

        }



        const guildId = message.guild.id;

        const channelId = message.channel.id;

        const guildChannelsRef = collection(db, `Guilds/${guildId}/channels`);

        const channelConfigDocRef = doc(guildChannelsRef, channelId);



        // Fetch stored channel configuration to ensure this channel is monitored

        const channelConfigSnap = await getDoc(channelConfigDocRef);

        if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {

            // Not a configured channel, or original name wasn't saved yet.

            // We must skip the rest of the logic, but allow the first mob spawn to save the name.

        }

        const originalChannelName = channelConfigSnap.exists() ? channelConfigSnap.data().originalChannelName : message.channel.name;



        // --- Detect Mob Spawn (Content-based) ---

        const mobSpawnMatch = message.content.match(MOB_MESSAGE_REGEX);

        if (mobSpawnMatch) {

            const mobName = mobSpawnMatch[1];

            let newName = null;

            if (mobName.includes('Heavy Scientist')) {

                newName = '🐻╏heavy';

            } else if (mobName.includes('Scientist')) {

                newName = '🥼╏scientist';

            } else if (mobName.includes('Tunnel Dweller')) {

                newName = '🧟╏dweller';

            } else if (mobName.includes('Patrol Helicopter')) {

                newName = '🚁╏heli';

            } else if (mobName.includes('Bradley APC')) {

                newName = '🚨╏brad';

            } else if (mobName.includes('Mummy')) {

                newName = '🎃 ╏Mummy';

            } else if (mobName.includes('Scarecrow')) {

                newName = '🎃 ╏Scarecrow';

            }

            // --- Mob Spawn Renaming ---

            if (newName && message.channel.name !== newName) {

                const oldChannelName = message.channel.name;

                try {

                    // Save original name if not already saved (runs for the first spawn message)

                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {

                        await setDoc(channelConfigDocRef, {

                            originalChannelName: oldChannelName

                        }, { merge: true });

                    }



                    await message.channel.setName(newName, `Automated rename due to mob spawn: ${mobName}.`);

                    console.log(`[MobDetect] Renamed channel to ${newName} for spawn.`);

                } catch (error) {

                    if (error.code === 50013) {

                        console.error(`[MobDetect] Failed to rename channel. Bot lacks 'Manage Channels' permission in <#${channelId}>.`);

                    } else {

                        console.error(`[MobDetect] Failed to rename channel for spawn. Unexpected error:`, error);

                    }

                }

            }

        }

        

        // --- Detect Mob Spawn (Embed-based, from Unscrambler) ---

        // This handles cases like Scramble/Trivia/Wordle embeds that also indicate a mob spawn.

        if (message.embeds.length > 0) {

            const embedTitle = message.embeds[0].title;

            let newName = null;



            if (embedTitle) { // Ensure embedTitle exists

                if (embedTitle.includes('Heavy Scientist')) {

                    newName = '🐻╏heavy';

                } else if (embedTitle.includes('Scientist')) { // Check Scientist after Heavy Scientist

                    newName = '🥼╏scientist';

                } else if (embedTitle.includes('Tunnel Dweller')) {

                    newName = '🧟╏dweller';

                } else if (embedTitle.includes('Patrol Helicopter')) {

                    newName = '🚁╏heli';

                } else if (embedTitle.includes('Bradley APC')) {

                    newName = '🚨╏brad';

                }

            }



            // --- Embed Mob Spawn Renaming ---

            if (newName && message.channel.name !== newName) {

                const oldChannelName = message.channel.name;

                try {

                    // Save original name if not already saved

                    if (!channelConfigSnap.exists() || !channelConfigSnap.data().originalChannelName) {

                        await setDoc(channelConfigDocRef, {

                            originalChannelName: oldChannelName

                        }, { merge: true });

                    }

                    

                    await message.channel.setName(newName, 'Automated rename due to enemy embed title.');

                    console.log(`[MobDetect] Renamed channel to ${newName} for embed spawn.`);

                } catch (error) {

                    console.error(`[MobDetect] Failed to rename channel for embed spawn:`, error);

                    if (error.code === 50013) { // Missing Permissions

                        console.error(`[MobDetect] Bot lacks 'Manage Channels' permission in #${message.channel.name}.`);

                    }

                }

            }

        }

        

        // --- Detect Mob Killed or Escaped ---

        const embed = message.embeds.length > 0 ? message.embeds[0] : null;

        

        // 1. Condition for Death/Kill

        const deathRevertCondition = message.content.includes('DIED!');



        // 2. Condition for Mob Escaped/Left (using the highly specific signature)

        const embedLeftCondition = (

            embed && 

            embed.title && 

            embed.title.includes('left...') &&

            embed.description &&

            embed.description.includes('Nobody defeated the mob!')

        );

        

        // 3. Condition for generic escape message (kept for robustness)

        const contentEscapeCondition = message.content.includes('escaped!');

        

        const revertCondition = deathRevertCondition || embedLeftCondition || contentEscapeCondition;



        // --- Channel Revert and Cleanup ---

        if (revertCondition) {

            console.log(`[MobDetect] Mob end condition met (Death: ${deathRevertCondition}, Left: ${embedLeftCondition}, Escape: ${contentEscapeCondition}).`);

            

            // Revert Channel Name

            if (originalChannelName && message.channel.name !== originalChannelName) {

                try {

                    await message.channel.setName(originalChannelName, `Automated revert to original name (Mob Ended).`);

                    console.log(`[MobDetect] Reverted channel name to ${originalChannelName}.`);

                } catch (error) {

                    if (error.code === 50013) {

                        console.error(`[MobDetect] Failed to revert channel name. Bot lacks 'Manage Channels' permission.`);

                    } else {

                        console.error(`[MobDetect] Failed to revert channel name. Unexpected error:`, error);

                    }

                }

            }

            

            // Remove Sticky Message

            try {

                // Remove sticky message will also clean up the user's active solo cooldown

                await stickyMessageManager.removeStickyMessage(client, db, message.channel.id);

                console.log(`[MobDetect] Initiated sticky message cleanup.`);

            } catch (error) {

                console.error(`[MobDetect] Failed to remove sticky message. Unexpected error:`, error);

            }

        }

    },

};
