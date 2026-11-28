// Session string parser. Supports, auto-detected:
//   1. raw JSON
//   2. base64 of JSON
//   3. gzip then base64 of JSON
// each optionally behind a prefix ending in "~", "_" or ":" (e.g.
// "MaloneX~eyJ..."), which is stripped. SESSION_PREFIX forces an exact
// prefix. The decoded JSON may be:
//   a. a Baileys creds object
//   b. { creds, keys }
//   c. a map of auth-state filenames to contents, e.g. { "creds.json": {...},
//      "keys/session-abc/1.json": {...} }
// Everything is normalized into { creds, keys }. Buffer fields are revived
// with Baileys' BufferJSON reviver. Errors never echo the input.
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { BufferJSON } from '../baileys.js';
import { UserError } from '../core/errors.js';
import { maskPhone, jidToPhone } from '../core/phones.js';
import { createStoreAuthState } from '../auth/authState.js';

const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const SEPARATORS = ['~', '_', ':'];
const FORMATS = 'raw JSON, base64 of JSON, or gzip+base64 of JSON, optionally behind a prefix ending in "~", "_" or ":"';

function parseJson(text) {
  return JSON.parse(text, BufferJSON.reviver);
}

function looksLikeBase64(text) {
  return typeof text === 'string' && text.length > 0 && /^[A-Za-z0-9+/\-_]+={0,2}$/.test(text);
}

// Tries the decode chain on a payload; returns the parsed object or null.
function decodePayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0) return null;
  // 1. Raw JSON.
  if (payload.trimStart().startsWith('{')) {
    try {
      return parseJson(payload);
    } catch {
      return null; // Malformed JSON: do not keep trying, it will not get better.
    }
  }
  if (!looksLikeBase64(payload)) return null;
  let bytes;
  try {
    bytes = Buffer.from(payload, 'base64');
  } catch {
    return null;
  }
  // 2. base64 of JSON.
  const asText = bytes.toString('utf8');
  if (asText.trimStart().startsWith('{')) {
    try {
      return parseJson(asText);
    } catch {
      return null;
    }
  }
  // 3. gzip then base64 of JSON.
  try {
    const inflated = zlib.gunzipSync(bytes).toString('utf8');
    return parseJson(inflated);
  } catch {
    return null;
  }
}

// Strips "Brand~" / "Brand_" / "Brand:" style prefixes. When forcedPrefix is
// set, the value must start with it. Detection is decode-first: the payload
// is decoded as-is, and only if that fails are prefixes stripped, so a
// URL-safe base64 body containing "_" is never corrupted. Brand prefixes are
// short, so only separators in the first 64 characters are considered.
export function prefixCandidates(raw, forcedPrefix) {
  if (forcedPrefix) {
    if (!raw.startsWith(forcedPrefix)) {
      throw new UserError(`The session value does not start with the expected prefix "${forcedPrefix}" (SESSION_PREFIX).`);
    }
    let rest = raw.slice(forcedPrefix.length);
    if (SEPARATORS.includes(rest[0])) rest = rest.slice(1);
    return [rest];
  }
  const positions = [];
  for (const sep of SEPARATORS) {
    let idx = raw.indexOf(sep);
    while (idx > 0 && idx < 64) {
      positions.push(idx);
      idx = raw.indexOf(sep, idx + 1);
    }
  }
  positions.sort((a, b) => a - b);
  return positions.map((pos) => raw.slice(pos + 1));
}

function normalizeDecoded(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new UserError('The decoded session is not a JSON object.');
  }
  // (b) { creds, keys }
  if (obj.creds && typeof obj.creds === 'object') {
    return { creds: obj.creds, keys: obj.keys && typeof obj.keys === 'object' ? obj.keys : {} };
  }
  // (a) a Baileys creds object. Detection keys on noiseKey so that a
  // creds-shaped object missing "me" reaches the creds.me validation below
  // with a precise error message.
  if (obj.noiseKey) {
    return { creds: obj, keys: obj.keys && typeof obj.keys === 'object' ? obj.keys : {} };
  }
  // (c) a map of filenames to file contents.
  if (obj['creds.json']) {
    const creds = obj['creds.json'];
    const keys = {};
    for (const [name, value] of Object.entries(obj)) {
      if (name === 'creds.json' || !value || typeof value !== 'object') continue;
      // Accept both "keys/<type>/<id>.json" and "<type>/<id>.json".
      const cleaned = name.startsWith('keys/') ? name.slice(5) : name;
      const withoutExt = cleaned.endsWith('.json') ? cleaned.slice(0, -5) : cleaned;
      const sepIdx = withoutExt.indexOf('/');
      if (sepIdx <= 0) continue;
      keys[`${withoutExt.slice(0, sepIdx)}:${withoutExt.slice(sepIdx + 1)}`] = value;
    }
    return { creds, keys };
  }
  throw new UserError('The session JSON does not look like Baileys credentials (no creds object and no "creds.json" entry).');
}

export function parseSession(raw, { forcedPrefix = null } = {}) {
  const input = String(raw ?? '').trim();
  if (!input) throw new UserError('The session value is empty.');
  if (Buffer.byteLength(input, 'utf8') > MAX_SESSION_BYTES) {
    throw new UserError(`The session value is larger than ${Math.floor(MAX_SESSION_BYTES / 1024)} KB, which no supported format produces.`);
  }

  let decoded = decodePayload(input);
  if (!decoded) {
    // Throws a UserError when a forced prefix is missing.
    const candidates = prefixCandidates(input, forcedPrefix);
    for (const candidate of candidates) {
      decoded = decodePayload(candidate);
      if (decoded) break;
    }
    if (!decoded) {
      throw new UserError(`Could not decode the session value. Supported formats: ${FORMATS}.`);
    }
  }

  const normalized = normalizeDecoded(decoded);

  if (!normalized.creds.me || typeof normalized.creds.me !== 'object' || !normalized.creds.me.id) {
    throw new UserError('The session failed the "creds.me" check: it has no linked account. Supported formats: ' + FORMATS + '.');
  }
  if (normalized.creds.registered !== true) {
    throw new UserError('The session failed the "creds.registered === true" check: the device was never registered with WhatsApp. Get a fresh session from the pairing site.');
  }
  return { creds: normalized.creds, keys: normalized.keys };
}

// Boot-time auth bootstrap. Rules:
// - SESSION set and no stored state for the number: import it once.
// - SESSION set and the sha256 fingerprint of the value changed since the
//   last import: re-import (Baileys updates keys continually, so later boots
//   always prefer the stored state over the env value).
// - SESSION unset and stored state exists: use the stored state.
// - neither: start fresh so the built-in pairing fallbacks can run.
export async function ensureAuthState({ config, store, sessionId, logger }) {
  const stored = await store.getAuth(sessionId);
  const settings = await store.getSettings(sessionId);
  const storedFingerprint = settings.session_fingerprint || null;

  if (config.session) {
    const fingerprint = crypto.createHash('sha256').update(config.session, 'utf8').digest('hex');
    if (!stored.creds || storedFingerprint !== fingerprint) {
      // Throws a UserError with a safe message if the value is unusable.
      const parsed = parseSession(config.session, { forcedPrefix: config.sessionPrefix });
      await store.wipeAuth(sessionId);
      await store.saveCreds(sessionId, JSON.stringify(parsed.creds, BufferJSON.replacer));
      const keyEntries = Object.entries(parsed.keys).map(([k, v]) => [k, JSON.stringify(v, BufferJSON.replacer)]);
      if (keyEntries.length) await store.setAuthBulk(sessionId, keyEntries);
      await store.setSetting(sessionId, 'session_fingerprint', fingerprint);
      const phone = maskPhone(jidToPhone(parsed.creds.me?.id) || '');
      if (logger) logger.info(`Session imported from the SESSION variable for ${phone}. Later boots use the stored copy, because WhatsApp updates keys continually.`);
    }
  } else if (!stored.creds && logger) {
    logger.info('No session yet: the start page explains how to get one, or use the built-in pairing page or PAIR_NUMBER.');
  }

  const auth = await createStoreAuthState({ store, sessionId });
  return { ...auth, registered: auth.state.creds.registered === true };
}
