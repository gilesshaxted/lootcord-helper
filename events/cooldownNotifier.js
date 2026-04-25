// events/cooldownNotifier.js
const { Events } = require('discord.js');
const { db } = require('../utils/firebase');
const { recordHelp } = require('../utils/stats');

const TARGET_GAME_BOT_ID = process.env.LOOTCORD_BOT_ID || '493316754689359874';

// ---------------------------------------------------------------------------
// COOLDOWN DURATIONS
// ---------------------------------------------------------------------------

const COOLDOWN_DURATIONS_MS = {
    // Melee weapons
    'bone knife': 945000, 'butcher knife': 1305000, 'candy cane': 1329000,
    'chain saw': 3132000, 'long sword': 2162000, 'mace': 2043000,
    'machete': 1523000, 'pickaxe': 698000, 'pitchfork': 2552000,
    'rock': 554000, 'salvage cleaver': 1261000, 'salvaged sword': 1243000,
    'sickle': 2050000, 'snowball': 2352000, 'stone spear': 1753000,
    'wooden spear': 920000,
    // Ranged weapons
    'bow': 1615000, 'crossbow': 2232000, 'f1 grenade': 2362000,
    'flame thrower': 3102000, 'snowball gun': 4200000,
    'waterpipe shotgun': 2732000, 'pump shotgun': 3432000,
    'spas-12': 4620000, 'm92': 2302000, 'semi pistol': 2155000,
    'revolver': 1835000, 'python': 4080000, 'mp5': 3960000,
    'thompson': 3167000, 'custom smg': 2884000, 'semi rifle': 3900000,
    'm39 rifle': 4320000, 'lr-300': 4200000, 'm249': 7800000,
    'bolt rifle': 7260000, 'assault rifle': 4560000, 'l96': 13020000,
    'grenade launcher': 6300000, 'rocket launcher': 8640000,
    'hmlmg': 5760000, 'sks': 3960000, 'm4 shotgun': 4500000,
    // Meds
    'bandage': 967000, 'medical syringe': 1696000, 'large medkit': 2682000,
    // Activities
    'farming': 3600000, 'voting': 43200000,
    // Gambling
    'gambling': 300000, 'wheel': 600000, 'jackpot': 540000, 'roulette': 180000,
    // Loot
    'trivia': 600000, 'scramble': 900000, 'wordle': 1800000,
    // Resources
    'wood': 120000, 'stone': 600000, 'metal': 1500000, 'high quality metal': 3600000,
};

// ---------------------------------------------------------------------------
// REGEX PATTERNS
// ---------------------------------------------------------------------------

const REGEX = {
    attack: /\*\*<@(\d+)>\*\* hit the \*\*.*?\*\* for \*\*(?:\d+)\*\* damage using their\s+<.*?>\s+`([^`]+)`/,
    farm: /You decide to\s+(?:scavenge for loot|go .+ chop some trees|go .+ mining).*and (?:find|receive|bring back).*`([^`]+)`!/s,
    med: /You use your.*`([^`]+)` to heal for/i,
    vote: /^You received \d+x\s.+ for voting on/i,
    repair: /✅ You used \*\*1x\*\* <.*?>\s+`([^`]+)` to repair the clan!/s,
    coinflip: /You chose \*\*(heads|tails)\*\* (?:and|but) the coin landed on \*\*(heads|tails)\*\*/is,
    roulette: /The gun(?: doesn't fire\.| blast)/i,
    jackpot: /^<@(\d+)> won the .* jackpot with a .*% chance of winning!/i,
};

const EMBED_REGEX = {
    blackjack: /blackjack$/i,
    slots: /slot machine$/i,
    wheel: /wheel roulette$/i,
    trivia: /Trivia Streak/,
    scramble: /^Word:/,
};

const WORDLE_START_REGEX = /Guess #1\s*[·/]\s*\*?\*?6\*?\*? guesses remaining/i;

// ---------------------------------------------------------------------------
// COOLDOWN PING
// ---------------------------------------------------------------------------

async function sendCooldownPing(client, userId, type, item, channelId, docId) {
    const appId = process.env.CLIENT_ID || 'default-app';

    const prefKeyMap = {
        attack: 'attackCooldown',
        farm: 'farmCooldown',
        med: 'medCooldown',
        vote: 'voteCooldown',
        repair: 'repairCooldown',
        gambling: 'gamblingCooldown',
        loot: 'lootCooldown',
    };

    const prefKey = prefKeyMap[type];
    if (!prefKey) {
        console.log(`[Cooldown] ⚠️ Unknown type ${type} for ${userId} — skipping`);
        await cleanupCooldown(docId);
        return;
    }

    try {
        const prefRef = db.collection('artifacts').doc(appId)
            .collection('users').doc(userId)
            .collection('notifications').doc('settings');

        const snap = await prefRef.get();

        if (!snap.exists) {
            console.log(`[Cooldown] ⏭️ Skipped ${type}/${item} for ${userId} — no notification settings found`);
            await cleanupCooldown(docId);
            return;
        }

        if (snap.data()[prefKey] !== true) {
            console.log(`[Cooldown] ⏭️ Skipped ${type}/${item} for ${userId} — ${prefKey} is OFF`);
            await cleanupCooldown(docId);
            return;
        }

        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
            console.log(`[Cooldown] ⚠️ Channel ${channelId} not found for ${userId}/${type}/${item}`);
            await cleanupCooldown(docId);
            return;
        }

        let pingMsg;
        switch (type) {
            case 'attack':
                pingMsg = `<@${userId}> your **${item}** attack cooldown is over! ⚔️`; break;
            case 'farm':
                pingMsg = `<@${userId}> your **farming** cooldown is over! 🌾`; break;
            case 'med':
                pingMsg = `<@${userId}> your **${item}** cooldown is over! 💊`; break;
            case 'vote':
                pingMsg = `<@${userId}> your **voting** cooldown is over! 🗳️`; break;
            case 'repair':
                pingMsg = `<@${userId}> your **clan repair** cooldown is over! 🔧`; break;
            case 'gambling':
                pingMsg = `<@${userId}> your **${item}** cooldown is over! 🎲`; break;
            case 'loot':
                pingMsg = `<@${userId}> your **${item}** cooldown is over! 🎁`; break;
            default:
                pingMsg = `<@${userId}> your cooldown is over! 🔔`;
        }

        await channel.send(pingMsg);
        console.log(`[Cooldown] 🔔 Pinged ${userId} for ${type}/${item} in #${channel.name}`);
        await recordHelp(userId);
        await cleanupCooldown(docId);

    } catch (err) {
        console.error(`[Cooldown] ❌ Ping failed for ${userId}/${type}/${item}:`, err.message);
        await cleanupCooldown(docId);
    }
}

async function cleanupCooldown(docId) {
    if (!docId) return;
    try {
        const appId = process.env.CLIENT_ID || 'default-app';
        await db.collection('artifacts').doc(appId)
            .collection('public').doc('data')
            .collection('activeCooldowns').doc(docId)
            .delete();
    } catch { /* already deleted */ }
}

async function scheduleCooldown(client, userId, type, item, channelId, guildId, duration) {
    if (!userId || !duration) return;

    const appId = process.env.CLIENT_ID || 'default-app';
    const docId = `${userId}_${type}_${item.replace(/\s+/g, '_')}`;
    const cooldownEndsAt = Date.now() + duration;

    try {
        const cooldownRef = db.collection('artifacts').doc(appId)
            .collection('public').doc('data')
            .collection('activeCooldowns').doc(docId);

        await cooldownRef.set({ userId, type, item, channelId, guildId, cooldownEndsAt });

        const delay = cooldownEndsAt - Date.now();
        setTimeout(async () => {
            await sendCooldownPing(client, userId, type, item, channelId, docId);
        }, Math.max(delay, 0));

        const mins = Math.round(duration / 60000);
        console.log(`[Cooldown] ⏰ Scheduled ${type}/${item} for ${userId} — ${mins}m`);
    } catch (err) {
        console.error(`[Cooldown] ❌ Failed to schedule ${type}/${item} for ${userId}:`, err.message);
    }
}

async function getPreviousUserMessage(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 5 });
        return messages.find(m => !m.author.bot) || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.id !== TARGET_GAME_BOT_ID || !message.guild) return;

        const channelId = message.channel.id;
        const guildId = message.guild.id;
        const content = message.content || '';
        const embed = message.embeds?.[0] || null;

        let userId = null;
        let item = null;
        let type = null;
        let duration = null;

        // ----------------------------------------------------------------
        // 1. ATTACK
        // ----------------------------------------------------------------
        const attackMatch = content.match(REGEX.attack);
        if (attackMatch) {
            userId = attackMatch[1];
            item = attackMatch[2].toLowerCase();
            type = 'attack';
            duration = COOLDOWN_DURATIONS_MS[item];
        }

        // ----------------------------------------------------------------
        // 2. FARM
        // ----------------------------------------------------------------
        if (!type) {
            const farmMatch = content.match(REGEX.farm);
            if (farmMatch) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot && prev.content.toLowerCase().startsWith('t-farm')) {
                    userId = prev.author.id;
                    item = farmMatch[1].toLowerCase();
                    type = 'farm';
                    duration = COOLDOWN_DURATIONS_MS['farming'];
                }
            }
        }

        // ----------------------------------------------------------------
        // 3. MED
        // ----------------------------------------------------------------
        if (!type) {
            const medMatch = content.match(REGEX.med);
            if (medMatch) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot && prev.content.toLowerCase().startsWith('t-use')) {
                    userId = prev.author.id;
                    item = medMatch[1].toLowerCase();
                    type = 'med';
                    duration = COOLDOWN_DURATIONS_MS[item];
                }
            }
        }

        // ----------------------------------------------------------------
        // 4. VOTE
        // ----------------------------------------------------------------
        if (!type) {
            if (REGEX.vote.test(content)) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot) {
                    userId = prev.author.id;
                    item = 'voting';
                    type = 'vote';
                    duration = COOLDOWN_DURATIONS_MS['voting'];
                }
            }
        }

        // ----------------------------------------------------------------
        // 5. REPAIR
        // ----------------------------------------------------------------
        if (!type) {
            const repairMatch = content.match(REGEX.repair);
            if (repairMatch) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot && prev.content.toLowerCase().startsWith('t-clan repair')) {
                    userId = prev.author.id;
                    item = repairMatch[1].toLowerCase();
                    type = 'repair';
                    duration = COOLDOWN_DURATIONS_MS[item];
                }
            }
        }

        // ----------------------------------------------------------------
        // 6. GAMBLING
        // ----------------------------------------------------------------
        if (!type) {
            const isCoinflip = REGEX.coinflip.test(content);
            const isBlackjack = embed?.author?.name && EMBED_REGEX.blackjack.test(embed.author.name);
            const isSlots = embed?.title && EMBED_REGEX.slots.test(embed.title);
            const isWheel = embed?.title && EMBED_REGEX.wheel.test(embed.title);
            const jackpotMatch = content.match(REGEX.jackpot);
            const isRoulette = REGEX.roulette.test(content);

            if (isCoinflip || isBlackjack || isSlots || isWheel || jackpotMatch || isRoulette) {
                type = 'gambling';

                if (isCoinflip) {
                    item = 'coinflip';
                    duration = COOLDOWN_DURATIONS_MS['gambling'];
                } else if (isBlackjack) {
                    item = 'blackjack';
                    duration = COOLDOWN_DURATIONS_MS['gambling'];
                } else if (isSlots) {
                    item = 'slots';
                    duration = COOLDOWN_DURATIONS_MS['gambling'];
                } else if (isWheel) {
                    item = 'wheel';
                    duration = COOLDOWN_DURATIONS_MS['wheel'];
                } else if (jackpotMatch) {
                    item = 'jackpot';
                    duration = COOLDOWN_DURATIONS_MS['jackpot'];
                    userId = jackpotMatch[1];
                } else if (isRoulette) {
                    item = 'roulette';
                    duration = COOLDOWN_DURATIONS_MS['roulette'];
                }

                if (!userId) {
                    const prev = await getPreviousUserMessage(message.channel);
                    if (prev && !prev.author.bot) {
                        const prevContent = prev.content.toLowerCase();
                        const isGamblingCommand = [
                            't-cf', 't-coinflip', 't-bj', 't-blackjack',
                            't-slots', 't-wheel', 't-roulette'
                        ].some(cmd => prevContent.startsWith(cmd));
                        if (isGamblingCommand) userId = prev.author.id;
                    }
                }
            }
        }

        // ----------------------------------------------------------------
        // 7. LOOT — trivia, scramble, wordle
        // ----------------------------------------------------------------
        if (!type && embed) {
            const hasTriviaField = embed.fields?.some(f => EMBED_REGEX.trivia.test(f.name || ''));
            if (hasTriviaField) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot && /^t-\s*trivia$/i.test(prev.content.trim())) {
                    userId = prev.author.id;
                    item = 'trivia';
                    type = 'loot';
                    duration = COOLDOWN_DURATIONS_MS['trivia'];
                }
            }

            if (!type && embed.description && EMBED_REGEX.scramble.test(embed.description)) {
                const prev = await getPreviousUserMessage(message.channel);
                if (prev && !prev.author.bot && /^t-\s*scramble$/i.test(prev.content.trim())) {
                    userId = prev.author.id;
                    item = 'scramble';
                    type = 'loot';
                    duration = COOLDOWN_DURATIONS_MS['scramble'];
                }
            }
        }

        if (!type && WORDLE_START_REGEX.test(content)) {
            const prev = await getPreviousUserMessage(message.channel);
            if (prev && !prev.author.bot && /^t-\s*wordle/i.test(prev.content.trim())) {
                userId = prev.author.id;
                item = 'wordle';
                type = 'loot';
                duration = COOLDOWN_DURATIONS_MS['wordle'];
            }
        }

        // ----------------------------------------------------------------
        // SCHEDULE
        // ----------------------------------------------------------------
        if (userId && item && type && duration) {
            await scheduleCooldown(message.client, userId, type, item, channelId, guildId, duration);
        }
    }
};
