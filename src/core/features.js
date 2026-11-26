// Auto-features and chat protections. Everything here runs outside the command
// pipeline: message-scoped behaviour flows through onMessage (called before
// command processing), event-scoped behaviour through the register() listener
// setup. A failure in any feature must never break the session.
import { jidNormalizedUser } from '../baileys.js';
import { downloadMediaMessage } from '../baileys.js';
import { maskJid } from './logger.js';
import { panel, notice } from './format.js';
import { isSuperUser, digits } from './groups.js';
import { readGroupSettings, getBadWords, containsBadWord, addWarning, resetWarnings } from './groupsettings.js';
import { remember as rememberForGames } from './messagestore.js';
import { chatComplete, aiConfigured } from './ai.js';
import { fetchJson, sleep } from './media.js';
import { findWcgWord, aiThinkingDelay, AI_PLAYER as AI_WCG_PLAYER } from './games/ai.js';
import { getGame, saveGame, deleteGame } from './games/store.js';
import { findBestTttMove, joinTtt, tttMove, renderTttBoard, TTT_AI } from './games/engine.js';

const REACTION_POOL = ['✨', '🌟', '💫', '⚡', '🔥', '💙', '🤍', '🌸', '🎯', '🌀'];

// ---------- shared helpers ----------

function bodyOf(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return '';
}

function viewOnceInner(message) {
  const m = message || {};
  for (const key of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
    if (m[key]?.message) {
      const inner = m[key].message;
      const mediaKey = Object.keys(inner).find((k) => ['imageMessage', 'videoMessage', 'audioMessage'].includes(k));
      if (mediaKey) return { mediaKey, content: inner[mediaKey] };
    }
  }
  for (const key of ['imageMessage', 'videoMessage', 'audioMessage']) {
    if (m[key]?.viewOnce) return { mediaKey: key, content: m[key] };
  }
  return null;
}

function resolveSender(msg) {
  const key = msg.key || {};
  const raw = key.participantPn || key.senderPn || key.participant || msg.participant || key.remoteJid;
  return raw ? jidNormalizedUser(raw) : null;
}

async function safe(sock, fn, label, session) {
  try {
    return await fn();
  } catch (err) {
    if (session) {
      session.health.errors += 1;
      session.health.lastError = err.message;
      session.logger.warn(`${label} failed [${maskJid(session.id)}]: ${err.message}`);
    }
    return null;
  }
}

// ---------- per-message features ----------

export async function onMessage(session, sock, msg, { registry } = {}) {
  if (!msg?.message || !msg?.key) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;
  const isGroup = jid.endsWith('@g.us');
  const fromMe = Boolean(msg.key.fromMe);
  const sender = resolveSender(msg);
  const body = bodyOf(msg);
  const settings = session.settings || {};

  try {
    // 1. Auto read (modes).
    const readMode = settings.AUTO_READ_MESSAGES || 'off';
    const shouldRead = readMode === 'all' || readMode === 'true'
      || (readMode === 'dm' && !isGroup)
      || (readMode === 'groups' && isGroup);
    if (shouldRead) await safe(sock, () => sock.readMessages([msg.key]), 'auto-read', session);

    // 2. Presence (typing / recording / online).
    const presence = isGroup ? settings.GC_PRESENCE : settings.DM_PRESENCE;
    if (presence && presence !== 'offline') {
      const map = { online: 'available', typing: 'composing', recording: 'recording' };
      await safe(sock, () => sock.sendPresenceUpdate(map[presence] || 'available', jid), 'presence', session);
    }

    // 3. Auto react (random emoji from the pool).
    const reactMode = settings.AUTO_REACT || 'off';
    const shouldReact = !fromMe && (
      reactMode === 'all' || reactMode === 'true'
      || (reactMode === 'dm' && !isGroup)
      || (reactMode === 'groups' && isGroup)
    );
    if (shouldReact) {
      const emoji = REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)];
      await safe(sock, () => sock.sendMessage(jid, { react: { key: msg.key, text: emoji } }), 'auto-react', session);
    }

    // 4. Auto block by country code (private chats only).
    if (!isGroup && !fromMe && settings.AUTO_BLOCK && sender && !isSuperUser(session, sender, session.ownJid)) {
      const codes = String(settings.AUTO_BLOCK).split(',').map((c) => c.trim()).filter(Boolean);
      const num = digits(sender);
      if (num && codes.some((code) => num.startsWith(code))) {
        await safe(sock, () => sock.updateBlockStatus(sender, 'block'), 'auto-block', session);
        return;
      }
    }

    // 5. Anti view-once: reveal media automatically.
    if (settings.ANTIVIEWONCE && settings.ANTIVIEWONCE !== 'off' && !fromMe) {
      const found = viewOnceInner(msg.message);
      if (found) await safe(sock, () => revealViewOnce(session, sock, msg, jid, sender, found), 'anti-viewonce', session);
    }

    // 6. Group protections (antilink, antibadwords, anti status-mention).
    if (isGroup && !fromMe && sender) {
      await safe(sock, () => runGroupProtections(session, sock, msg, jid, sender, body), 'group-protections', session);
    }

    // 7. Chatbot (only for non-command text).
    if (!fromMe && !body.startsWith(session.settings?.PREFIX || session.config.prefix) && body.length > 0) {
      const botMode = settings.CHATBOT || 'off';
      const scope = settings.CHATBOT_MODE || 'inbox';
      const inScope = scope === 'allchats' || (scope === 'inbox' && !isGroup) || (scope === 'groups' && isGroup);
      if (botMode !== 'off' && inScope && aiConfigured(settings)) {
        await safe(sock, () => runChatbot(session, sock, msg, jid, body, botMode), 'chatbot', session);
      }
    }

    // 8. Newsletter auto-react (channel bridge, optional).
    const newsletterJid = settings.NEWSLETTER_JID;
    if (!fromMe && newsletterJid && jid === newsletterJid && msg.key.server_id) {
      await safe(sock, () => sock.newsletterReactMessage(jid, String(msg.key.server_id), '💙'), 'newsletter-react', session);
    }

    // 9. Bare-message game input (join / roll / numbers / wcg words).
    if (body && registry) {
      await safe(sock, () => handleGameInput(session, sock, msg, jid, sender, body, registry), 'game-input', session);
    }
  } catch (err) {
    session.health.errors += 1;
    session.health.lastError = err.message;
    session.logger.warn(`feature pipeline failed [${maskJid(session.id)}]: ${err.message}`);
  }
}

// ---------- view-once reveal ----------

async function revealViewOnce(session, sock, msg, jid, sender, found) {
  const settings = session.settings || {};
  const target = settings.ANTIVIEWONCE === 'inchat' ? jid : (session.ownJid || jid);
  const mediaMsg = { key: msg.key, message: { [found.mediaKey]: { ...found.content, viewOnce: false } } };
  const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {
    logger: session.logger,
    reuploadRequest: sock.updateMediaMessage?.bind(sock)
  });
  if (!buffer || !buffer.length) return;
  const senderNum = (sender || '').split('@')[0];
  const caption = `View-once media revealed. Sender: ${senderNum ? `+${senderNum}` : 'unknown'}.`;
  const payload = found.mediaKey.includes('image')
    ? { image: buffer, caption }
    : found.mediaKey.includes('video')
      ? { video: buffer, caption }
      : { audio: buffer, ptt: true, mimetype: found.content.mimetype || 'audio/mp4' };
  await sock.sendMessage(target, payload);
}

// ---------- group protections ----------

const linkPattern = /(https?:\/\/[^\s]+)|(^|\s)(www\.[a-z0-9-]+\.[a-z]{2,}[^\s]*)|((chat\.whatsapp\.com|wa\.me|t\.me|youtu\.be|bit\.ly|tinyurl\.com|goo\.gl)\/[^\s]*)/i;

async function runGroupProtections(session, sock, msg, jid, sender, body) {
  const settings = await readGroupSettings(session.store, session.id, jid);
  const senderNum = digits(sender);
  const ownerLike = isSuperUser(session, sender, session.ownJid);

  // Anti status-mention (group mentioned in a status).
  if (Object.keys(msg.message || {}).includes('groupStatusMentionMessage')) {
    const mode = settings.ANTIGROUPMENTION;
    if (mode !== 'off') {
      const acted = await enforceProtection(session, sock, msg, jid, sender, mode, 'antigroupmention', Number(settings.ANTIGROUPMENTION_WARN_COUNT) || 3, 'mentioning this group in a status');
      if (acted) return;
    }
  }

  // Antilink.
  if (settings.ANTILINK !== 'off' && body && linkPattern.test(body)) {
    await enforceProtection(session, sock, msg, jid, sender, settings.ANTILINK, 'antilink', Number(settings.ANTILINK_WARN_COUNT) || 5, 'posting links', ownerLike);
    return;
  }

  // Anti bad words.
  if (settings.ANTIBAD !== 'off' && body) {
    const words = await getBadWords(session.store, session.id, jid);
    const hit = containsBadWord(body, words);
    if (hit) {
      await enforceProtection(session, sock, msg, jid, sender, settings.ANTIBAD, 'antibad', Number(settings.ANTIBAD_WARN_COUNT) || 5, `using a prohibited word (${hit})`, ownerLike);
    }
  }
}

async function enforceProtection(session, sock, msg, jid, sender, mode, kind, warnLimit, reason, ownerLike = false) {
  const senderNum = digits(sender);
  const mention = { mentions: [sender] };

  if (ownerLike) {
    await sock.sendMessage(jid, {
      text: notice(`Protection "${kind}" detected an offence from +${senderNum}, but super users are exempt.`),
      ...mention
    }, { quoted: msg });
    return true;
  }

  // Try to remove the offending message first (delete/warn/kick all do).
  if (mode !== 'off') {
    await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
  }

  if (mode === 'delete') {
    await sock.sendMessage(jid, { text: notice(`+${senderNum}: ${reason} is not allowed here. The message was removed.`), ...mention }, { quoted: msg }).catch(() => {});
    return true;
  }

  if (mode === 'kick') {
    try {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      await sock.sendMessage(jid, { text: notice(`+${senderNum} was removed: ${reason}.`), ...mention }).catch(() => {});
    } catch {
      await sock.sendMessage(jid, { text: notice(`Could not remove +${senderNum} (${reason}).`), ...mention }).catch(() => {});
    }
    return true;
  }

  if (mode === 'warn' || mode === 'on' || mode === 'true') {
    const count = await addWarning(session.store, session.id, jid, sender, kind);
    if (count >= warnLimit) {
      try {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        await resetWarnings(session.store, session.id, jid, sender, kind);
        await sock.sendMessage(jid, { text: notice(`+${senderNum} reached ${count}/${warnLimit} warnings and was removed. Reason: ${reason}.`), ...mention }).catch(() => {});
      } catch {
        await sock.sendMessage(jid, { text: notice(`+${senderNum} has ${count}/${warnLimit} warnings but could not be removed.`), ...mention }).catch(() => {});
      }
    } else {
      await sock.sendMessage(jid, { text: notice(`Warning ${count}/${warnLimit} for +${senderNum}. Reason: ${reason}.`), ...mention }, { quoted: msg }).catch(() => {});
    }
    return true;
  }
  return false;
}

// ---------- chatbot ----------

async function runChatbot(session, sock, msg, jid, body, botMode) {
  const settings = session.settings || {};
  const answer = await chatComplete(settings, body);
  if (!answer) return;
  if (botMode === 'audio') {
    // Google Translate TTS via its public endpoint, no key required.
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(answer.slice(0, 190))}&tl=en&client=tw-ob`;
    await sock.sendMessage(jid, { audio: { url: ttsUrl }, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: answer }, { quoted: msg });
  }
}

// ---------- bare-message game input ----------

async function handleGameInput(session, sock, msg, jid, sender, body, registry) {
  if (!session.store) return;
  const game = await getGame(session.store, session.id, jid);
  if (!game) return;
  const lower = body.trim().toLowerCase();
  const footer = `Use the game commands to control the game.`;

  if (game.kind === 'ttt') {
    const num = Number.parseInt(lower, 10);
    if (Number.isInteger(num) && num >= 1 && num <= 9) {
      if (game.status !== 'active' || (game.player1 !== sender && game.player2 !== sender)) return;
      const result = tttMove(game, sender, num);
      if (result.error) return;
      await saveGame(session.store, session.id, jid, result.state);
      if (result.winner) {
        await deleteGame(session.store, session.id, jid);
        await sock.sendMessage(jid, { text: panel('Tic Tac Toe', [`Winner: +${result.winner.split('@')[0]} (${result.symbol})`, '', renderTttBoard(result.state.board)]), mentions: [result.winner] });
        return;
      }
      if (result.draw) {
        await deleteGame(session.store, session.id, jid);
        await sock.sendMessage(jid, { text: panel('Tic Tac Toe', ['The game ended in a draw.', '', renderTttBoard(result.state.board)]) });
        return;
      }
      if (result.state.isAi && result.state.currentTurn === TTT_AI) {
        await aiThinkingDelay(800);
        const move = findBestTttMove(result.state.board);
        if (move !== -1) {
          const aiResult = tttMove(result.state, TTT_AI, move + 1);
          await saveGame(session.store, session.id, jid, aiResult.state);
          if (aiResult.winner || aiResult.draw) {
            await deleteGame(session.store, session.id, jid);
            await sock.sendMessage(jid, { text: panel('Tic Tac Toe', [aiResult.winner ? 'The AI won this round.' : 'The game ended in a draw.', '', renderTttBoard(aiResult.state.board)]) });
            return;
          }
          await sock.sendMessage(jid, { text: panel('Tic Tac Toe', [`AI played ${move + 1}. Your turn (X).`, '', renderTttBoard(aiResult.state.board)]) });
          return;
        }
      }
      await sock.sendMessage(jid, {
        text: panel('Tic Tac Toe', [`Player 1: +${result.state.player1.split('@')[0]} (X)`, `Player 2: +${result.state.player2.split('@')[0]} (O)`, '', renderTttBoard(result.state.board), '', `Turn: +${result.state.currentTurn.split('@')[0]}`, 'Reply with a number 1-9 to move.']),
        mentions: [result.state.currentTurn]
      });
      return;
    }
    if (lower === 'join' && game.status === 'waiting') {
      const result = joinTtt(game, sender);
      if (result.error) return;
      await saveGame(session.store, session.id, jid, result.state);
      await sock.sendMessage(jid, {
        text: panel('Tic Tac Toe', [`Player 1: +${result.state.player1.split('@')[0]} (X)`, `Player 2: +${result.state.player2.split('@')[0]} (O)`, '', renderTttBoard(result.state.board), '', `Turn: +${result.state.currentTurn.split('@')[0]}`, 'Reply with a number 1-9 to move.']),
        mentions: [result.state.player1, result.state.player2]
      });
    }
    return;
  }

  if (game.kind === 'dice' && lower === 'roll') {
    if (game.status !== 'active' || (game.player1 !== sender && game.player2 !== sender)) return;
    const { diceRoll } = await import('./games/engine.js');
    const result = diceRoll(game, sender);
    if (result.error) return;
    await saveGame(session.store, session.id, jid, result.state);
    const rows = [
      `Round ${result.currentRound} of ${game.rounds}`,
      `+${game.player1.split('@')[0]}: ${result.player1Roll ?? '-'}`,
      `+${game.player2.split('@')[0]}: ${result.player2Roll ?? '-'}`
    ];
    if (result.roundComplete || result.gameFinished) {
      if (result.roundWinner) rows.push(`Round winner: +${result.roundWinner.split('@')[0]}`);
      rows.push(`Score ${result.player1Score} : ${result.player2Score}`);
      if (result.gameFinished) {
        await deleteGame(session.store, session.id, jid);
        rows.push(result.gameWinner ? `Match winner: +${result.gameWinner.split('@')[0]}` : 'The match ended in a tie.');
      } else {
        rows.push('Type roll to continue.');
      }
    } else {
      rows.push(`Waiting for +${result.waitingFor.split('@')[0]} to roll.`);
    }
    await sock.sendMessage(jid, { text: panel('Dice', rows) });
    return;
  }

  if (game.kind === 'wcg' && game.status === 'active' && game.players.includes(sender)) {
    const word = lower.split(/\s+/)[0];
    if (!/^[a-z]{2,}$/.test(word)) return;
    const { submitWcgWord } = await import('./games/engine.js');
    const result = submitWcgWord(game, sender, word);
    if (result.error === 'word_used') await sock.sendMessage(jid, { text: notice(`"${word}" was already used.`) });
    else if (result.error === 'wrong_letter') await sock.sendMessage(jid, { text: notice(`The word must start with "${result.expected.toUpperCase()}".`) });
    else if (result.error === 'invalid_word') await sock.sendMessage(jid, { text: notice(`"${word}" is not accepted by the word checker.`) });
    if (result.error) return;
    await saveGame(session.store, session.id, jid, result.state);
    // Hand the turn to the AI opponent when it is the AI's move.
    if (result.state.currentTurn === AI_WCG_PLAYER) {
      await aiWcgMove(session, sock, jid, result.state);
      return;
    }
    const rows = [`Accepted: ${result.word} (+${result.word.length} pts)`, `Next starts with: "${result.word.slice(-1).toUpperCase()}"`, `Turn: +${result.state.currentTurn.split('@')[0]}`];
    await sock.sendMessage(jid, { text: panel('Word Chain', rows), mentions: result.state.currentTurn ? [result.state.currentTurn] : [] });
  }
}

// ---------- event-scoped features ----------

const bioTimers = new Map();

export function register(session, sock) {
  // Anti-delete.
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        const protocol = msg.message?.protocolMessage || msg.message?.ephemeralMessage?.message?.protocolMessage;
        if (!protocol || protocol.type !== 0 || !protocol.key) continue;
        if (msg.key.fromMe) continue;
        const settings = session.settings || {};
        const mode = settings.ANTIDELETE || 'off';
        if (mode === 'off') continue;
        const entry = takeDeletedEntry(session, protocol.key);
        if (!entry) continue;
        const jid = protocol.key.remoteJid;
        const target = mode === 'inchat' ? jid : session.ownJid;
        await sendRecovered(session, sock, target, entry, 'deleted');
      } catch (err) {
        session.health.errors += 1;
        session.logger.warn(`anti-delete failed [${maskJid(session.id)}]: ${err.message}`);
      }
    }
  });

  // Anti-edit.
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates || []) {
      try {
        if (update.key?.fromMe) continue;
        const settings = session.settings || {};
        const mode = settings.ANTI_EDIT || 'off';
        if (mode === 'off') continue;
        const edited = update.update?.message?.editedMessage?.message;
        if (!edited) continue;
        const original = takeDeletedEntry(session, update.key, { peek: true });
        const newText = edited.conversation || edited.extendedTextMessage?.text
          || edited.imageMessage?.caption || edited.videoMessage?.caption || '';
        const oldText = original ? (original.message?.conversation || original.message?.extendedTextMessage?.text || '') : '(not stored)';
        const target = mode === 'inchat' ? update.key.remoteJid : session.ownJid;
        await sock.sendMessage(target, {
          text: panel('Edited message', [
            `Chat: ${maskJid(update.key.remoteJid)}`,
            `Before: ${oldText || '(media or empty)'}`,
            `After: ${newText || '(media or empty)'}`
          ])
        }).catch(() => {});
      } catch (err) {
        session.logger.warn(`anti-edit failed [${maskJid(session.id)}]: ${err.message}`);
      }
    }
  });

  // Anti-call.
  sock.ev.on('call', async (calls) => {
    const mode = session.settings?.ANTICALL || 'off';
    if (mode === 'off') return;
    for (const call of calls || []) {
      if (call.status !== 'offer') continue;
      await safe(sock, async () => {
        await sock.rejectCall(call.id, call.from);
        if (mode === 'block') await sock.updateBlockStatus(call.from, 'block');
        await sock.sendMessage(call.from, { text: notice('Calls are not accepted on this account. Please send a message instead.') }).catch(() => {});
      }, 'anti-call', session);
    }
  });

  // Group events: welcome, goodbye, promote/demote announcements, anti-promote.
  sock.ev.on('group-participants.update', async (event) => {
    await safe(sock, () => onGroupParticipants(session, sock, event), 'group-events', session);
  });

  // Auto bio.
  if (session.settings?.AUTO_BIO) {
    startAutoBio(session, sock);
  }
}

// Imported lazily to avoid a cycle with messagestore.
import { takeDeleted as takeDeletedEntry, find as findEntry } from './messagestore.js';

async function sendRecovered(session, sock, target, entry, label) {
  const senderNum = (entry.sender || '').split('@')[0];
  const time = new Date(entry.at).toISOString().replace('T', ' ').slice(0, 19);
  const m = entry.message || {};
  if (m.conversation || m.extendedTextMessage?.text) {
    const text = m.conversation || m.extendedTextMessage.text;
    await sock.sendMessage(target, { text: panel(`Recovered ${label} message`, [`Sender: ${senderNum ? `+${senderNum}` : 'unknown'}`, `Time: ${time}`, '', text]) });
    return;
  }
  const mediaKey = Object.keys(m).find((k) => ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(k));
  if (!mediaKey) return;
  try {
    const buffer = await downloadMediaMessage({ key: entry.key, message: entry.message }, 'buffer', {
      logger: session.logger,
      reuploadRequest: sock.updateMediaMessage?.bind(sock)
    });
    if (!buffer?.length) return;
    const payload = mediaKey === 'imageMessage'
      ? { image: buffer }
      : mediaKey === 'videoMessage'
        ? { video: buffer }
        : mediaKey === 'audioMessage'
          ? { audio: buffer, mimetype: m[mediaKey]?.mimetype }
          : mediaKey === 'stickerMessage'
            ? { sticker: buffer }
            : { document: buffer, fileName: m[mediaKey]?.fileName || 'media', mimetype: m[mediaKey]?.mimetype };
    await sock.sendMessage(target, payload);
    await sock.sendMessage(target, { text: panel(`Recovered ${label} media`, [`Sender: ${senderNum ? `+${senderNum}` : 'unknown'}`, `Time: ${time}`, m[mediaKey]?.caption ? `Caption: ${m[mediaKey].caption}` : ''].filter(Boolean)) }).catch(() => {});
  } catch (err) {
    await sock.sendMessage(target, { text: notice(`A ${label} message could not be recovered: ${err.message}`) }).catch(() => {});
  }
}

const seenGroupEvents = new Set();

async function onGroupParticipants(session, sock, event) {
  const { id: jid, participants, action, author } = event;
  if (!jid || !Array.isArray(participants)) return;
  const eventKey = `${jid}:${action}:${participants.map((p) => String(p)).sort().join(',')}`;
  if (seenGroupEvents.has(eventKey)) return;
  seenGroupEvents.add(eventKey);
  if (seenGroupEvents.size > 300) {
    for (const key of seenGroupEvents) seenGroupEvents.delete(key);
  }

  const settings = await readGroupSettings(session.store, session.id, jid);
  const names = participants.map((p) => `+${digits(jidNormalizedUser(p))}`).join(', ');
  const mentions = participants.map((p) => jidNormalizedUser(p));

  const fillTemplate = (text, extra = {}) => String(text || '')
    .replace(/{user}/g, names)
    .replace(/{group}/g, session.lastGroupName || '')
    .replace(/{count}/g, String(extra.count ?? ''))
    .replace(/{actor}/g, `+${digits(author || '')}`);

  if (action === 'add' && settings.WELCOME_MESSAGE === 'on') {
    const custom = settings.WELCOME_TEXT;
    const text = custom && custom.length > 0
      ? fillTemplate(custom, { count: await groupCount(sock, jid) })
      : `Welcome ${names}. This group now has ${await groupCount(sock, jid)} members.`;
    await sock.sendMessage(jid, { text, mentions }).catch(() => {});
    return;
  }

  if (action === 'remove' && settings.GOODBYE_MESSAGE === 'on') {
    const custom = settings.GOODBYE_TEXT;
    const text = custom && custom.length > 0
      ? fillTemplate(custom)
      : `${names} has left the group.`;
    await sock.sendMessage(jid, { text, mentions }).catch(() => {});
    return;
  }

  if ((action === 'promote' || action === 'demote') && settings.GROUP_EVENTS === 'on') {
    const verb = action === 'promote' ? 'is now an admin' : 'is no longer an admin';
    const actor = author ? ` (by +${digits(author)})` : '';
    await sock.sendMessage(jid, { text: `${names} ${verb}${actor}.`, mentions }).catch(() => {});
  }

  // Anti-promote / anti-demote enforcement.
  if (action === 'promote' && settings.ANTIPROMOTE === 'on' && author) {
    const authorJid = jidNormalizedUser(author);
    if (!isSuperUser(session, authorJid, session.ownJid)) {
      await sock.groupParticipantsUpdate(jid, [authorJid], 'demote').catch(() => {});
      await sock.sendMessage(jid, { text: notice(`Anti-promote: +${digits(authorJid)} was demoted again. Promotions are not allowed by group members.`), mentions: [authorJid] }).catch(() => {});
    }
  }
  if (action === 'demote' && settings.ANTIDEMOTE === 'on' && author) {
    const authorJid = jidNormalizedUser(author);
    if (!isSuperUser(session, authorJid, session.ownJid)) {
      await sock.groupParticipantsUpdate(jid, [authorJid], 'demote').catch(() => {});
      for (const p of participants) {
        await sock.groupParticipantsUpdate(jid, [jidNormalizedUser(p)], 'promote').catch(() => {});
      }
      await sock.sendMessage(jid, { text: notice(`Anti-demote: the removed admins were restored and +${digits(authorJid)} was demoted.`) }).catch(() => {});
    }
  }
}

async function groupCount(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta?.participants?.length ?? '?';
  } catch {
    return '?';
  }
}

export function startAutoBio(session, sock) {
  const key = session.id;
  if (bioTimers.has(key)) return;
  const update = async () => {
    try {
      const hour = new Date().getHours();
      const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 21 ? 'Good evening' : 'Good night';
      const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: session.settings?.TIME_ZONE || 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date());
      await sock.updateProfileStatus(`${session.settings?.BOT_NAME || 'MaloneX'} online | ${part} | ${stamp}`).catch(() => {});
    } catch {
      // Bio updates are best effort.
    }
  };
  update();
  bioTimers.set(key, setInterval(update, 60000));
}

export function stopAutoBio(sessionId) {
  const timer = bioTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    bioTimers.delete(sessionId);
  }
}

// WCG AI move helper used by the games plugin.
export async function aiWcgMove(session, sock, jid, game) {
  await aiThinkingDelay(1200);
  const fresh = await getGame(session.store, session.id, jid);
  if (!fresh || fresh.status !== 'active' || fresh.currentTurn !== AI_PLAYER) return;
  const word = await findWcgWord(fresh.lastWord, fresh.usedWords);
  const { submitWcgWord } = await import('./games/engine.js');
  if (!word) {
    const human = fresh.players.find((p) => p !== AI_PLAYER);
    await sock.sendMessage(jid, { text: `The AI could not find a word. Winner: +${human?.split('@')[0]}` }).catch(() => {});
    await deleteGame(session.store, session.id, jid);
    return;
  }
  const result = submitWcgWord(fresh, AI_PLAYER, word);
  if (result.error) return;
  await saveGame(session.store, session.id, jid, result.state);
  await sock.sendMessage(jid, { text: `AI played: ${result.word}. Next starts with "${result.word.slice(-1).toUpperCase()}". Turn: +${result.nextPlayer?.split('@')[0]}`, mentions: result.nextPlayer ? [result.nextPlayer] : [] }).catch(() => {});
}

export { rememberForGames as rememberGameSeed, sleep };
