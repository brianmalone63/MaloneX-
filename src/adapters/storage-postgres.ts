await this.pool.query(`
  CREATE TABLE IF NOT EXISTS banned_users (
    jid VARCHAR PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`); 
async banUser(jid: string): Promise<void> {
  await this.pool.query('INSERT INTO banned_users (jid) VALUES ($1) ON CONFLICT DO NOTHING', [jid]);
}

async unbanUser(jid: string): Promise<void> {
  await this.pool.query('DELETE FROM banned_users WHERE jid = $1', [jid]);
}

async isBanned(jid: string): Promise<boolean> {
  const res = await this.pool.query('SELECT jid FROM banned_users WHERE jid = $1', [jid]);
  return res.rows.length > 0;
    }
