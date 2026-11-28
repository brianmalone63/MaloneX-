// A tiny .env parser, so the project does not depend on the dotenv package.
// Format: one KEY=VALUE per line. Blank lines and # comments are ignored.
// Values may be wrapped in single or double quotes; surrounding whitespace
// is trimmed. Real environment variables always win over .env entries.
import fs from 'node:fs';
import path from 'node:path';

export function parseEnvFile(text) {
  const result = {};
  if (typeof text !== 'string') return result;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    result[key] = value;
  }
  return result;
}

// Loads .env from the given directory (default: current working directory).
// Existing process.env entries are never overwritten. Returns the merged
// environment object (mutations also apply to process.env directly, which is
// what the rest of the code reads).
export function loadDotenv(env = process.env, dir = process.cwd()) {
  const file = path.join(dir, '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return env; // No .env file: perfectly fine.
  }
  const parsed = parseEnvFile(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined || env[key] === '') env[key] = value;
  }
  return env;
}
