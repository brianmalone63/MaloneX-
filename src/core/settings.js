// Per-session settings schema. Unknown keys are rejected. Values are stored as
// JSON text on both storage backends and kept in session.settings in memory.
//
// Conventions:
// - Safety-relevant automation (protections, auto replies) defaults to off.
// - A default of '' or 'env' means "inherit from the environment / config.js".

const DEFAULTS = {
  // --- automation (original MaloneX feature set) ---
  autoview: { type: 'boolean', default: false, description: 'Automatically view incoming statuses' },
  autolike: { type: 'boolean', default: false, description: 'Automatically react to incoming statuses' },
  autolike_emoji: { type: 'emoji', default: '❤️', description: 'Reaction used by auto like' },
  vv_destination: { type: 'enum', values: ['self', 'chat'], default: 'self', description: 'Where retrieved view-once media is delivered' },

  // --- identity ---
  PREFIX: { type: 'string', maxLen: 8, default: '', description: 'Command prefix (empty = use environment value)' },
  BOT_NAME: { type: 'string', maxLen: 40, default: 'MaloneX', description: 'Bot display name' },
  OWNER_NAME: { type: 'string', maxLen: 40, default: 'Brian Malone', description: 'Owner display name' },
  FOOTER: { type: 'string', maxLen: 80, default: 'MaloneX', description: 'Footer line used in bot replies' },
  CAPTION: { type: 'string', maxLen: 120, default: 'MaloneX', description: 'Caption appended to delivered media' },
  BOT_PIC: { type: 'string', maxLen: 300, default: '', description: 'Image URL shown with menus' },
  TIME_ZONE: { type: 'string', maxLen: 60, default: 'Africa/Nairobi', description: 'IANA time zone for dates and times' },
  MODE: { type: 'enum', values: ['env', 'public', 'private'], default: 'env', description: 'Access mode (env = follow PUBLIC_MODE)' },

  // --- chat presence and behaviour ---
  DM_PRESENCE: { type: 'enum', values: ['offline', 'online', 'typing', 'recording'], default: 'offline', description: 'Presence shown in private chats' },
  GC_PRESENCE: { type: 'enum', values: ['offline', 'online', 'typing', 'recording'], default: 'offline', description: 'Presence shown in groups' },
  CHATBOT: { type: 'enum', values: ['off', 'on', 'audio'], default: 'off', description: 'AI chatbot replies for non-command messages' },
  CHATBOT_MODE: { type: 'enum', values: ['inbox', 'groups', 'allchats'], default: 'inbox', description: 'Where the chatbot answers' },
  AUTO_REACT: { type: 'enum', values: ['off', 'all', 'dm', 'groups', 'commands'], default: 'off', description: 'Automatic emoji reactions' },
  AUTO_READ_MESSAGES: { type: 'enum', values: ['off', 'all', 'dm', 'groups', 'commands'], default: 'off', description: 'Mark messages as read' },
  AUTO_BIO: { type: 'boolean', default: false, description: 'Keep a time-aware profile status' },
  START_BANNER: { type: 'boolean', default: false, description: 'Send a summary message after connecting' },

  // --- status automation ---
  STATUS_LIKE_EMOJIS: { type: 'string', maxLen: 120, default: '❤️,💛,💜,🤍,💙', description: 'Emoji pool used when auto like picks a random reaction' },
  AUTO_REPLY_STATUS: { type: 'boolean', default: false, description: 'Reply to statuses when auto view is on' },
  STATUS_REPLY_TEXT: { type: 'string', maxLen: 200, default: 'Your status has been viewed.', description: 'Text used when auto reply status is on' },

  // --- protections ---
  ANTIDELETE: { type: 'enum', values: ['off', 'inchat', 'indm'], default: 'off', description: 'Resend deleted messages' },
  ANTI_EDIT: { type: 'enum', values: ['off', 'inchat', 'indm'], default: 'off', description: 'Report edited messages' },
  ANTICALL: { type: 'enum', values: ['off', 'on', 'block'], default: 'off', description: 'Reject incoming calls' },
  ANTIVIEWONCE: { type: 'enum', values: ['off', 'indm', 'inchat'], default: 'off', description: 'Auto-reveal view-once media' },
  PM_PERMIT: { type: 'boolean', default: false, description: 'Only allow owners to write in private chat' },
  AUTO_BLOCK: { type: 'string', maxLen: 120, default: '', description: 'Country codes to auto-block, comma separated' },

  // --- sudo users (extra super users beyond OWNER) ---
  SUDO_NUMBERS: { type: 'string', maxLen: 400, default: '', description: 'Comma separated phone numbers with owner-level access' },

  // --- media branding ---
  PACK_NAME: { type: 'string', maxLen: 40, default: 'MaloneX', description: 'Sticker pack name' },
  PACK_AUTHOR: { type: 'string', maxLen: 40, default: 'Brian Malone', description: 'Sticker pack author' },

  // --- newsletter bridge (optional) ---
  NEWSLETTER_JID: { type: 'string', maxLen: 80, default: '', description: 'Channel JID auto-followed and auto-reacted' },

  // --- external service configuration (all optional) ---
  AI_API_URL: { type: 'string', maxLen: 300, default: '', description: 'OpenAI-compatible chat completions base URL' },
  AI_API_KEY: { type: 'string', maxLen: 200, default: '', description: 'API key for the AI provider' },
  AI_MODEL: { type: 'string', maxLen: 60, default: 'gpt-4o-mini', description: 'Model name for AI commands' },
  IMG_API_URL: { type: 'string', maxLen: 300, default: '', description: 'Image generation or enhancement provider base URL' },
  IMG_API_KEY: { type: 'string', maxLen: 200, default: '', description: 'API key for the image provider' },
  MEDIA_API_URL: { type: 'string', maxLen: 300, default: '', description: 'Cobalt-compatible media download provider base URL' },
  MEDIA_API_KEY: { type: 'string', maxLen: 200, default: '', description: 'API key or token for the media provider' },
  SPORTS_API_URL: { type: 'string', maxLen: 300, default: '', description: 'Football data provider base URL' },
  SPORTS_API_KEY: { type: 'string', maxLen: 200, default: '', description: 'API key for the football data provider' },
  TENOR_API_KEY: { type: 'string', maxLen: 200, default: '', description: 'Tenor API key used by sticker search' },
  IMGBB_KEY: { type: 'string', maxLen: 200, default: '', description: 'ImgBB API key used by the imgbb uploader' }
};

export const SETTINGS_SCHEMA = DEFAULTS;
export const SETTING_KEYS = Object.keys(DEFAULTS);

const SINGLE_EMOJI_RE = /^\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*$/u;

export function isSingleEmoji(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (!SINGLE_EMOJI_RE.test(v)) return false;
  const bases = v.match(/\p{Extended_Pictographic}/gu) || [];
  // Allow one base character, or up to three joined by ZWJ (family, flag and
  // similar sequences). Anything longer is not a single reaction.
  return bases.length >= 1 && bases.length <= 3;
}

export function validateSetting(key, value) {
  const spec = SETTINGS_SCHEMA[key];
  if (!spec) {
    return { ok: false, error: `Unknown setting "${String(key)}".` };
  }
  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { ok: false, error: `Setting "${key}" must be true or false.` };
    }
    return { ok: true, value };
  }
  if (spec.type === 'number') {
    const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(num)) {
      return { ok: false, error: `Setting "${key}" must be a number.` };
    }
    if (spec.min !== undefined && num < spec.min) {
      return { ok: false, error: `Setting "${key}" must be at least ${spec.min}.` };
    }
    if (spec.max !== undefined && num > spec.max) {
      return { ok: false, error: `Setting "${key}" must be at most ${spec.max}.` };
    }
    return { ok: true, value: num };
  }
  if (spec.type === 'emoji') {
    if (!isSingleEmoji(value)) {
      return { ok: false, error: `Setting "${key}" must be a single emoji character.` };
    }
    return { ok: true, value: value.trim() };
  }
  if (spec.type === 'enum') {
    if (typeof value !== 'string' || !spec.values.includes(value)) {
      return { ok: false, error: `Setting "${key}" must be one of: ${spec.values.join(', ')}.` };
    }
    return { ok: true, value };
  }
  if (spec.type === 'string') {
    if (typeof value !== 'string') {
      return { ok: false, error: `Setting "${key}" must be text.` };
    }
    const v = value.trim();
    if (spec.maxLen && v.length > spec.maxLen) {
      return { ok: false, error: `Setting "${key}" must be at most ${spec.maxLen} characters.` };
    }
    return { ok: true, value: v };
  }
  return { ok: false, error: `Setting "${key}" has an unsupported type.` };
}

// Build a complete settings object: defaults for missing keys, stored values
// for known keys, unknown stored keys are dropped.
export function applyDefaults(raw = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SCHEMA)) {
    const stored = raw ? raw[key] : undefined;
    out[key] = stored === undefined ? spec.default : stored;
  }
  return out;
}

export function defaultSettings() {
  return applyDefaults({});
}
