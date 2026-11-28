// All configuration comes from environment variables (or the .env file that
// src/core/env.js merged into process.env before this module runs).
// No secrets, numbers or tokens are ever written in code.

function parseBool(value, dflt = false) {
  if (value === undefined || value === null || String(value).trim() === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseTriBool(value, dflt) {
  if (value === undefined || value === null || String(value).trim() === '') return dflt;
  return parseBool(value, dflt);
}

export function loadConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  const onHeroku = env.DYNO !== undefined;
  // Heroku terminates TLS on its router and injects X-Forwarded-For, so it is
  // trusted there by default. Everywhere else the default is false so a
  // client cannot spoof the header to dodge rate limits.
  const trustProxy = parseTriBool(env.TRUST_PROXY, onHeroku);
  const mode = String(env.MODE || 'private').trim().toLowerCase() === 'public' ? 'public' : 'private';
  const port = Number.parseInt(String(env.SERVER_PORT || env.PORT || '3000'), 10) || 3000;
  return {
    // One deployment = one linked number, so the storage id is fixed.
    sessionId: '000000000000',
    brand: 'MaloneX',
    prefix: env.PREFIX && String(env.PREFIX).length > 0 ? String(env.PREFIX) : '.',
    mode,
    ownerPhone: String(env.OWNER_PHONE || '').replace(/\D/g, '') || null,
    accessKey: env.ACCESS_KEY && String(env.ACCESS_KEY).trim().length > 0 ? String(env.ACCESS_KEY).trim() : null,
    session: env.SESSION && String(env.SESSION).trim().length > 0 ? String(env.SESSION).trim() : null,
    sessionPrefix: env.SESSION_PREFIX && String(env.SESSION_PREFIX).trim().length > 0 ? String(env.SESSION_PREFIX).trim() : null,
    pairingSiteUrl: env.PAIRING_SITE_URL && String(env.PAIRING_SITE_URL).trim().length > 0
      ? String(env.PAIRING_SITE_URL).trim()
      : 'https://brian.pairsite.space',
    pairNumber: String(env.PAIR_NUMBER || '').replace(/\D/g, '') || null,
    port,
    trustProxy,
    storage: databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://') ? 'postgres' : 'file',
    databaseUrl,
    dataDir: env.DATA_DIR && String(env.DATA_DIR).length > 0 ? String(env.DATA_DIR) : './data',
    logLevel: env.LOG_LEVEL && String(env.LOG_LEVEL).length > 0 ? String(env.LOG_LEVEL) : 'info'
  };
}
