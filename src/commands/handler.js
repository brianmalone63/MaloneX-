// Message processing: hooks run on every message (including
// status@broadcast); commands are parsed after that. Strangers get no reply
// unless MODE=public; unknown commands are silent; a crashing command
// replies with a reference code and the stack goes to the log under that
// reference.
import crypto from 'node:crypto';
import { panel, errorPanel, commandReference } from './format.js';
import { downloadMediaMessage } from '../baileys.js';

const COMMAND_REF_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newReference() {
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (const byte of bytes) out += COMMAND_REF_ALPHABET[byte % COMMAND_REF_ALPHABET.length];
  return out;
}

// Text extraction across the common message shapes.
export function extractText(msg) {
  if (!msg?.message) return null;
  const m = msg.message;
  const candidates = [
    m.conversation,
    m.extendedTextMessage?.text,
    m.imageMessage?.caption,
    m.videoMessage?.caption,
    m.documentMessage?.caption,
    m.buttonsResponseMessage?.selectedButtonId,
    m.listResponseMessage?.singleSelectReply?.selectedRowId
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export async function processMessage(session, sock, msg, { registry, config }) {
  // Hooks: every message, including status@broadcast, wrapped so a broken
  // hook can never break the pipeline.
  for (const hook of registry.hookPlugins) {
    try {
      await hook.runHook({ session, sock, msg });
    } catch (err) {
      session.logError(`hook "${hook.name}" failed: ${err.message}`);
    }
  }

  const jid = msg?.key?.remoteJid;
  if (!jid || jid === 'status@broadcast') return; // No commands from statuses.

  const text = extractText(msg);
  if (!text) return;

  const prefix = config.prefix;
  if (!text.startsWith(prefix)) return;

  const body = text.slice(prefix.length).trim();
  if (!body) return;
  const [rawName, ...args] = body.split(/\s+/);
  const plugin = registry.resolve(rawName.toLowerCase());
  if (!plugin) return; // Unknown commands stay silent.

  const fromMe = msg.key.fromMe === true;
  const owner = session.isOwner(jid, fromMe);
  // Strangers get no reply unless MODE=public; owner-only commands stay
  // owner-only even then.
  if (!owner) {
    if (config.mode !== 'public') return;
    if (plugin.access === 'owner') return;
  }

  session.health.commands += 1;

  const ctx = {
    session,
    sock,
    msg,
    jid,
    text,
    args,
    config,
    prefix,
    registry,
    isOwner: owner,
    fromMe,
    downloadMediaMessage,
    async reply(content) {
      const payload = typeof content === 'string' ? { text: content } : content;
      return sock.sendMessage(jid, payload, { quoted: msg });
    }
  };

  try {
    await plugin.run(ctx);
  } catch (err) {
    const ref = newReference();
    session.logError(`command "${plugin.name}" failed [${ref}]: ${err?.stack || err}`);
    await ctx.reply(errorPanel(`That command failed. Reference ${ref}.`)).catch(() => {
      // If even the failure reply cannot be delivered, the log has the ref.
    });
  }
}

// The menu text is built by the menu plugin; this helper is shared there.
export { panel, commandReference };
