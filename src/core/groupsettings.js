// Per-group settings stored on whichever backend the session uses.
// Defaults are applied on read; unknown keys are stored but ignored by guards.

export const GROUP_SETTING_DEFAULTS = {
  WELCOME_MESSAGE: 'off',
  GOODBYE_MESSAGE: 'off',
  GROUP_EVENTS: 'off',
  WELCOME_TEXT: '',
  GOODBYE_TEXT: '',
  ANTILINK: 'off',
  ANTILINK_WARN_COUNT: '5',
  ANTIBAD: 'off',
  ANTIBAD_WARN_COUNT: '5',
  ANTIGROUPMENTION: 'off',
  ANTIGROUPMENTION_WARN_COUNT: '3',
  ANTIPROMOTE: 'off',
  ANTIDEMOTE: 'off'
};

export const GROUP_SETTING_KEYS = Object.keys(GROUP_SETTING_DEFAULTS);

export function groupSettingSpec(key) {
  return {
    WELCOME_MESSAGE: { values: ['off', 'on'] },
    GOODBYE_MESSAGE: { values: ['off', 'on'] },
    GROUP_EVENTS: { values: ['off', 'on'] },
    WELCOME_TEXT: { text: true, maxLen: 500 },
    GOODBYE_TEXT: { text: true, maxLen: 500 },
    ANTILINK: { values: ['off', 'warn', 'delete', 'kick'] },
    ANTILINK_WARN_COUNT: { number: true, min: 1, max: 50 },
    ANTIBAD: { values: ['off', 'warn', 'delete', 'kick'] },
    ANTIBAD_WARN_COUNT: { number: true, min: 1, max: 50 },
    ANTIGROUPMENTION: { values: ['off', 'warn', 'delete', 'kick'] },
    ANTIGROUPMENTION_WARN_COUNT: { number: true, min: 1, max: 50 },
    ANTIPROMOTE: { values: ['off', 'on'] },
    ANTIDEMOTE: { values: ['off', 'on'] }
  }[key] || { text: true, maxLen: 500 };
}

export function validateGroupSetting(key, value) {
  const spec = groupSettingSpec(key);
  if (spec.values) {
    const v = String(value).toLowerCase().trim();
    if (!spec.values.includes(v)) {
      return { ok: false, error: `"${key}" must be one of: ${spec.values.join(', ')}.` };
    }
    return { ok: true, value: v };
  }
  if (spec.number) {
    const num = Number.parseInt(String(value), 10);
    if (!Number.isFinite(num) || num < spec.min || num > spec.max) {
      return { ok: false, error: `"${key}" must be a number between ${spec.min} and ${spec.max}.` };
    }
    return { ok: true, value: String(num) };
  }
  const v = String(value ?? '').trim();
  if (v.length > (spec.maxLen || 500)) {
    return { ok: false, error: `"${key}" must be at most ${spec.maxLen} characters.` };
  }
  return { ok: true, value: v };
}

// Read a group's settings with defaults applied.
export async function readGroupSettings(store, sessionId, groupJid) {
  let stored = {};
  try {
    stored = (await store.getGroupSettings(sessionId, groupJid)) || {};
  } catch {
    stored = {};
  }
  return { ...GROUP_SETTING_DEFAULTS, ...stored };
}

export async function writeGroupSetting(store, sessionId, groupJid, key, value) {
  const check = validateGroupSetting(key, value);
  if (!check.ok) return check;
  await store.setGroupSetting(sessionId, groupJid, key, check.value);
  return check;
}

// ---- warning counters (stored as JSON docs) ----

export async function addWarning(store, sessionId, groupJid, userJid, kind = 'antilink') {
  const collection = `warn_${kind}`;
  const num = userJid.split('@')[0];
  const current = (await store.getDoc(sessionId, collection, groupJid)) || {};
  current[num] = (current[num] || 0) + 1;
  await store.setDoc(sessionId, collection, groupJid, current);
  return current[num];
}

export async function resetWarnings(store, sessionId, groupJid, userJid, kind = 'antilink') {
  const collection = `warn_${kind}`;
  const current = (await store.getDoc(sessionId, collection, groupJid)) || {};
  delete current[userJid.split('@')[0]];
  await store.setDoc(sessionId, collection, groupJid, current);
}

// ---- bad words list per group ----

export const DEFAULT_BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'whore', 'slut',
  'fag', 'nigga', 'nigger', 'retard', 'motherfucker', 'cock', 'prick', 'bullshit',
  'malaya', 'mkundu', 'matako', 'mjinga', 'pumbavu'
];

export async function getBadWords(store, sessionId, groupJid) {
  const doc = (await store.getDoc(sessionId, 'badwords', groupJid)) || { words: null };
  if (!doc.words) return DEFAULT_BAD_WORDS;
  return doc.words;
}

export async function setBadWords(store, sessionId, groupJid, words) {
  await store.setDoc(sessionId, 'badwords', groupJid, { words: words.map((w) => w.toLowerCase().trim()).filter(Boolean) });
}

export function containsBadWord(text, words) {
  const body = String(text || '').toLowerCase();
  if (!body) return null;
  for (const word of words) {
    const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(body)) return word;
  }
  return null;
}
