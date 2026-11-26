import pino from 'pino';
import { config } from './config.js';

const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

// Mask phone numbers inside a log string: keep the first 3 and last digit only.
export function maskText(text) {
  if (typeof text !== 'string') return text;
  return text.replace(PHONE_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7) return match;
    return `${match.slice(0, 3)}${'*'.repeat(Math.max(match.length - 4, 3))}${match.slice(-1)}`;
  });
}

// Mask a JID or phone number for display and logs: 254700000001 -> 254*******1.
export function maskJid(jid) {
  if (jid === undefined || jid === null || jid === '') return 'unknown';
  const s = String(jid);
  const at = s.indexOf('@');
  const user = at >= 0 ? s.slice(0, at) : s;
  const host = at >= 0 ? s.slice(at) : '';
  if (user.length <= 4) return `${'*'.repeat(user.length)}${host}`;
  return `${user.slice(0, 3)}${'*'.repeat(user.length - 4)}${user.slice(-1)}${host}`;
}

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

const root = pino({ level: process.env.LOG_LEVEL || config.logLevel || 'info' });

// Logger wrapper that masks phone numbers in everything it prints, so no
// message content or contact detail ever reaches the logs unmasked.
export class MaskedLogger {
  constructor(base) {
    this.base = base;
    this.level = base.level;
  }

  child(bindings = {}) {
    return new MaskedLogger(this.base.child(bindings));
  }

  _print(level, args) {
    const line = args.filter((a) => typeof a === 'string').map(maskText).join(' ');
    const objects = args.filter((a) => typeof a === 'object' && a !== null);
    if (line) this.base[level](line);
    else if (objects.length > 0) this.base[level](maskLogObject(objects[0]));
    else this.base[level]('');
  }

  trace(...args) { this._print('trace', args); }
  debug(...args) { this._print('debug', args); }
  info(...args) { this._print('info', args); }
  warn(...args) { this._print('warn', args); }
  error(...args) { this._print('error', args); }
  fatal(...args) { this._print('fatal', args); }
}

function maskLogObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') out[key] = maskText(value);
    else out[key] = value;
  }
  return out;
}

export function createLogger(sessionId) {
  return new MaskedLogger(root.child({ session: maskJid(sessionId) }));
}
