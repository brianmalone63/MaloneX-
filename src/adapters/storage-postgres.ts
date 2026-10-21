await this.pool.query(`
  CREATE TABLE IF NOT EXISTS group_warnings (
    group_jid VARCHAR PRIMARY KEY,
    warnings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
async addWarning(groupJid: string, userJid: string): Promise<number> {
  const res = await this.pool.query(`
    INSERT INTO group_warnings (group_jid, warnings)
    VALUES ($1, jsonb_build_object($2, 1))
    ON CONFLICT (group_jid) DO UPDATE
    SET warnings = jsonb_set(
      group_warnings.warnings,
      ARRAY[$2],
      (COALESCE((group_warnings.warnings->>$2)::int, 0) + 1)::text::jsonb
    )
    RETURNING (warnings->>$2)::int as count;
  `, [groupJid, userJid]);
  return res.rows[0].count;
}

async getWarnings(groupJid: string, userJid: string): Promise<number> {
  const res = await this.pool.query(`
    SELECT (warnings->>$2)::int as count FROM group_warnings WHERE group_jid = $1;
  `, [groupJid, userJid]);
  return res.rows.length > 0 && res.rows[0].count ? res.rows[0].count : 0;
}

async resetWarnings(groupJid: string, userJid: string): Promise<void> {
  await this.pool.query(`
    UPDATE group_warnings SET warnings = warnings - $2 WHERE group_jid = $1;
  `, [groupJid, userJid]);
}
