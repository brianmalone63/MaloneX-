import pg from 'pg';
import { StorageAdapter } from '../core/types.js';

export class PostgresStorageAdapter implements StorageAdapter {
  private pool: pg.Pool;

  constructor() {
    // Heroku provides DATABASE_URL. We need SSL for Heroku Postgres.
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }

  async init(): Promise<void> {
    // Create the single-row table to store the encrypted auth state
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async getAuthState(): Promise<string | null> {
    const res = await this.pool.query('SELECT data FROM auth_state WHERE id = 1');
    if (res.rows.length === 0) return null;
    return res.rows[0].data;
  }

  async saveAuthState(encryptedData: string): Promise<void> {
    // Upsert the single row
    await this.pool.query(`
      INSERT INTO auth_state (id, data, updated_at) 
      VALUES (1, $1, CURRENT_TIMESTAMP)
      ON CONFLICT (id) 
      DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;
    `, [encryptedData]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
        }
