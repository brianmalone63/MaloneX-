import assert from 'node:assert/strict';
import { applyDefaults, validateSetting } from '../src/core/settings.js';

const EMOJI_RE = /\p{Extended_Pictographic}/u;

// Fake logger that records every call; used to assert masked logging.
export function fakeLogger() {
  const calls = [];
  const record = (level) => (...args) => calls.push({ level, args });
  return {
    calls,
    level: 'info',
    child() { return fakeLogger(); },
    trace: record('trace'),
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    fatal: record('fatal')
  };
}

// Fake sock that records sends and reads.
export function fakeSock() {
  const sent = [];
  const reads = [];
  return {
    sent,
    reads,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: 'FAKEKEY' } };
    },
    async readMessages(keys) {
      reads.push(...keys);
      return;
    },
    async updateMediaMessage() {
      return {};
    }
  };
}

// Stub session implementing the surface the handler and plugins rely on.
export function stubSession(overrides = {}) {
  const settingsRaw = overrides.settingsRaw || {};
  const stored = overrides.stored || {};
  const settings = applyDefaults(settingsRaw);
  const logger = overrides.logger || fakeLogger();
  const session = {
    id: overrides.id || '254700000000',
    config: overrides.config || { prefix: '.', owners: [], publicMode: false, maxMediaBytes: 16 * 1024 * 1024 },
    settings,
    storedSettings: stored,
    health: { errors: 0, lastError: null, messagesSeen: 0, commandsHandled: 0, reconnects: 0 },
    generation: 1,
    connected: true,
    ownJid: overrides.ownJid || '1000000000@s.whatsapp.net',
    logger,
    isOwner(jid, fromMe = false) {
      if (fromMe) return true;
      if (!jid) return false;
      const digits = String(jid).split('@')[0].split(':')[0];
      if (String(this.ownJid).split('@')[0] === digits) return true;
      return (overrides.owners || []).includes(digits);
    },
    async setSetting(key, value) {
      const check = validateSetting(key, value);
      if (!check.ok) return check;
      this.settings[key] = check.value;
      this.storedSettings[key] = check.value;
      return { ok: true, value: check.value };
    },
    restart: overrides.restart || (async () => {}),
    ...overrides.extra
  };
  return session;
}

// Minimal WAMessage stub.
export function messageStub({ jid = '254700000000@s.whatsapp.net', fromMe = false, participant = null, id = 'MSG1', message = null, pushName = '' } = {}) {
  return {
    key: { remoteJid: jid, fromMe, id, participant: participant || (jid === 'status@broadcast' ? '254800000000@s.whatsapp.net' : null) },
    message: message || (jid === 'status@broadcast' ? {} : null),
    pushName,
    messageTimestamp: Math.floor(Date.now() / 1000)
  };
}

export function textMessage(text) {
  return { conversation: text };
}

export function extMessage(text, quoted = undefined) {
  return {
    extendedTextMessage: {
      text,
      contextInfo: quoted === undefined ? undefined : { quotedMessage: quoted, participant: '254800000000@s.whatsapp.net' }
    }
  };
}

export function statusMessage(participant, id, body) {
  return messageStub({ jid: 'status@broadcast', participant, id, message: body });
}

export function assertNoEmoji(text, msg = 'output must not contain emoji') {
  assert.doesNotMatch(text, EMOJI_RE, msg);
}
