import { jidNormalizedUser } from '../baileys.js';
import { downloadMediaMessage } from '../baileys.js';
import { notice, error as errorPanel } from './format.js';
import { maskJid } from './logger.js';
import { getGroupMeta, resolveGroupContext, isSuperUser as checkSuperUser, toUserJid } from './groups.js';
import { check as rateLimitCheck } from './ratelimit.js';
import { remember as rememberMessage } from './messagestore.js';
import { sendButtons, extractButtonId } from './buttons.js';

// Emojis used only as functional acknowledgements when AUTO_REACT is set to
// "commands". Menus and replies stay emoji-free by design.
const COMMAND_REACTIONS = ['✅', '⚡', '💠', '🔄', '📨', '🛠️', '📌', '🔎'];

// Extract the plain text body of a message (conversation, caption or reply text).
export function messageText(message) {
  if (!message) return '';
  const m = extractMessageContent(message);
  if (typeof m.conversation === 'string' && m.conversation.length > 0) return m.conversation;
  for (const key of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'documentWithCaptionMessage']) {
    const part = m[key];
    if (!part || typeof part !== 'object') continue;
    const text = part.text || part.caption;
    if (typeof text === 'string' && text.length > 0) return text;
  }
  return '';
}

// Unwrap the common Baileys container wrappers and return the first content
// entry of the innermost message object.
export function extractMessageContent(message) {
  let m = message;
  for (let i = 0; i < 5 && m && typeof m === 'object'; i++) {
    const wrapperKey = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage']
      .find((k) => m[k] && m[k].message);
    if (!wrapperKey) break;
    m = m[wrapperKey].message;
  }
  return m || {};
}

// True when a status message actually carries media or text (not a bare
// protocol/reaction control message).
export function statusHasContent(message) {
  const m = extractMessageContent(message);
  const controlKeys = new Set(['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage']);
  const keys = Object.keys(m).filter((k) => !controlKeys.has(k));
  if (keys.length === 0) return false;
  const key = keys[0];
  if (key === 'conversation') {
    return typeof m[key] === 'string' && m[key].trim().length > 0;
  }
  if (key === 'extendedTextMessage') {
    return Boolean(m[key] && typeof m[key].text === 'string' && m[key].text.trim().length > 0);
  }
  return ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'contactMessage', 'contactsArrayMessage', 'locationMessage'].includes(key);
}

export function parseCommand(text, prefix) {
  if (typeof text !== 'string' || text.length === 0) return null;
  if (!prefix || !text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length).trim();
  if (!body) return null;
  const parts = body.split(/\s+/);
  const name = parts[0].toLowerCase();
  return { name, args: parts.slice(1), argText: parts.slice(1).join(' ') };
}

function extractMentions(message) {
  const m = extractMessageContent(message);
  for (const part of Object.values(m)) {
    if (part && typeof part === 'object' && Array.isArray(part.contextInfo?.mentionedJid)) {
      return part.contextInfo.mentionedJid.map((j) => jidNormalizedUser(j));
    }
  }
  return [];
}

function quotedKeyOf(msg) {
  const m = extractMessageContent(msg.message);
  for (const part of Object.values(m)) {
    const info = part && typeof part === 'object' ? part.contextInfo : null;
    if (info && info.quotedMessage) {
      return {
        remoteJid: msg.key.remoteJid,
        fromMe: Boolean(info.participantJid ? info.participantJid === null : false),
        id: info.stanzaId || null,
        participant: info.participant ? jidNormalizedUser(info.participant) : null
      };
    }
  }
  return null;
}

export function buildContext({ session, sock, msg, registry, store }) {
  const config = session.config;
  const jid = msg.key.remoteJid;
  const isGroup = Boolean(jid && jid.endsWith('@g.us'));
  const isStatus = jid === 'status@broadcast';
  const isFromMe = Boolean(msg.key.fromMe);
  const sender = isGroup ? jidNormalizedUser(msg.key.participant || jid) : jidNormalizedUser(jid);
  const isOwner = session.isOwner(sender, isFromMe);
  const superUser = isOwner || (!isFromMe && checkSuperUser(session, sender, session.ownJid));
  const quotedRaw = msg.message && msg.message.extendedTextMessage
    ? msg.message.extendedTextMessage.contextInfo?.quotedMessage || null
    : null;
  const inner = extractMessageContent(msg.message);
  const quotedInner = quotedRaw ? extractMessageContent(quotedRaw) : {};

  const reply = async (content, extra = {}) => {
    const payload = typeof content === 'string' ? { text: content } : content;
    return sock.sendMessage(jid, { ...payload, ...extra }, { quoted: msg });
  };
  const react = async (emoji) => sock.sendMessage(jid, { react: { key: msg.key, text: emoji } });
  const del = async (key = null) => sock.sendMessage(jid, { delete: key || msg.key });
  const buttons = (options) => sendButtons(sock, jid, options, msg);
  const download = (mediaMessage, type) => downloadMediaMessage(mediaMessage, 'buffer', { logger: session.logger, reuploadRequest: sock.updateMediaMessage?.bind(sock) });

  return {
    session,
    sock,
    config,
    store: store || session.store || null,
    registry,
    logger: session.logger,
    msg,
    key: msg.key,
    jid,
    sender,
    isGroup,
    isStatus,
    isFromMe,
    isOwner,
    superUser,
    pushName: msg.pushName || '',
    text: messageText(msg.message),
    quoted: quotedRaw,
    quotedMessage: quotedRaw,
    quotedText: messageText(quotedRaw),
    quotedSender: msg.message?.extendedTextMessage?.contextInfo?.participant
      ? jidNormalizedUser(msg.message.extendedTextMessage.contextInfo.participant)
      : null,
    quotedKey: quotedKeyOf(msg),
    mentioned: extractMentions(msg.message),
    buttonId: extractButtonId(msg.message),
    inner,
    quotedInner,
    mediaType: Object.keys(inner).find((k) => ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(k)) || null,
    settings: session.settings,
    setting: (key) => session.settings?.[key],
    packName: session.settings?.PACK_NAME || 'MaloneX',
    packAuthor: session.settings?.PACK_AUTHOR || 'Brian Malone',
    botName: session.settings?.BOT_NAME || 'MaloneX',
    footer: session.settings?.FOOTER || 'MaloneX',
    timeZone: session.settings?.TIME_ZONE || 'Africa/Nairobi',
    prefix: session.settings?.PREFIX || config.prefix,
    command: null,
    args: [],
    argText: '',
    groupMeta: null,
    adminNums: [],
    isAdmin: false,
    isBotAdmin: false,
    isSuperAdmin: false,
    reply,
    react,
    del,
    buttons,
    download,
    jidOf: toUserJid
  };
}

// Attach the group permission surface to an already built context. Kept out of
// buildContext so tests can build contexts without touching the network.
export async function attachGroupContext(ctx) {
  if (!ctx.isGroup) return ctx;
  try {
    const meta = await getGroupMeta(ctx.sock, ctx.jid);
    const resolved = resolveGroupContext(meta, { jid: ctx.jid, sender: ctx.sender, botJid: ctx.session.ownJid });
    ctx.groupMeta = resolved.meta;
    ctx.groupName = resolved.groupName;
    ctx.participants = resolved.participants;
    ctx.adminNums = resolved.adminNums;
    ctx.isAdmin = resolved.senderIsAdmin;
    ctx.isBotAdmin = resolved.botIsAdmin;
    ctx.isSuperAdmin = resolved.senderIsSuperAdmin;
    ctx.tag = (text, extra = {}) => ctx.sock.sendMessage(ctx.jid, {
      text,
      mentions: resolved.participants.map((p) => p.pn || p.phoneNumber || p.id).filter(Boolean),
      ...extra
    }, { quoted: ctx.msg });
  } catch (err) {
    ctx.logger.warn(`group context failed [${maskJid(ctx.jid)}]: ${err.message}`);
  }
  return ctx;
}

// Run every registered message hook. Hooks run for EVERY incoming message,
// including status@broadcast, before command parsing. A throwing hook must
// never break the session: errors are counted and logged with a masked id.
export async function runMessageHooks(ctx) {
  const hooks = ctx.registry && Array.isArray(ctx.registry.hooks) ? ctx.registry.hooks : [];
  for (const hook of hooks) {
    if (!hook || hook.hook !== 'message' || typeof hook.run !== 'function') continue;
    try {
      await hook.run(ctx);
    } catch (err) {
      ctx.session.health.errors += 1;
      ctx.session.health.lastError = err.message;
      ctx.logger.warn(`message hook failed [${maskJid(ctx.session.id)}]: ${err.message}`);
    }
  }
}

// Effective access mode: settings.MODE overrides the environment value.
export function effectivePublicMode(session) {
  const mode = session.settings?.MODE;
  if (mode === 'public') return true;
  if (mode === 'private') return false;
  return Boolean(session.config.publicMode);
}



// NOTE: Unlike bots that register many parallel handlers on the same event
// (and therefore need id-based deduplication), MaloneX routes every message
// through this single pipeline exactly once per upsert. Baileys replays are
// filtered upstream by the upsert type check in session.onMessages.

export async function processMessage(session, sock, msg, { registry, store } = {}) {
  if (!session || !sock || !msg || !msg.key || !msg.message) return;

  // Keep a rolling copy of recent messages for anti-delete / anti-edit.
  const groupSeed = msg.key.remoteJid?.endsWith('@g.us');
  rememberMessage(msg, {
    sender: groupSeed ? jidNormalizedUser(msg.key.participant || '') : jidNormalizedUser(msg.key.remoteJid || ''),
    pushName: msg.pushName || ''
  });

  session.health.messagesSeen += 1;
  const ctx = buildContext({ session, sock, msg, registry, store });
  await attachGroupContext(ctx);

  // 1. Hooks first, for every message including statuses.
  await runMessageHooks(ctx);

  // 2. Statuses never run commands.
  if (ctx.isStatus) return;

  // 3. Private mode: only owners and sudo numbers may use the bot.
  if (!ctx.superUser && !effectivePublicMode(session)) return;

  // 4. PM permit: when enabled, non-owners writing in private chat get one
  //    notice per chat and are ignored afterwards.
  if (session.settings?.PM_PERMIT && !ctx.isGroup && !ctx.superUser) {
    await handlePmPermit(ctx);
    return;
  }

  // 5. Command parsing.
  const prefix = session.settings?.PREFIX || session.config.prefix;
  const parsed = parseCommand(ctx.text, prefix);
  if (!parsed) return;
  const cmd = registry ? registry.find(parsed.name) : null;

  if (!cmd) {
    if (!ctx.isGroup) {
      await ctx.reply(notice(`Unknown command. Send ${prefix}menu to see what is available.`));
    }
    return;
  }

  ctx.command = parsed.name;
  ctx.args = parsed.args;
  ctx.argText = parsed.argText;

  // 6. Permission gates.
  if (cmd.access === 'owner' && !ctx.superUser) {
    await ctx.reply(notice('This command is restricted to the account owner.'));
    return;
  }
  if (cmd.access === 'admin' && !ctx.superUser && !(ctx.isGroup && ctx.isAdmin)) {
    await ctx.reply(notice(ctx.isGroup
      ? 'This command is restricted to group admins.'
      : 'This command is restricted to admins of a group.'));
    return;
  }
  if (cmd.groupOnly && !ctx.isGroup) {
    await ctx.reply(notice('This command only works inside a group.'));
    return;
  }

  // 7. Rate limit per sender and command (super users bypass).
  const limited = rateLimitCheck({
    chat: ctx.jid,
    sender: ctx.sender,
    command: cmd.name,
    bypass: ctx.superUser
  });
  if (!limited.ok) {
    await ctx.reply(notice(`Slow down. Try again in ${limited.waitSeconds}s.`));
    return;
  }

  // 8. Optional acknowledgement reaction.
  if (session.settings?.AUTO_REACT === 'commands') {
    const emoji = COMMAND_REACTIONS[Math.floor(Math.random() * COMMAND_REACTIONS.length)];
    await ctx.react(emoji).catch(() => {});
  }

  try {
    await cmd.run(ctx);
    session.health.commandsHandled += 1;
  } catch (err) {
    session.health.errors += 1;
    session.health.lastError = err.message;
    session.logger.error(`command "${cmd.name}" failed: ${err.message}`);
    await ctx.reply(errorPanel('The command could not be completed. The details are available in the session diagnostics.')).catch(() => {});
  }
}

const pmPermitNotified = new Set();

async function handlePmPermit(ctx) {
  if (pmPermitNotified.has(ctx.sender)) return;
  pmPermitNotified.add(ctx.sender);
  await ctx.reply(notice('This account is protected by MaloneX. Your message was not forwarded. The owner may reply if your message matters.')).catch(() => {});
}

export function resetPmPermitNotified() {
  pmPermitNotified.clear();
}
