import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidNormalizedUser
} from '../baileys.js';
import { processMessage } from './handler.js';
import { applyDefaults, validateSetting } from './settings.js';
import { createLogger, maskJid } from './logger.js';
import * as features from './features.js';
import { panel } from './format.js';

const MAX_BACKOFF_MS = 60000;

// One WhatsApp session: socket lifecycle, reconnect rules, diagnostics and
// the in-memory settings cache.
export class Session {
  constructor({ id, store, config, registry }) {
    this.id = id;
    this.store = store;
    this.config = config;
    this.registry = registry;
    this.logger = createLogger(id);
    this.generation = 0;
    this.sock = null;
    this.ownJid = null;
    this.connected = false;
    this.status = 'idle';
    this.lastQr = null;
    this.settings = applyDefaults({});
    this.health = {
      startedAt: new Date().toISOString(),
      messagesSeen: 0,
      commandsHandled: 0,
      reconnects: 0,
      errors: 0,
      lastError: null,
      lastConnectedAt: null
    };
    this.reconnectAttempts = 0;
    this.stopping = false;
    this.reconnectTimer = null;
    this.version = null;
  }

  get info() {
    return {
      id: this.id,
      status: this.status,
      phone: this.ownJid ? this.ownJid.split('@')[0] : null,
      connected: this.connected,
      generation: this.generation,
      health: { ...this.health }
    };
  }

  async start() {
    if (this.stopping) return this;
    this.status = 'connecting';
    const dir = this.store.sessionDir(this.id);
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    if (!this.version) {
      try {
        const result = await fetchLatestBaileysVersion();
        this.version = result.version;
      } catch (err) {
        this.logger.warn(`could not fetch latest WhatsApp version, using bundled default: ${err.message}`);
      }
    }
    const gen = ++this.generation;
    this.sock = makeWASocket({
      version: this.version,
      logger: this.logger,
      printQRInTerminal: false,
      browser: ['MaloneX', 'Chrome', '1.0.0'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger)
      },
      markOnlineOnConnect: false,
      syncFullHistory: false
    });
    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (update) => this.onConnectionUpdate(update, gen));
    this.sock.ev.on('messages.upsert', (upsert) => this.onMessages(upsert, gen));
    // Feature listeners (anti-delete, anti-edit, anti-call, group events).
    features.register(this, this.sock);
    return this;
  }

  async stop() {
    this.stopping = true;
    this.generation += 1;
    features.stopAutoBio(this.id);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

  async restart() {
    await this.stop();
    return this.start();
  }

  // Explicit logout from the owner command: disconnect, clear credentials,
  // keep session metadata and settings for the next pairing.
  async logout() {
    try {
      await this.sock?.logout?.();
    } catch {
      // Server side logout may fail when already logged out; clear locally anyway.
    }
    await this.stop();
    await this.store.resetAuth(this.id);
    this.status = 'logged_out';
  }

  onConnectionUpdate(update, gen) {
    if (gen !== this.generation) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      this.lastQr = qr;
      this.status = 'pairing';
    }
    if (connection === 'open') {
      this.connected = true;
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.ownJid = this.sock?.user?.id ? jidNormalizedUser(this.sock.user.id) : null;
      this.health.lastConnectedAt = new Date().toISOString();
      this.logger.info('connection open');
      this.savePhone();
      this.loadSettings().then(() => {
        // Post-connect automation that depends on settings.
        if (this.settings?.AUTO_BIO) features.startAutoBio(this, this.sock);
        if (this.settings?.START_BANNER) {
          this.sock.sendMessage(this.ownJid, { text: panel('MaloneX connected', [
            `Linked number: ${this.ownJid ? this.ownJid.split('@')[0] : 'unknown'}`,
            `Mode: ${this.settings.MODE === 'env' ? (this.config.publicMode ? 'public' : 'private') : this.settings.MODE}`,
            'Automation and protections are configured with .settings.'
          ]) }).catch(() => {});
        }
      });
    } else if (connection === 'close') {
      this.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (this.stopping) {
        this.status = 'stopped';
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        this.status = 'logged_out';
        this.logger.warn('logged out by WhatsApp; credentials cleared, pair again from the web page');
        this.store.resetAuth(this.id).catch((err) => {
          this.health.errors += 1;
          this.logger.error(`auth reset failed: ${err.message}`);
        });
      } else if (code === DisconnectReason.connectionReplaced) {
        this.status = 'replaced';
        this.logger.warn('connection replaced by another client; not reconnecting');
      } else if (this.shouldReconnect(code)) {
        this.scheduleReconnect(code);
      } else {
        this.status = 'disconnected';
        this.logger.warn(`connection closed (code ${code ?? 'unknown'}); not reconnecting`);
      }
    }
  }

  shouldReconnect(code) {
    if (code === DisconnectReason.loggedOut) return false;
    if (code === DisconnectReason.connectionReplaced) return false;
    if (code === DisconnectReason.forbidden) return false;
    return true;
  }

  scheduleReconnect(code) {
    const attempt = this.reconnectAttempts + 1;
    this.reconnectAttempts = attempt;
    this.health.reconnects += 1;
    const base = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
    const delay = base + Math.floor(Math.random() * 250);
    this.status = 'reconnecting';
    this.logger.warn(`connection lost (code ${code ?? 'unknown'}); reconnect attempt ${attempt} in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      if (this.stopping) return;
      this.start().catch((err) => {
        this.health.errors += 1;
        this.health.lastError = err.message;
        this.logger.error(`reconnect failed: ${err.message}`);
        this.scheduleReconnect(0);
      });
    }, delay);
  }

  onMessages(upsert, gen) {
    if (gen !== this.generation) return;
    if (upsert.type !== 'notify') return;
    for (const msg of upsert.messages || []) {
      if (!msg || !msg.message || !msg.key) continue;
      this.health.messagesSeen += 1;
      // Auto-features and protections run first and never affect commands.
      features.onMessage(this, this.sock, msg, { registry: this.registry }).catch((err) => {
        this.health.errors += 1;
        this.health.lastError = err.message;
        this.logger.error(`feature pipeline failed: ${err.message}`);
      });
      processMessage(this, this.sock, msg, { registry: this.registry, store: this.store })
        .catch((err) => {
          this.health.errors += 1;
          this.health.lastError = err.message;
          this.logger.error(`message processing failed: ${err.message}`);
        });
    }
  }

  async savePhone() {
    if (!this.ownJid) return;
    const digits = this.ownJid.split('@')[0].split(':')[0];
    try {
      await this.store.saveSessionMeta(this.id, { phone: digits });
    } catch (err) {
      this.health.errors += 1;
      this.logger.error(`saving session meta failed: ${err.message}`);
    }
  }

  // Settings are loaded from storage when the session connects and kept in
  // memory for the lifetime of the connection.
  async loadSettings() {
    try {
      const raw = await this.store.getSettings(this.id);
      this.settings = applyDefaults(raw);
      const count = Object.keys(raw).length;
      this.logger.info(`settings loaded (${count} stored ${count === 1 ? 'key' : 'keys'})`);
    } catch (err) {
      this.health.errors += 1;
      this.logger.error(`loading settings failed: ${err.message}`);
    }
  }

  // Validate against the schema, update memory, then persist.
  async setSetting(key, value) {
    const check = validateSetting(key, value);
    if (!check.ok) return check;
    this.settings[key] = check.value;
    try {
      await this.store.setSetting(this.id, key, check.value);
      return { ok: true, value: check.value };
    } catch (err) {
      this.health.errors += 1;
      this.logger.error(`saving setting "${key}" failed: ${err.message}`);
      return { ok: false, error: 'The setting could not be saved. Check the storage backend.' };
    }
  }

  isOwner(jid, fromMe = false) {
    if (fromMe) return true;
    if (!jid) return false;
    const normalized = jidNormalizedUser(jid);
    const digits = normalized.split('@')[0].split(':')[0];
    if (this.ownJid && normalized === this.ownJid) return true;
    return this.config.owners.some((owner) => owner === digits || owner === normalized);
  }

  uptimeSeconds() {
    const started = new Date(this.health.lastConnectedAt || this.health.startedAt).getTime();
    return Number.isFinite(started) ? Math.floor((Date.now() - started) / 1000) : 0;
  }

  diagnostics() {
    const h = this.health;
    return [
      { label: 'State', value: this.status },
      { label: 'Linked number', value: this.ownJid ? maskJid(this.ownJid) : 'not linked' },
      { label: 'Generation', value: String(this.generation) },
      { label: 'Uptime', value: `${this.uptimeSeconds()}s` },
      { label: 'Reconnects', value: String(h.reconnects) },
      { label: 'Messages seen', value: String(h.messagesSeen) },
      { label: 'Commands handled', value: String(h.commandsHandled) },
      { label: 'Errors', value: String(h.errors) },
      { label: 'Last error', value: h.lastError || 'none' }
    ];
  }
}
