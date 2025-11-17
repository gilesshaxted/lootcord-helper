const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const statsTracker = require('../utils/statsTracker');

// --- Configuration ---
const TARGET_GAME_BOT_ID = '493316754689359874';
const COOLDOWN_DURATIONS_MS = {
    'bone knife': 15 * 60 * 1000 + 45 * 1000,
    'butcher knife': 21 * 60 * 1000 + 45 * 1000,
    'candy cane': 22 * 60 * 1000 + 9 * 1000,
    'chain saw': 52 * 60 * 1000 + 12 * 1000,
    'long sword': 36 * 60 * 1000 + 2 * 1000,
    'mace': 34 * 60 * 1000 + 3 * 1000,
    'machete': 25 * 60 * 1000 + 23 * 1000,
    'pickaxe': 11 * 60 * 1000 + 38 * 1000,
    'pitchfork': 42 * 60 * 1000 + 32 * 1000,
    'rock': 9 * 60 * 1000 + 14 * 1000,
    'salvage cleaver': 21 * 60 * 1000 + 1 * 1000,
    'salvaged sword': 20 * 60 * 1000 + 43 * 1000,
    'sickle': 34 * 60 * 1000 + 10 * 1000,
    'snowball': 39 * 60 * 1000 + 12 * 1000,
    'stone spear': 29 * 60 * 1000 + 13 * 1000,
    'wooden spear': 15 * 60 * 1000 + 20 * 1000,
    'bow': 26 * 60 * 1000 + 55 * 1000,
    'crossbow': 37 * 60 * 1000 + 12 * 1000,
    'f1 grenade': 39 * 60 * 1000 + 22 * 1000,
    'flame thrower': 51 * 60 * 1000 + 42 * 1000,
    'snowball gun': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'waterpipe shotgun': 45 * 60 * 1000 + 32 * 1000,
    'pump shotgun': 57 * 60 * 1000 + 12 * 1000,
    'spas-12': 1 * 60 * 60 * 1000 + 17 * 60 * 1000 + 0 * 1000,
    'm92': 38 * 60 * 1000 + 22 * 1000,
    'semi pistol': 35 * 60 * 1000 + 55 * 1000,
    'revolver': 30 * 60 * 1000 + 35 * 1000,
    'python': 1 * 60 * 60 * 1000 + 8 * 60 * 1000 + 0 * 1000,
    'mp5': 1 * 60 * 60 * 1000 + 6 * 60 * 1000 + 0 * 1000,
    'thompson': 52 * 60 * 1000 + 47 * 1000,
    'custom smg': 48 * 60 * 1000 + 4 * 1000,
    'semi rifle': 1 * 60 * 60 * 1000 + 5 * 60 * 1000 + 0 * 1000,
    'm39 rifle': 1 * 60 * 60 * 1000 + 12 * 60 * 1000 + 0 * 1000,
    'lr-300': 1 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'm249': 2 * 60 * 60 * 1000 + 10 * 60 * 1000 + 0 * 1000,
    'bolt rifle': 2 * 60 * 60 * 1000 + 1 * 60 * 1000 + 0 * 1000,
    'assault rifle': 1 * 60 * 60 * 1000 + 16 * 60 * 1000 + 0 * 1000,
    'l96': 3 * 60 * 60 * 1000 + 37 * 60 * 1000 + 0 * 1000,
    'grenade launcher': 1 * 60 * 60 * 1000 + 45 * 60 * 1000 + 0 * 1000,
    'rocket launcher': 2 * 60 * 60 * 1000 + 24 * 60 * 1000 + 0 * 1000,
    'bandage': 16 * 60 * 1000 + 7 * 1000,
    'medical syringe': 28 * 60 * 1000 + 16 * 1000,
    'large medkit': 44 * 60 * 1000 + 42 * 1000,
    'farming': 60 * 60 * 1000,
    'voting': 12 * 60 * 60 * 1000,
    'gambling': 5 * 60 * 1000,
    'wheel': 10 * 60 * 1000,
    'jackpot': 9 * 60 * 1000,
    'roulette': 3 * 60 * 1000,
    'trivia': 10 * 60 * 1000,
    'scramble': 15 * 60 * 1000,
    'wordle': 30 * 60 * 1000,
    'wood': 2 * 60 * 1000,
    'stone': 10 * 60 * 1000,
    'metal': 25 * 60 * 1000,
    'high quality metal': 60 * 60 * 1000
    'hmlmg': 1 * 60 * 60 * 1000 + 36 * 60 * 1000 + 0 * 1000,
    'sks': 1 * 60 * 60 * 1000 + 6 * 60 * 1000 + 0 * 1000,
    'm4 shotgun': 1 * 60 * 60 * 1000 + 15 * 60 * 1000 + 0 * 1000,
};

const ATTACK_MESSAGE_REGEX = /^(?:<a?:.+?:\d+>|\S+)\s+\*\*<@(\d+)>\*\* hit the \*\*(.*?)\*\* for \*\*(?:\d+)\*\* damage using their\s+<a?:.+?:\d+>\s+`([^`]+)`/;
const FARM_MESSAGE_REGEX = /^You decide to\s+(?:scavenge for loot|go :axe: chop some trees|go :pick: mining).*and (?:find|receive|bring back).*`([^`]+)`!/;
const MED_MESSAGE_REGEX = /^You use your.*`([^`]+)` to heal for \*\*(\d+)\*\* health! You now have.*\*\*(\d+)\*\* health\.?$/i;
const VOTE_MESSAGE_REGEX = /^You received \d+x\s.+ for voting on/i;
const REPAIR_MESSAGE_REGEX = /^✅ You used \*\*1x\*\* <a?:.+?:\d+>\s+`([^`]+)` to repair the clan!/s;
const GAMBLING_MESSAGE_REGEX = /^You chose \*\*(heads|tails)\*\* (?:and|but) the coin landed on \*\*(heads|tails)\*\*.*$/is;
const BLACKJACK_EMBED_AUTHOR_REGEX = /blackjack$/i;
const SLOTS_EMBED_TITLE_REGEX = /slot machine$/i;
const WHEEL_EMBED_TITLE_REGEX = /wheel roulette$/i;
const JACKPOT_MESSAGE_REGEX = /^<@(\d+)> won the .* jackpot with a .*% chance of winning!$/i;
const ROULETTE_MESSAGE_REGEX = /The gun(?: doesn't fire\.| blast)/i;
const TRIVIA_EMBED_FIELD_REGEX = /Trivia Streak/;
const SCRAMBLE_EMBED_DESCRIPTION_REGEX = /^Word:/;
const WORDLE_MESSAGE_CONTENT_REGEX = /^Guess #1 \/ 6 · 6 guesses remaining/s;


async function sendCooldownPing(client, db, userId, channelId, type, item, cooldownDocId, APP_ID_FOR_FIRESTORE) {
    let notificationType;
    let pingMessage;

    switch (type) {
        case 'attack':
            notificationType = 'attackCooldown';
            pingMessage = `<@${userId}> your **${item}** attack cooldown is over!`;
            break;
        case 'farm':
            notificationType = 'farmCooldown';
            pingMessage = `<@${userId}> your **farming** cooldown is over! Last find was **${item}**`;
            break;
        case 'med':
            notificationType = 'medCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`;
            break;
        case 'vote':
            notificationType = 'voteCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`;
            break;
        case 'repair':
            notificationType = 'repairCooldown';
            pingMessage = `<@${userId}> your **clan repair (${item})** cooldown is over!`;
            break;
        case 'gambling':
            notificationType = 'gamblingCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`; 
            break;
        case 'loot':
            notificationType = 'lootCooldown';
            pingMessage = `<@${userId}> your **${item}** cooldown is over!`;
            break;
        default:
            await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
            return;
    }

    const userPrefsRef = doc(collection(db, `UserNotifications/${userId}/preferences`), notificationType);
    const prefSnap = await getDoc(userPrefsRef);
    const isNotificationEnabled = prefSnap.exists() ? prefSnap.data().enabled : false;

    if (!isNotificationEnabled) {
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
        return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
        return;
    }

    try {
        await channel.send(pingMessage);
        statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
        await deleteDoc(doc(collection(db, `ActiveCooldowns`), cooldownDocId));
    } catch (error) {
        console.error(`Cooldown Notifier: Failed to send ${type} cooldown ping in #${channel.name} for ${userId}/${item}:`, error);
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, db, client, APP_ID_FOR_FIRESTORE) {
        if (message.author.id !== TARGET_GAME_BOT_ID) {
            return;
        }
        if (message.author.id === client.user.id) {
            return;
        }

        if (!message.guild) {
            return;
        }

        if (!db || !APP_ID_FOR_FIRESTORE) {
            return;
        }
        
        let playerId = null;
        let item = null;
        let cooldownType = null;
        let cooldownDuration = undefined;

        // --- Cooldowns already implemented (Attack, Farm, Med, Gambling, Vote, Repair) ---
        const attackMatch = message.content.match(ATTACK_MESSAGE_REGEX);
        if (attackMatch) {
            playerId = attackMatch[1];
            item = attackMatch[3].toLowerCase();
            cooldownType = 'attack';
            cooldownDuration = COOLDOWN_DURATIONS_MS[item];
        }

        const farmMatch = message.content.match(FARM_MESSAGE_REGEX);
        if (farmMatch && !attackMatch) {
            item = farmMatch[1].toLowerCase();
            cooldownType = 'farm';
            cooldownDuration = COOLDOWN_DURATIONS_MS['farming'];
            
            try {
                const messages = await message.channel.messages.fetch({ limit: 2 });
                const previousMessage = messages.last();
                
                if (previousMessage && !previousMessage.author.bot && previousMessage.content.toLowerCase().startsWith('t-farm')) {
                    playerId = previousMessage.author.id;
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for farm cooldown:`, error);
            }
        }

        const medMatch = message.content.match(MED_MESSAGE_REGEX);
        if (medMatch && !attackMatch && !farmMatch) {
            item = medMatch[1].toLowerCase();
            cooldownType = 'med';
            cooldownDuration = COOLDOWN_DURATIONS_MS[item];
            
            try {
                const messages = await message.channel.messages.fetch({ limit: 2 });
                const previousMessage = messages.last();
                
                if (previousMessage && !previousMessage.author.bot && previousMessage.content.toLowerCase().startsWith('t-use')) {
                    playerId = previousMessage.author.id;
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for med cooldown:`, error);
            }
        }
        
        const gamblingMatch = message.content.match(GAMBLING_MESSAGE_REGEX);
        const blackjackEmbedMatch = message.embeds.length > 0 && message.embeds[0].author && message.embeds[0].author.name && BLACKJACK_EMBED_AUTHOR_REGEX.test(message.embeds[0].author.name);
        const slotsEmbedMatch = message.embeds.length > 0 && message.embeds[0].title && SLOTS_EMBED_TITLE_REGEX.test(message.embeds[0].title);
        const wheelEmbedMatch = message.embeds.length > 0 && message.embeds[0].title && WHEEL_EMBED_TITLE_REGEX.test(message.embeds[0].title);
        const jackpotMessageMatch = message.content.match(JACKPOT_MESSAGE_REGEX);
        const rouletteMessageMatch = message.content.match(ROULETTE_MESSAGE_REGEX);

        if ((gamblingMatch || blackjackEmbedMatch || slotsEmbedMatch || wheelEmbedMatch || jackpotMessageMatch || rouletteMessageMatch) && !attackMatch && !farmMatch && !medMatch) {
            cooldownType = 'gambling';
            
            if (gamblingMatch) {
                item = 'coinflip';
                cooldownDuration = COOLDOWN_DURATIONS_MS['gambling'];
            } else if (blackjackEmbedMatch) {
                item = 'blackjack';
                cooldownDuration = COOLDOWN_DURATIONS_MS['gambling'];
            } else if (slotsEmbedMatch) {
                item = 'slots';
                cooldownDuration = COOLDOWN_DURATIONS_MS['gambling'];
            } else if (wheelEmbedMatch) {
                item = 'wheel roulette';
                cooldownDuration = COOLDOWN_DURATIONS_MS['wheel'];
            } else if (jackpotMessageMatch) {
                item = 'jackpot';
                cooldownDuration = COOLDOWN_DURATIONS_MS['jackpot'];
            } else if (rouletteMessageMatch) {
                item = 'roulette';
                cooldownDuration = COOLDOWN_DURATIONS_MS['roulette'];
            }
            
            try {
                if (jackpotMessageMatch) {
                    playerId = jackpotMessageMatch[1];
                } else {
                    const messages = await message.channel.messages.fetch({ limit: 2 });
                    const previousMessage = messages.last();
                    
                    if (previousMessage && !previousMessage.author.bot && 
                       (previousMessage.content.toLowerCase().startsWith('t-cf') || 
                        previousMessage.content.toLowerCase().startsWith('t-coinflip') ||
                        previousMessage.content.toLowerCase().startsWith('t-bj') ||
                        previousMessage.content.toLowerCase().startsWith('t-slots') ||
                        previousMessage.content.toLowerCase().startsWith('t-wheel') ||
                        previousMessage.content.toLowerCase().startsWith('t-roulette'))) {
                        playerId = previousMessage.author.id;
                    }
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for gambling cooldown:`, error);
            }
        }

        const voteMatch = message.content.match(VOTE_MESSAGE_REGEX);
        if (voteMatch && !attackMatch && !farmMatch && !medMatch && !gamblingMatch && !blackjackEmbedMatch && !slotsEmbedMatch && !wheelEmbedMatch && !jackpotMessageMatch && !rouletteMessageMatch) {
            item = 'voting';
            cooldownType = 'vote';
            cooldownDuration = COOLDOWN_DURATIONS_MS['voting'];
            
            try {
                const messages = await message.channel.messages.fetch({ limit: 2 });
                const previousMessage = messages.last();
                
                if (previousMessage && !previousMessage.author.bot) {
                    playerId = previousMessage.author.id;
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for vote cooldown:`, error);
            }
        }

        const repairMatch = message.content.match(REPAIR_MESSAGE_REGEX);
        if (repairMatch && !attackMatch && !farmMatch && !medMatch && !voteMatch && !gamblingMatch && !blackjackEmbedMatch && !slotsEmbedMatch && !wheelEmbedMatch && !jackpotMessageMatch && !rouletteMessageMatch) {
            item = repairMatch[1].toLowerCase();
            cooldownType = 'repair';
            cooldownDuration = COOLDOWN_DURATIONS_MS[item];
            
            try {
                const messages = await message.channel.messages.fetch({ limit: 2 });
                const previousMessage = messages.last();
                
                if (previousMessage && !previousMessage.author.bot && previousMessage.content.toLowerCase().startsWith('t-clan repair')) {
                    playerId = previousMessage.author.id;
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for repair cooldown:`, error);
            }
        }

        // --- NEW: Loot (Trivia, Scramble, Wordle) Cooldown Logic ---
        // Check for Trivia
        if (!playerId && !cooldownType && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const hasTriviaField = embed.fields?.some(field => TRIVIA_EMBED_FIELD_REGEX.test(field.name));
            if (hasTriviaField) {
                item = 'trivia';
                cooldownType = 'loot';
                cooldownDuration = COOLDOWN_DURATIONS_MS['trivia'];
                try {
                    const messages = await message.channel.messages.fetch({ limit: 2 });
                    const previousMessage = messages.last();
                    if (previousMessage && previousMessage.content.toLowerCase().startsWith('t-trivia')) {
                        playerId = previousMessage.author.id;
                    }
                } catch (error) {
                    console.error(`Cooldown Notifier: Error fetching previous message for trivia cooldown:`, error);
                }
            }
        }

        // Check for Scramble
        if (!playerId && !cooldownType && message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.description && SCRAMBLE_EMBED_DESCRIPTION_REGEX.test(embed.description)) {
                item = 'scramble';
                cooldownType = 'loot';
                cooldownDuration = COOLDOWN_DURATIONS_MS['scramble'];
                try {
                    const messages = await message.channel.messages.fetch({ limit: 2 });
                    const previousMessage = messages.last();
                    if (previousMessage && previousMessage.content.toLowerCase().startsWith('t-scramble')) {
                        playerId = previousMessage.author.id;
                    }
                } catch (error) {
                    console.error(`Cooldown Notifier: Error fetching previous message for scramble cooldown:`, error);
                }
            }
        }
        
        // Check for Wordle (using message content)
        if (!playerId && !cooldownType && WORDLE_MESSAGE_CONTENT_REGEX.test(message.content)) {
            item = 'wordle';
            cooldownType = 'loot';
            cooldownDuration = COOLDOWN_DURATIONS_MS['wordle'];
            try {
                const messages = await message.channel.messages.fetch({ limit: 2 });
                const previousMessage = messages.last();
                if (previousMessage && previousMessage.content.toLowerCase().startsWith('t-wordle')) {
                    playerId = previousMessage.author.id;
                }
            } catch (error) {
                console.error(`Cooldown Notifier: Error fetching previous message for wordle cooldown:`, error);
            }
        }


        if (playerId && item && cooldownType && cooldownDuration !== undefined) {
            if (cooldownDuration === undefined) {
                return;
            }

            const cooldownEndsAt = Date.now() + cooldownDuration;
            const cooldownDocId = `${playerId}_${message.channel.id}_${cooldownType}`;

            const activeCooldownsRef = collection(db, `ActiveCooldowns`);
            const cooldownDocRef = doc(activeCooldownsRef, cooldownDocId);

            try {
                await setDoc(cooldownDocRef, {
                    userId: playerId,
                    channelId: message.channel.id,
                    type: cooldownType,
                    item: item,
                    cooldownEndsAt: cooldownEndsAt,
                    originalMessageId: message.id,
                    guildId: message.guild.id,
                    pinged: false
                });
                
                const delay = cooldownEndsAt - Date.now();

                if (delay > 0) {
                    setTimeout(() => {
                        sendCooldownPing(client, db, playerId, message.channel.id, cooldownType, item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                    }, delay);
                } else {
                    sendCooldownPing(client, db, playerId, message.channel.id, cooldownType, item, cooldownDocId, APP_ID_FOR_FIRESTORE);
                }
                statsTracker.incrementTotalHelps(db, APP_ID_FOR_FIRESTORE);
            } catch (error) {
                console.error(`Cooldown Notifier: Error storing/scheduling ${cooldownType} cooldown for ${playerId}/${item}:`, error);
            }
        }
    },
    sendCooldownPing
};
