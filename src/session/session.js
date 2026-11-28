// The one Session class. Every socket gets a generation counter; events from
// an older socket are ignored. Disconnect handling follows
// src/session/diagnostics.js: 401 wipes, 440 stops keeping credentials, 515
// reconnects in 500 ms (not a failure), 500 retries and stops after three
// consecutive failures, everything else backs off exponentially with jitter.
import { makeWASocket, Browsers, jidNormalizedUser, getWaVersion } from '../baileys.js';
import { classifyDisconnect, backoffDelay, MAX_CONSECUTIVE_FAILURES } from './diagnostics.js';
import { availabilityPct, formatDuration } from './health.js';
import { ensureAuthState } from './importSession.js';
import { normalizePhone, maskPhone, jidToPhone } from '../core/phones.js';
import { UserError } from '../core/errors.js';
import { processMessage } from '../commands/handler.js';
import { createAutoView } from '../features/autoview.js';
import { createAutoLike } from '../features/autolike.js';

const PAIRING_READY_TIMEOUT_MS = 30000;
const PAIRING_READY_POLL_MS = 250;
const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
// A QR event proves the WebSocket handshake finished; it stays valid as a
// readiness signal for two minutes before a fresh one is needed.
const QR_FRESH_MS = 120000;

export class Session {
  constructor({
    config,
    store,
    registry,
    logger,
    sockFactory = null,
    backoffFn = null,
    quickReconnectMs = 500,
    pairingTimeoutMs = PAIRING_READY_TIMEOUT_MS,
    rng = Math.random,
    versionFn = null,
    autoView = null,
    autoLike = null
  } = {}) {
    this.config = config;
    this.store = store;
    this.registry = registry;
    this.logger = logger;
    this.sockFactory = sockFactory;
    this.backoffFn = backoffFn;
    this.quickReconnectMs = quickReconnectMs;
    this.pairingTimeoutMs = pairingTimeoutMs;
    this.rng = rng;
    this.versionFn = versionFn || getWaVersion;
    this.autoView = autoView || createAutoView();
    this.autoLike = autoLike || createAutoLike();

    this.generation = 0;
    this.sock = null;
    this.ownJid = null;
    this.connected = false;
    this.registered = false;
    this.status = 'idle';
    this.lastQrAt = null;
    this.pairRequest = null;
    this.stopping = false;
    this.timers = new Set();

    this.health = {
      startedAt: new Date().toISOString(),
      connectedMs: 0,
      connectedSince: null,
      lastConnectedAt: null,
      disconnects: 0,
      reconnects: 0,
      consecutiveFailures: 0,
      messages: 0,
      commands: 0,
      errors: 0,
      lastError: null,
      lastDisconnect: null
    };

    this.settings = {
      autoview: false,
      autolike: false,
      autolike_emoji: '\u2764\uFE0F',
      vv_destination: 'self'
    };
  }

  async loadSettings() {
    try {
      const stored = await this.store.getSettings(this.config.sessionId);
      for (const key of Object.keys(this.settings)) {
        if (stored[key] !== undefined) this.settings[key] = stored[key];
      }
    } catch (err) {
      this.logError(`loading settings failed: ${err.message}`);
    }
  }

  async setSetting(key, value) {
    const check = validateSetting(key, value);
    if (!check.ok) return check;
    this.settings[key] = check.value;
    try {
      await this.store.setSetting(this.config.sessionId, key, check.value);
      return { ok: true, value: check.value };
    } catch (err) {
      this.logError(`saving setting "${key}" failed: ${err.message}`);
      return { ok: false, error: 'The setting could not be saved. Check the storage backend.' };
    }
  }

  async start() {
    if (this.stopping) return this;
    this.status = 'connecting';
    const { state, saveCreds, registered } = await ensureAuthState({
      config: this.config,
      store: this.store,
      sessionId: this.config.sessionId,
      logger: this.logger
    });
    // "Registered" is sticky: once the device has registered with WhatsApp
    // (stored creds or an observed connection open), later disconnects must
    // never be treated as "closed before registration".
    this.registered = registered || this.registered;
    await this.loadSettings();

    const version = await this.versionFn(this.logger);
    const gen = ++this.generation;
    const auth = state;

    const makeSock = this.sockFactory
      ? (v) => this.sockFactory(v, auth)
      : (v) => makeWASocket({
          version: v || undefined,
          logger: this.logger,
          printQRInTerminal: false,
          browser: Browsers.ubuntu('Chrome'),
          auth,
          markOnlineOnConnect: false,
          syncFullHistory: false,
          getMessage: () => undefined
        });

    this.sock = makeSock(version);
    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (update) => this.onConnectionUpdate(update, gen));
    this.sock.ev.on('messages.upsert', (upsert) => this.onMessages(upsert, gen));
    return this;
  }

  onConnectionUpdate(update, gen) {
    if (gen !== this.generation) return; // Stale socket: ignore.
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      this.lastQrAt = Date.now();
      this.status = 'pairing';
    }
    if (connection === 'open') {
      this.connected = true;
      this.status = 'online';
      this.registered = true;
      this.health.consecutiveFailures = 0;
      this.health.lastConnectedAt = new Date().toISOString();
      this.health.connectedSince = Date.now();
      this.ownJid = this.sock?.user?.id ? jidNormalizedUser(this.sock.user.id) : null;
      this.pairRequest = null;
      const phone = jidToPhone(this.ownJid);
      this.store.saveSessionMeta(this.config.sessionId, { phone: phone || null }).catch(() => {});
      this.logger.info(`Connected as ${maskPhone(phone || '')}.`);
    } else if (connection === 'close') {
      this.connected = false;
      if (this.health.connectedSince) {
        this.health.connectedMs += Date.now() - this.health.connectedSince;
        this.health.connectedSince = null;
      }
      const code = lastDisconnect?.error?.output?.statusCode;
      const d = classifyDisconnect(code, { registered: this.registered });
      this.health.disconnects += 1;
      this.health.lastDisconnect = {
        code: code ?? null,
        reason: d.reason,
        advice: d.advice,
        at: new Date().toISOString()
      };
      if (d.action !== 'quick-reconnect') {
        this.logger.warn(`${d.reason} ${d.advice}`);
      }
      this.applyDisconnectAction(d);
    }
  }

  applyDisconnectAction(d) {
    switch (d.action) {
      case 'wipe': {
        this.stop();
        this.status = 'logged_out';
        this.store.wipeAuth(this.config.sessionId).catch((err) => {
          this.logError(`wiping stored credentials failed: ${err.message}`);
        });
        break;
      }
      case 'stop-keep': {
        this.stop();
        this.status = 'conflict';
        break;
      }
      case 'quick-reconnect': {
        this.status = 'reconnecting';
        this.health.reconnects += 1;
        this.schedule(() => this.start().catch((err) => this.logError(`reconnect failed: ${err.message}`)), this.quickReconnectMs);
        break;
      }
      case 'reconnect': {
        this.health.consecutiveFailures += 1;
        if (this.health.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.stop();
          this.status = 'failed';
          this.logger.error(`Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Check connectivity, then restart the deployment.`);
          break;
        }
        const delay = this.backoffFn
          ? this.backoffFn(this.health.consecutiveFailures)
          : backoffDelay(this.health.consecutiveFailures, this.rng);
        this.status = 'reconnecting';
        this.health.reconnects += 1;
        this.logger.warn(`Reconnect attempt ${this.health.consecutiveFailures} in ${delay} ms.`);
        this.schedule(() => this.start().catch((err) => this.logError(`reconnect failed: ${err.message}`)), delay);
        break;
      }
      case 'stop':
      default: {
        this.stop();
        this.status = 'stopped';
        break;
      }
    }
  }

  onMessages(upsert, gen) {
    if (gen !== this.generation) return; // Stale socket: ignore.
    if (upsert.type !== 'notify') return;
    for (const msg of upsert.messages || []) {
      if (!msg || !msg.key) continue;
      this.health.messages += 1;
      // Status automation first; failures must never break commands.
      if (msg.key.remoteJid === 'status@broadcast') {
        Promise.resolve()
          .then(() => this.autoView(this, this.sock, msg))
          .catch((err) => this.logError(`autoview failed: ${err.message}`));
        Promise.resolve()
          .then(() => this.autoLike(this, this.sock, msg))
          .catch((err) => this.logError(`autolike failed: ${err.message}`));
      }
      processMessage(this, this.sock, msg, { registry: this.registry, store: this.store, config: this.config })
        .catch((err) => this.logError(`message processing failed: ${err.message}`));
    }
  }

  pairingReady() {
    if (this.connected) return true;
    return this.lastQrAt !== null && Date.now() - this.lastQrAt < QR_FRESH_MS;
  }

  // Real phone-number pairing through Baileys' requestPairingCode (no QR in
  // this deployment: pairing happens on the external site, the built-in page
  // or the console).
  async requestPairingCode(phoneInput) {
    if (this.stopping) throw new UserError('The bot is shutting down. Try again shortly.');
    if (this.connected) throw new UserError('Already connected. Unlink the device in WhatsApp or clear the session before pairing a new number.');
    const digits = normalizePhone(phoneInput);
    if (!digits) throw new UserError('Enter a valid phone number in international format, e.g. +254712345678.');
    if (!this.sock) await this.start();
    if (!this.sock) throw new UserError('The WhatsApp socket could not be started. Check the server logs.');

    const deadline = Date.now() + this.pairingTimeoutMs;
    while (!this.pairingReady()) {
      if (Date.now() > deadline) {
        throw new UserError('WhatsApp did not become ready in time. Check the server connection and try again.');
      }
      await new Promise((resolve) => setTimeout(resolve, PAIRING_READY_POLL_MS));
      if (!this.sock && !this.connected) {
        throw new UserError('The WhatsApp connection dropped before pairing could start. Try again.');
      }
    }

    let code;
    try {
      code = await this.sock.requestPairingCode(digits);
    } catch (err) {
      this.logger.warn(`pairing code request failed: ${err.message}`);
      throw new UserError(`WhatsApp rejected the pairing request. Try again in a moment.`);
    }
    if (!code) throw new UserError('WhatsApp did not return a pairing code. Try again.');
    this.pairRequest = {
      phone: digits,
      code: String(code).toUpperCase(),
      requestedAt: new Date().toISOString(),
      expiresAt: Date.now() + PAIR_CODE_TTL_MS
    };
    this.status = 'pairing';
    return this.pairRequest;
  }

  // Console fallback pairing (PAIR_NUMBER). Prints the code once to the
  // server log; the phone number is always masked.
  async consolePair(phoneInput) {
    const pair = await this.requestPairingCode(phoneInput);
    this.logger.info(`PAIR NOW: open WhatsApp on ${maskPhone(pair.phone)}, tap Settings > Linked devices > Link a device > "Pair with phone number instead", then type this code: ${pair.code}`);
    return pair;
  }

  schedule(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  stop() {
    this.stopping = true;
    this.generation += 1;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.health.connectedSince) {
      this.health.connectedMs += Date.now() - this.health.connectedSince;
      this.health.connectedSince = null;
    }
    try {
      this.sock?.end?.(undefined);
    } catch {
      // Socket may already be gone.
    }
    this.sock = null;
    this.connected = false;
    this.status = 'stopped';
    this.stopping = false;
  }

  async shutdown() {
    this.stop();
    this.status = 'shutdown';
  }

  async restart() {
    this.stop();
    return this.start();
  }

  isOwner(jid, fromMe = false) {
    if (fromMe) return true;
    if (!jid) return false;
    const digits = jidToPhone(jidNormalizedUser(jid));
    if (this.ownJid && jidNormalizedUser(jid) === this.ownJid) return true;
    return this.config.ownerPhone !== null && digits === this.config.ownerPhone;
  }

  uptimeSeconds() {
    const started = new Date(this.health.startedAt).getTime();
    return Number.isFinite(started) ? Math.floor((Date.now() - started) / 1000) : 0;
  }

  availability() {
    const active = this.health.connectedSince ? Date.now() - this.health.connectedSince : 0;
    const uptime = Date.now() - new Date(this.health.startedAt).getTime();
    return availabilityPct(this.health.connectedMs + active, uptime);
  }

  diagnostics() {
    const h = this.health;
    const last = h.lastDisconnect;
    return [
      { label: 'State', value: this.status },
      { label: 'Linked number', value: this.ownJid ? maskPhone(jidToPhone(this.ownJid)) : 'not linked' },
      { label: 'Uptime', value: formatDuration(this.uptimeSeconds()) },
      { label: 'Availability', value: `${this.availability().toFixed(2)}%` },
      { label: 'Disconnects', value: String(h.disconnects) },
      { label: 'Reconnects', value: String(h.reconnects) },
      { label: 'Consecutive failures', value: String(h.consecutiveFailures) },
      { label: 'Messages seen', value: String(h.messages) },
      { label: 'Commands handled', value: String(h.commands) },
      { label: 'Errors', value: String(h.errors) },
      { label: 'Last disconnect', value: last ? `${last.reason}` : 'none' },
      { label: 'Advice', value: last ? last.advice : 'nothing to advise yet' }
    ];
  }

  logError(message) {
    this.health.errors += 1;
    this.health.lastError = message;
    this.logger.error(message);
  }
}

// Setting validation lives here so both the .settings command and the
// programmatic path share one schema.
const SETTINGS_SCHEMA = {
  autoview: { type: 'boolean', default: false, description: 'Read other people\'s statuses automatically' },
  autolike: { type: 'boolean', default: false, description: 'React to other people\'s statuses automatically' },
  autolike_emoji: { type: 'string', default: '\u2764\uFE0F', description: 'The single emoji used for status reactions' },
  vv_destination: { type: 'enum', values: ['self', 'chat'], default: 'self', description: 'Where view-once media is delivered' }
};

export function validateSetting(key, value) {
  const spec = SETTINGS_SCHEMA[key];
  if (!spec) return { ok: false, error: `Unknown setting "${key}".` };
  if (spec.type === 'boolean') {
    const parsed = value === true || value === 'on' || value === 'true' || value === 'enable' || value === 'enabled' ? true
      : value === false || value === 'off' || value === 'false' || value === 'disable' || value === 'disabled' ? false
      : null;
    if (parsed === null) return { ok: false, error: `"${key}" takes on or off.` };
    return { ok: true, value: parsed };
  }
  if (spec.type === 'enum') {
    if (!spec.values.includes(String(value))) return { ok: false, error: `"${key}" takes one of: ${spec.values.join(', ')}.` };
    return { ok: true, value: String(value) };
  }
  if (spec.type === 'string') {
    const text = String(value ?? '').trim();
    if (!text || [...text].length !== 1) return { ok: false, error: `"${key}" must be exactly one character.` };
    return { ok: true, value: text };
  }
  return { ok: false, error: `"${key}" has an unsupported type.` };
}

export function settingsList() {
  return Object.entries(SETTINGS_SCHEMA).map(([key, spec]) => ({
    key,
    ...spec,
    values: spec.values || null
  }));
}
