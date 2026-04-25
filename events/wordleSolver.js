// events/wordleTracker.js
const { Events, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../utils/firebase');
const { checkPremiumAccess } = require('../utils/premium');
const { recordHelp } = require('../utils/stats');
const { sendNudgeIfDue } = require('../utils/appreciationNudge');
const { solve, loadWordlists } = require('../utils/wordleSolver');

const TARGET_BOT_ID = '493316754689359874';
const LOG_CHANNEL_ID = '1394316724819591318';
const DIAG_CHANNEL_ID = '1307628841799254026';
const ENABLE_DIAG_LOGS = false; // Set to true to debug suggestion timing issues

const GUESS_REGEX = /(?:Guess|Tries|Attempt)\s*#?\s*(\d+)/i;
const LOSS_REGEX = /the\s+word\s+was|better\s+luck|out\s+of\s+guess|exhausted/i;
const WORDLE_COMMAND_REGEX = /^t-\s*wordle/i;

const activeSessions = new Map();
const lastSentStateByChannel = new Map();

loadWordlists();

// ---------------------------------------------------------------------------
// DIAG LOGGING
// ---------------------------------------------------------------------------

async function sendDiagLog(client, channelId, title, data) {
    if (!ENABLE_DIAG_LOGS) return;
    try {
        const diagChannel = await client.channels.fetch(DIAG_CHANNEL_ID).catch(() => null);
        if (!diagChannel) return;
        const fileName = `wordle-diag-${Date.now()}.json`;
        await diagChannel.send({
            content: `🟩 **Wordle Diag** — ${title} | Channel: <#${channelId}>`,
            files: [new AttachmentBuilder(
                Buffer.from(JSON.stringify(data, null, 2)),
                { name: fileName }
            )]
        });
    } catch (err) {
        console.error('[Wordle Diag] Failed to send:', err.message);
    }
}

// ---------------------------------------------------------------------------
// WORD LIBRARY
// ---------------------------------------------------------------------------

let wordLibraryCache = null;
let wordLibraryCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getWordLibrary() {
    const now = Date.now();
    if (wordLibraryCache && (now - wordLibraryCacheTime) < CACHE_TTL_MS) return wordLibraryCache;
    try {
        const doc = await db.collection('wordleLibrary').doc('confirmedWords').get();
        const words = doc.exists ? (doc.data().words || []) : [];
        wordLibraryCache = new Set(words.map(w => w.toUpperCase()));
        wordLibraryCacheTime = now;
        console.log(`[Wordle Library] Loaded ${wordLibraryCache.size} confirmed past answers.`);
        return wordLibraryCache;
    } catch (err) {
        console.error('[Wordle Library] Load failed:', err.message);
        return new Set();
    }
}

async function saveConfirmedWord(word) {
    if (!word || word.length !== 5) return;
    const upper = word.toUpperCase();
    try {
        const library = await getWordLibrary();
        if (library.has(upper)) return;
        library.add(upper);
        await db.collection('wordleLibrary').doc('confirmedWords').set({
            words: Array.from(library),
            updatedAt: new Date().toISOString()
        });
        console.log(`[Wordle Library] ✅ Saved: ${upper} (total: ${library.size})`);
    } catch (err) {
        console.error('[Wordle Library] Save failed:', err.message);
    }
}

// ---------------------------------------------------------------------------
// OPENER EMBED
// ---------------------------------------------------------------------------

async function sendOpenerSuggestions(channel, userId) {
    try {
        const emptyState = {
            correct: Array(5).fill(null),
            present: new Set(),
            absent: new Set(),
            presentPositions: Array(5).fill().map(() => new Set())
        };

        const result = solve(emptyState, new Set(), 1);
        const { likely = [] } = result.suggestions;
        if (likely.length === 0) return;

        const embed = new EmbedBuilder()
            .setTitle('💡 Wordle — Opener Recommendations')
            .setColor('#3498db')
            .addFields({
                name: '🚀 Best starting words',
                value: likely.map(w => `\`${w}\``).join('  ')
            })
            .addFields({
                name: '💡 Why these?',
                value: 'These 3 words together cover the most common Wordle letters. Use them as your first guesses for maximum information.'
            })
            .setFooter({ text: 'Suggestions will update after each guess result' });

        const mention = userId !== 'unknown' ? `<@${userId}>` : '';
        await channel.send({ content: mention, embeds: [embed] });
        console.log(`[Wordle] 🚀 Opener suggestions sent to ${userId}`);
    } catch (err) {
        console.error('[Wordle] Failed to send opener suggestions:', err.message);
    }
}

// ---------------------------------------------------------------------------
// PARSER
// ---------------------------------------------------------------------------

function parseGameConstraints(message) {
    const extracted = {
        correct: Array(5).fill(null),
        present: new Set(),
        absent: new Set(),
        presentPositions: Array(5).fill().map(() => new Set()),
        allGuessesFound: []
    };

    for (const embed of message.embeds) {
        const textToScan = [embed.author?.name || '', embed.title || '', embed.description || ''].join('\n');
        if (textToScan.includes('How to Play')) continue;

        const emojiRegex = /<:(green|yellow|gray)_([a-z]):\d+>/gi;
        const lines = textToScan.split('\n');

        for (const line of lines) {
            const matches = [...line.matchAll(emojiRegex)];
            if (matches.length !== 5) continue;

            const positiveLetters = new Set();
            matches.forEach(match => {
                if (match[1] !== 'gray') positiveLetters.add(match[2].toLowerCase());
            });

            let reconstructedWord = '';
            matches.forEach((match, pos) => {
                const color = match[1].toLowerCase();
                const letter = match[2].toLowerCase();
                reconstructedWord += letter;

                if (color === 'green') {
                    extracted.correct[pos] = letter;
                } else if (color === 'yellow') {
                    extracted.present.add(letter);
                    extracted.presentPositions[pos].add(letter);
                } else if (color === 'gray') {
                    if (!positiveLetters.has(letter)) extracted.absent.add(letter);
                }
            });

            if (reconstructedWord.length === 5) {
                extracted.allGuessesFound.push(reconstructedWord.toUpperCase());
            }
        }
    }

    return extracted;
}

function buildStateKey(knownState, guessNum) {
    return [
        guessNum,
        knownState.correct.map(l => l || '_').join(''),
        Array.from(knownState.present).sort().join(''),
        Array.from(knownState.absent).sort().join('')
    ].join('|');
}

// ---------------------------------------------------------------------------
// SUGGESTIONS ENGINE
// ---------------------------------------------------------------------------

async function getWordleSuggestions(constraints, session, guessNum) {
    const library = await getWordLibrary();
    const solverResult = solve(constraints, session.guessedWords, guessNum, library);

    session.logBuffer.push(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'SOLVER_RESULT',
        stats: solverResult.stats,
        totalCandidates: solverResult.candidates.length,
        answerCandidates: solverResult.answerCandidates?.length || 0,
        libraryMatchCount: solverResult.candidates.filter(w => library.has(w)).length,
        suggestions: solverResult.suggestions,
        candidates: solverResult.candidates.length <= 20
            ? solverResult.candidates
            : `${solverResult.candidates.length} candidates (top 20): ${solverResult.candidates.slice(0, 20).join(', ')}`
    }, null, 2));

    console.log(`[Wordle Solver] Turn ${guessNum} | ${solverResult.stats.method} | Total: ${solverResult.candidates.length} | Common: ${solverResult.answerCandidates?.length || 0}`);

    return {
        likely: solverResult.suggestions.likely,
        strategic: solverResult.suggestions.strategic,
        isEndgame: solverResult.isEndgame,
        openerMode: solverResult.suggestions.openerMode || false,
        totalCandidates: solverResult.candidates.length,
        answerCandidates: solverResult.answerCandidates?.length || 0
    };
}

// ---------------------------------------------------------------------------
// SESSION MANAGEMENT
// ---------------------------------------------------------------------------

function createFreshSession(playerId, playerTag, guildName, channelName, hasPremium = false) {
    return {
        playerId,
        playerName: playerTag,
        guildName,
        channelName,
        hasPremium,
        logBuffer: [],
        startTime: Date.now(),
        isFinalizing: false,
        isInitializing: false,
        openerSent: false,
        knownState: {
            correct: Array(5).fill(null),
            present: new Set(),
            absent: new Set(),
            presentPositions: Array(5).fill().map(() => new Set())
        },
        guessedWords: new Set()
    };
}

async function finalizeLogSession(client, channelId, reason, winningWord = null) {
    const session = activeSessions.get(channelId);
    if (!session || session.isFinalizing) return;
    session.isFinalizing = true;

    if (reason === 'Win' && winningWord) await saveConfirmedWord(winningWord);

    session.logBuffer.push(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'GAME_RESULT',
        result: reason,
        word: winningWord || 'Unknown'
    }, null, 2));

    await new Promise(res => setTimeout(res, 3000));

    if (session.logBuffer?.length > 0) {
        const duration = Math.floor((Date.now() - session.startTime) / 1000);
        const safeName = session.playerName.replace(/[^a-z0-9]/gi, '') || 'unknown';
        const fileName = `wordle-${safeName}-${Date.now()}.txt`;

        const content = [
            `WORDLE SESSION LOG`,
            `Player: ${session.playerName} (${session.playerId})`,
            `Guild: ${session.guildName}`,
            `Channel: #${session.channelName}`,
            `Status: ${reason}`,
            `Winning Word: ${winningWord || 'Unknown'}`,
            `Duration: ${duration}s`,
            `Logs: ${session.logBuffer.length}`,
            '========================================',
            '',
            ...session.logBuffer.map((entry, i) =>
                `${entry}${i < session.logBuffer.length - 1 ? '\n\n--------------------' : ''}`
            )
        ].join('\n');

        try {
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                await logChannel.send({
                    files: [new AttachmentBuilder(Buffer.from(content), { name: fileName })]
                });
                console.log(`[Wordle] 📋 Log saved: ${fileName}`);
            }
        } catch (err) {
            console.error('[Wordle] Log send failed:', err.message);
        }
    }

    lastSentStateByChannel.delete(channelId);
    activeSessions.delete(channelId);
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------

async function handleWordle(message, isEdit = false) {
    if (message.author?.id !== TARGET_BOT_ID) return;
    if (!isEdit) await new Promise(res => setTimeout(res, 800));
    if (message.partial) await message.fetch(true).catch(() => {});
    if (!message.guild) return;

    const embed = message.embeds[0] || null;
    const combinedText = [
        message.content,
        embed?.author?.name || '',
        embed?.title || '',
        embed?.description || ''
    ].join(' ').toLowerCase();

    // Cooldown message — clear session
    if (combinedText.includes('wait') &&
        (combinedText.includes('second') || combinedText.includes('minute')) &&
        combinedText.includes('play wordle again')) {
        activeSessions.delete(message.channel.id);
        lastSentStateByChannel.delete(message.channel.id);
        return;
    }

    let session = activeSessions.get(message.channel.id);

    // Auto-start session with initializing lock
    if (!session && (combinedText.includes('wordle') || GUESS_REGEX.test(combinedText))) {
        activeSessions.set(message.channel.id, { isInitializing: true });

        const msgs = await message.channel.messages.fetch({ limit: 8 }).catch(() => []);
        const trigger = msgs.find(m => !m.author.bot && WORDLE_COMMAND_REGEX.test(m.content.trim()));

        session = createFreshSession(
            trigger ? trigger.author.id : 'unknown',
            trigger ? trigger.author.tag : 'unknown',
            message.guild.name,
            message.channel.name,
            false
        );
        activeSessions.set(message.channel.id, session);
        console.log(`[Wordle] 🆕 Auto-started session: ${session.playerName}`);
    } else if (session?.isInitializing) {
        return;
    }

    if (!session || session.isFinalizing) return;

    // ----------------------------------------------------------------
    // CHECK GAME OVER FIRST
    // ----------------------------------------------------------------
    const isWin = combinedText.includes('you won');
    const isLoss = LOSS_REGEX.test(combinedText);
    const isGameOver = isWin || isLoss;

    if (isGameOver) {
        let winningWord = null;
        if (isWin && message.embeds.length > 0) {
            const current = parseGameConstraints(message);
            if (current.correct.every(l => l !== null)) {
                winningWord = current.correct.join('').toUpperCase();
            }
        }

        session.logBuffer.push(JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'GAME_OVER_DETECTED',
            result: isWin ? 'Win' : 'Loss',
            winningWord
        }, null, 2));

        await finalizeLogSession(message.client, message.channel.id, isWin ? 'Win' : 'Loss', winningWord);
        return;
    }

    // ----------------------------------------------------------------
    // PARSE CONSTRAINTS
    // ----------------------------------------------------------------
    const match = combinedText.match(GUESS_REGEX);

    if (message.embeds.length > 0) {
        const current = parseGameConstraints(message);

        session.logBuffer.push(JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'PARSER_EXTRACTION',
            extractedThisTurn: {
                greens: current.correct,
                yellows: Array.from(current.present),
                grays: Array.from(current.absent)
            }
        }, null, 2));

        if (!session.knownState.presentPositions) {
            session.knownState.presentPositions = Array(5).fill().map(() => new Set());
        }

        current.correct.forEach((l, i) => { if (l) session.knownState.correct[i] = l; });
        current.present.forEach(l => session.knownState.present.add(l));
        current.absent.forEach(l => session.knownState.absent.add(l));
        current.presentPositions.forEach((set, i) => {
            set.forEach(l => session.knownState.presentPositions[i].add(l));
        });
        current.allGuessesFound.forEach(word => session.guessedWords.add(word));

        session.knownState.present.forEach(l => session.knownState.absent.delete(l));
        session.knownState.correct.forEach(l => { if (l) session.knownState.absent.delete(l); });
    }

    const regexGuessNum = match ? parseInt(match[1], 10) : 0;
    const parsedGuessNum = session.guessedWords.size;

    // ----------------------------------------------------------------
    // OPENER PHASE
    // ----------------------------------------------------------------
    if (parsedGuessNum === 0) {
        if (!session.openerSent) {
            session.openerSent = true;
            await sendOpenerSuggestions(message.channel, session.playerId);
        }
        return;
    }

    // ----------------------------------------------------------------
    // SUGGESTIONS
    // ----------------------------------------------------------------
    const guessNum = Math.max(regexGuessNum, parsedGuessNum);

    if (guessNum > 0) {
        const stateKey = buildStateKey(session.knownState, guessNum);
        const lastState = lastSentStateByChannel.get(message.channel.id);

        // Diag log every event so we can see what's triggering suggestions
        await sendDiagLog(message.client, message.channel.id, `Turn ${guessNum} | isEdit:${isEdit}`, {
            timestamp: new Date().toISOString(),
            guessNum,
            regexGuessNum,
            parsedGuessNum,
            isEdit,
            stateKey,
            lastState,
            willSkip: lastState === stateKey,
            messageId: message.id,
            content: message.content?.substring(0, 100),
            embedTitle: embed?.title || null,
            embedAuthor: embed?.author?.name || null,
            guessedWords: Array.from(session.guessedWords),
            knownState: {
                correct: session.knownState.correct,
                present: Array.from(session.knownState.present),
                absent: Array.from(session.knownState.absent)
            }
        });

        if (lastState === stateKey) {
            console.log(`[Wordle] ⏭️ Skipping duplicate state for turn ${guessNum}`);
            session.logBuffer.push(JSON.stringify({
                timestamp: new Date().toISOString(),
                type: 'DUPLICATE_SKIPPED',
                guessNum,
                stateKey
            }, null, 2));
            return;
        }

        // Claim state synchronously before any await
        lastSentStateByChannel.set(message.channel.id, stateKey);

        try {
            const guildDoc = await db.collection('guilds').doc(message.guild.id).get();
            const premiumId = guildDoc.data()?.config?.premiumRoleId;
            const member = session.playerId !== 'unknown'
                ? await message.guild.members.fetch(session.playerId).catch(() => null)
                : null;

            const hasAccess = member
                ? await checkPremiumAccess(
                    { member, guild: message.guild, isRepliable: () => false, reply: (p) => message.channel.send(p) },
                    premiumId, 'Wordle Solver'
                  )
                : true;

            session.logBuffer.push(JSON.stringify({
                timestamp: new Date().toISOString(),
                type: 'PREMIUM_ACCESS_CHECK',
                hasAccess
            }, null, 2));

            if (hasAccess) {
                const result = await getWordleSuggestions(session.knownState, session, guessNum);
                const {
                    likely = [],
                    strategic = [],
                    isEndgame,
                    openerMode,
                    totalCandidates,
                    answerCandidates
                } = result;

                if (likely.length > 0 || strategic.length > 0) {
                    const replyEmbed = new EmbedBuilder()
                        .setTitle(`💡 Wordle — Turn ${guessNum}`)
                        .setColor(openerMode ? '#3498db' : isEndgame ? '#e67e22' : '#57f287');

                    if (openerMode) {
                        replyEmbed.addFields({
                            name: '🚀 Recommended openers',
                            value: likely.map(w => `\`${w}\``).join('  ')
                        });
                        replyEmbed.addFields({
                            name: '💡 Why these?',
                            value: 'These words together test the most common Wordle letters across all positions.'
                        });
                        replyEmbed.setFooter({ text: '5 guesses left after your opener' });
                    } else if (isEndgame) {
                        const candidateDisplay = answerCandidates > 0 ? answerCandidates : totalCandidates;
                        replyEmbed.addFields({
                            name: `🎯 ${candidateDisplay} possible answer${candidateDisplay !== 1 ? 's' : ''}`,
                            value: likely.map(w => `\`${w}\``).join('  ')
                        });
                        const guessesLeft = 6 - guessNum;
                        replyEmbed.setFooter({ text: `${guessesLeft} guess${guessesLeft !== 1 ? 'es' : ''} left — pick carefully!` });
                    } else {
                        replyEmbed.addFields({
                            name: `✨ Best guesses (${totalCandidates} words remain)`,
                            value: likely.map(w => `\`${w}\``).join('  ')
                        });
                        if (strategic.length > 0) {
                            replyEmbed.addFields({
                                name: '🔍 Test these letters next',
                                value: strategic.map(w => `\`${w}\``).join('  ')
                            });
                        }
                        replyEmbed.setFooter({ text: `${6 - guessNum} guesses left` });
                    }

                    const mention = session.playerId !== 'unknown' ? `<@${session.playerId}>` : '';
                    await message.channel.send({ content: mention, embeds: [replyEmbed] });
                    await recordHelp(session.playerId);
                    await sendNudgeIfDue(message.channel, session.playerId, session.hasPremium);
                }
            }
        } catch (e) {
            console.error('[Wordle] Suggestion error:', e.message);
            lastSentStateByChannel.delete(message.channel.id);
        }
    }
}

// ---------------------------------------------------------------------------
// ENTRY POINTS
// ---------------------------------------------------------------------------

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.guild) return;

        if (!message.author.bot && WORDLE_COMMAND_REGEX.test(message.content.trim())) {
            const session = createFreshSession(
                message.author.id,
                message.author.tag,
                message.guild.name,
                message.channel.name,
                false
            );
            activeSessions.set(message.channel.id, session);
            lastSentStateByChannel.delete(message.channel.id);
            console.log(`[Wordle] 🆕 Session registered for ${message.author.tag}`);
            return;
        }

        await handleWordle(message, false);
    },
    async messageUpdate(oldM, newM) {
        if (!newM.guild) return;
        await handleWordle(newM, true);
    }
};
