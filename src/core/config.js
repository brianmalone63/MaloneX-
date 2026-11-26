import path from 'node:path';

function parseBool(value, dflt = false) {
  if (value === undefined || value === null || String(value).trim() === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseOwnerList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim().replace(/[^\d]/g, ''))
    .filter((item) => item.length > 0);
}

function pickStorage(env) {
  const explicit = String(env.STORAGE || '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'file') return explicit;
  const url = String(env.DATABASE_URL || '');
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgres' : 'file';
}

export function loadConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '');
  return {
    prefix: env.PREFIX && String(env.PREFIX).length > 0 ? String(env.PREFIX) : '.',
    owners: parseOwnerList(env.OWNER || env.OWNERS || ''),
    publicMode: parseBool(env.PUBLIC_MODE, false),
    storage: pickStorage(env),
    databaseUrl,
    dataDir: env.DATA_DIR && String(env.DATA_DIR).length > 0 ? String(env.DATA_DIR) : './data',
    port: Number.parseInt(String(env.PORT || '3000'), 10) || 3000,
    logLevel: env.LOG_LEVEL && String(env.LOG_LEVEL).length > 0 ? String(env.LOG_LEVEL) : 'info'
  };
}

export const config = loadConfig();

export const defaultPaths = { dataDir: path.resolve(config.dataDir) };
