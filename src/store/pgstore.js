// Postgres storage. Heroku REQUIRES TLS on Postgres connections: every pool
// uses ssl: { rejectUnauthorized: false } unless the host is localhost.
// pool.on('error') is attached so an idle-client error can never crash the
// process. Bulk upserts go through unnest to keep round trips low.
import pgPackage from 'pg';

const { Pool } = pgPackage;

// Pure and testable: which SSL options apply for a connection string.
export function pgSslOptions(connectionString) {
  let host = null;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return { rejectUnauthorized: false };
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  return { rejectUnauthorized: false };
}

export class PgStore {
  constructor({ connectionString, logger, pool = null } = {}) {
    this.connectionString = connectionString;
    this.logger = logger;
    // Tests may inject a fake pool; production always creates a real one.
    if (pool) {
      this.pool = pool;
    } else {
      this.pool = new Pool({
        connectionString,
        ssl: pgSslOptions(connectionString)
      });
    }
    // A crashed idle client must never take the process down.
    this.pool.on('error', (err) => {
      if (this.logger) this.logger.error(`postgres pool error (connection stays alive): ${err.message}`);
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_sessions (
        id TEXT PRIMARY KEY,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_auth (
        session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
        k TEXT NOT NULL,
        v JSONB NOT NULL,
        PRIMARY KEY (session_id, k)
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wa_settings (
        session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
        k TEXT NOT NULL,
        v JSONB NOT NULL,
        PRIMARY KEY (session_id, k)
      )`);
  }

  async close() {
    await this.pool.end();
  }

  async ensureSessionRow(id) {
    await this.pool.query(
      'INSERT INTO wa_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [id]
    );
  }

  async getAuth(id) {
    await this.ensureSessionRow(id);
    const out = { creds: null, keys: {} };
    const credsResult = await this.pool.query(
      'SELECT v FROM wa_auth WHERE session_id = $1 AND k = $2',
      [id, 'creds']
    );
    if (credsResult.rows.length > 0) out.creds = credsResult.rows[0].v;
    const keysResult = await this.pool.query(
      'SELECT k, v FROM wa_auth WHERE session_id = $1 AND k <> $2',
      [id, 'creds']
    );
    for (const row of keysResult.rows) out.keys[row.k] = row.v;
    return out;
  }

  // entries: [compositeKey, jsonString] pairs. Bulk upsert via unnest.
  async setAuthBulk(id, entries) {
    if (!entries.length) return;
    await this.ensureSessionRow(id);
    const keys = entries.map(([k]) => k);
    const values = entries.map(([, json]) => json);
    await this.pool.query(
      `INSERT INTO wa_auth (session_id, k, v)
       SELECT $1, k, v FROM unnest($2::text[], $3::jsonb[]) AS t(k, v)
       ON CONFLICT (session_id, k) DO UPDATE SET v = EXCLUDED.v`,
      [id, keys, values]
    );
  }

  async saveCreds(id, credsJson) {
    await this.setAuthBulk(id, [['creds', credsJson]]);
  }

  async wipeAuth(id) {
    await this.pool.query('DELETE FROM wa_auth WHERE session_id = $1', [id]);
  }

  async getSettings(id) {
    await this.ensureSessionRow(id);
    const result = await this.pool.query('SELECT k, v FROM wa_settings WHERE session_id = $1', [id]);
    const out = {};
    for (const row of result.rows) out[row.k] = row.v;
    return out;
  }

  async setSetting(id, key, value) {
    await this.ensureSessionRow(id);
    await this.pool.query(
      `INSERT INTO wa_settings (session_id, k, v) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (session_id, k) DO UPDATE SET v = EXCLUDED.v`,
      [id, key, JSON.stringify(value)]
    );
  }

  async saveSessionMeta(id, meta) {
    await this.ensureSessionRow(id);
    if (meta.phone) {
      await this.pool.query('UPDATE wa_sessions SET phone = $2 WHERE id = $1', [id, String(meta.phone)]);
    }
  }
}
