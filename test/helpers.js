// Shared test fakes. Synthetic only: no real sessions, numbers or media.
import { createRegistry } from '../src/commands/registry.js';

export const HEART = '\u2764\uFE0F';

export function fakeLogger() {
  const calls = [];
  const record = (level) => (...args) => calls.push({ level, args });
  return {
    calls,
    level: 'error',
    child() { return fakeLogger(); },
    fatal: record('fatal'),
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
    trace: record('trace')
  };
}

export function fakeConfig(overrides = {}) {
  return {
    sessionId: '000000000000',
    brand: 'MaloneX',
    prefix: '.',
    mode: 'private',
    ownerPhone: null,
    accessKey: null,
    session: null,
    sessionPrefix: null,
    pairingSiteUrl: 'https://brian.pairsite.space',
    pairNumber: null,
    port: 0,
    trustProxy: false,
    storage: 'file',
    databaseUrl: '',
    dataDir: './data',
    logLevel: 'error',
    ...overrides
  };
}

export function fakeStore() {
  const auth = new Map(); // composite -> value (object form)
  let creds = null;
  const settings = new Map();
  const calls = { wipeAuth: 0, saveCreds: 0, setAuthBulk: 0 };
  return {
    calls,
    async getAuth() {
      const keys = {};
      for (const [k, v] of auth) keys[k] = v;
      return { creds, keys };
    },
    async saveCreds(id, credsJson) {
      calls.saveCreds += 1;
      creds = credsJson; // String form, as the auth state passes it.
    },
    async setAuthBulk(id, entries) {
      calls.setAuthBulk += 1;
      for (const [k, v] of entries) auth.set(k, v);
    },
    async wipeAuth() {
      calls.wipeAuth += 1;
      auth.clear();
      creds = null;
    },
    async getSettings() {
      return Object.fromEntries(settings);
    },
    async setSetting(id, key, value) {
      settings.set(key, value);
    },
    async saveSessionMeta(id, meta) {
      settings.set('_meta', { ...(settings.get('_meta') || {}), ...meta });
    },
    async init() {},
    async close() {}
  };
}

export function fakeSock() {
  const handlers = {};
  return {
    sent: [],
    reads: [],
    ended: 0,
    user: null,
    ev: {
      on(name, fn) {
        (handlers[name] = handlers[name] || []).push(fn);
      },
      emit(name, payload) {
        (handlers[name] || []).forEach((fn) => fn(payload));
      }
    },
    open(update) {
      (handlers['connection.update'] || []).forEach((fn) => fn({ connection: 'open', ...update }));
    },
    close(code) {
      (handlers['connection.update'] || []).forEach((fn) => fn({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: code } } }
      }));
    },
    qr() {
      (handlers['connection.update'] || []).forEach((fn) => fn({ qr: 'fake-qr' }));
    },
    async requestPairingCode() {
      return 'ABCD1234';
    },
    async sendMessage(jid, content) {
      this.sent.push({ jid, content });
      return { key: { id: 'FAKE' } };
    },
    readMessages(keys) {
      this.reads.push(...keys);
    },
    end() {
      this.ended += 1;
    },
    handlers
  };
}

export function fakeRegistryWith(plugins) {
  const registry = createRegistry();
  for (const plugin of plugins) registry.register(plugin);
  return registry;
}

export function statusMsg({ id = 'ST1', participant = '254700000001@s.whatsapp.net', fromMe = false } = {}) {
  return {
    key: { remoteJid: 'status@broadcast', id, participant, fromMe },
    message: { extendedTextMessage: { text: 'a status' } },
    messageTimestamp: Math.floor(Date.now() / 1000)
  };
}

export function chatMsg({ jid = '254700000002@s.whatsapp.net', text = 'hello', fromMe = false, id = 'MSG1' } = {}) {
  return {
    key: { remoteJid: jid, fromMe, id },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000)
  };
}

export function featureSession({ settings = {}, ownJid = '254712345678@s.whatsapp.net' } = {}) {
  return {
    settings: {
      autoview: false,
      autolike: false,
      autolike_emoji: HEART,
      vv_destination: 'self',
      ...settings
    },
    ownJid,
    health: { messages: 0, commands: 0 },
    logError() {}
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls a condition instead of using fixed sleeps: under `node --test`,
// test files run in parallel processes and fixed short sleeps race timers.
export async function waitFor(fn, timeoutMs = 3000, stepMs = 5) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(stepMs);
  }
  return fn();
}

export async function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

export async function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
