import path from 'node:path';
import pg from 'pg';

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Postgres storage backend for Heroku deployments. The pool can be injected
// for tests; otherwise it is created from the connection string.
export class PgStore {
  constructor({ pool = null, connectionString = null, dataDir = './data' } = {}) {
    this.pool = pool;
    this.connectionString = connectionString;
    this.dataDir = path.resolve(dataDir);
    this.external = Boolean(pool);
  }

  assertId(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      throw new Error(`Invalid session id "${String(sessionId)}".`);
    }
    return sessionId;
  }

  // Baileys credentials still live on disk even with the Postgres backend.
  sessionDir(sessionId) {
    return path.join(this.dataDir, this.assertId(sessionId));
  }

  async init() {
    if (!this.pool) {
      this.pool = new pg.Pool({ connectionString: this.connectionString });
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_sessions (
        id TEXT PRIMARY KEY,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_settings (
        session_id TEXT REFERENCES wa_sessions(id) ON DELETE CASCADE,
        key TEXT,
        value TEXT,
        PRIMARY KEY (session_id, key)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_group_settings (
        session_id TEXT REFERENCES wa_sessions(id) ON DELETE CASCADE,
        group_jid TEXT,
        key TEXT,
        value TEXT,
        PRIMARY KEY (session_id, group_jid, key)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_docs (
        session_id TEXT REFERENCES wa_sessions(id) ON DELETE CASCADE,
        collection TEXT,
        key TEXT,
        value TEXT,
        PRIMARY KEY (session_id, collection, key)
      )
    `);
    return true;
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async listSessions() {
    const res = await this.pool.query('SELECT id, phone, created_at, updated_at FROM wa_sessions ORDER BY created_at ASC');
    return res.rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async createSession(sessionId) {
    this.assertId(sessionId);
    const res = await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
      [sessionId]
    );
    return res.rows.length > 0;
  }

  async deleteSession(sessionId) {
    this.assertId(sessionId);
    const res = await this.pool.query('DELETE FROM wa_sessions WHERE id = $1', [sessionId]);
    return res.rowCount > 0;
  }

  async getSession(sessionId) {
    const res = await this.pool.query('SELECT id, phone, created_at, updated_at FROM wa_sessions WHERE id = $1', [sessionId]);
    const row = res.rows[0];
    if (!row) return null;
    return { id: row.id, phone: row.phone, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async saveSessionMeta(sessionId, meta = {}) {
    this.assertId(sessionId);
    await this.pool.query(
      `INSERT INTO wa_sessions (id, phone) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, wa_sessions.phone), updated_at = now()`,
      [sessionId, meta.phone ?? null]
    );
    return true;
  }

  async getSettings(sessionId) {
    const res = await this.pool.query('SELECT key, value FROM wa_settings WHERE session_id = $1', [sessionId]);
    const out = {};
    for (const row of res.rows) {
      out[row.key] = parseSettingValue(row.value);
    }
    return out;
  }

  async setSetting(sessionId, key, value) {
    this.assertId(sessionId);
    // Make sure the owning session row exists so the foreign key holds.
    await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [sessionId]
    );
    await this.pool.query(
      `INSERT INTO wa_settings (session_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (session_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [sessionId, key, JSON.stringify(value)]
    );
    return true;
  }

  // ---- per-group settings ----

  async getGroupSettings(sessionId, groupJid) {
    const res = await this.pool.query(
      'SELECT key, value FROM wa_group_settings WHERE session_id = $1 AND group_jid = $2',
      [sessionId, groupJid]
    );
    const out = {};
    for (const row of res.rows) {
      out[row.key] = parseSettingValue(row.value);
    }
    return out;
  }

  async setGroupSetting(sessionId, groupJid, key, value) {
    this.assertId(sessionId);
    await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [sessionId]
    );
    await this.pool.query(
      `INSERT INTO wa_group_settings (session_id, group_jid, key, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, group_jid, key) DO UPDATE SET value = EXCLUDED.value`,
      [sessionId, groupJid, key, JSON.stringify(value)]
    );
    return true;
  }

  // ---- generic JSON document storage ----

  async getDoc(sessionId, collection, key) {
    const res = await this.pool.query(
      'SELECT value FROM wa_docs WHERE session_id = $1 AND collection = $2 AND key = $3',
      [sessionId, collection, key]
    );
    if (res.rows.length === 0) return null;
    return parseSettingValue(res.rows[0].value);
  }

  async setDoc(sessionId, collection, key, value) {
    this.assertId(sessionId);
    await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [sessionId]
    );
    await this.pool.query(
      `INSERT INTO wa_docs (session_id, collection, key, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, collection, key) DO UPDATE SET value = EXCLUDED.value`,
      [sessionId, collection, key, JSON.stringify(value)]
    );
    return true;
  }

  async delDoc(sessionId, collection, key) {
    const res = await this.pool.query(
      'DELETE FROM wa_docs WHERE session_id = $1 AND collection = $2 AND key = $3',
      [sessionId, collection, key]
    );
    return res.rowCount > 0;
  }

  async listDocs(sessionId, collection) {
    const res = await this.pool.query(
      'SELECT key, value FROM wa_docs WHERE session_id = $1 AND collection = $2 ORDER BY key ASC',
      [sessionId, collection]
    );
    return res.rows.map((row) => ({ key: row.key, value: parseSettingValue(row.value) }));
  }

  async delAllDocs(sessionId, collection) {
    const res = await this.pool.query(
      'DELETE FROM wa_docs WHERE session_id = $1 AND collection = $2',
      [sessionId, collection]
    );
    return res.rowCount > 0;
  }

  // Settings and sessions live in the database; credentials are on disk, so
  // resetting auth only touches the credential folder.
  async resetAuth(sessionId) {
    const dir = this.sessionDir(sessionId);
    await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [sessionId]
    );
    const fs = await import('node:fs/promises');
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    return true;
  }

  async close() {
    if (!this.external && this.pool) {
      await this.pool.end();
    }
    return true;
  }
}

// Settings values are stored as JSON text; fall back to the raw string when
// the value is not valid JSON.
export function parseSettingValue(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
