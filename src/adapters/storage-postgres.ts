await this.pool.query(`
  CREATE TABLE IF NOT EXISTS group_warnings (
    group_jid VARCHAR PRIMARY KEY,
    warnings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
