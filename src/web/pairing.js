// Pairing portal controller: real WhatsApp pairing for the bot's own
// session. The portal talks to exactly one session (config.portalSessionId)
// and only ever returns a status, a pairing code or a QR image — never the
// credentials Baileys stores on disk.

// E.164 without the plus sign: 7 to 15 digits. Accepts "+", spaces, dashes
// and parentheses in the input and strips everything else.
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s().-]/g, '').replace(/^\+/, '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (!/^[1-9]/.test(digits)) return null;
  return digits;
}

export function maskPhone(digits) {
  const d = String(digits || '');
  if (d.length <= 5) return '*'.repeat(d.length);
  return `${d.slice(0, 3)}••••${d.slice(-2)}`;
}

// Fixed-window rate limiter, keyed per client. In-memory on purpose: the
// portal is a single-process web app. Old windows are swept lazily so the
// Map cannot grow without bound.
export function createRateLimiter({ windowMs, max, nowFn = Date.now } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const now = nowFn();
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 10000) this.sweep(now);
        return { ok: true, remaining: max - 1, resetAt: now + windowMs };
      }
      if (entry.count >= max) {
        return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
      }
      entry.count += 1;
      return { ok: true, remaining: max - entry.count, resetAt: entry.resetAt };
    },
    sweep(now = nowFn()) {
      for (const [key, entry] of hits) {
        if (now >= entry.resetAt) hits.delete(key);
      }
    },
    reset() {
      hits.clear();
    },
    get size() {
      return hits.size;
    }
  };
}

function clientIp(req) {
  // Panel hosts and Heroku terminate TLS on a router; x-forwarded-for holds
  // the real client. Only the first entry is trusted (the connecting proxy).
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function hasPortalKey(req, portalPassword) {
  if (!portalPassword) return true;
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ') && auth.slice(7).trim() === portalPassword) return true;
  const header = req.headers['x-portal-key'];
  return typeof header === 'string' && header.trim() === portalPassword;
}

export function createPairingController({ runtime, portalSessionId, portalPassword = null } = {}) {
  const sessionId = portalSessionId || runtime?.config?.portalSessionId || 'main';

  async function ensureSession() {
    let session = runtime.get(sessionId);
    if (!session) {
      await runtime.store.createSession(sessionId);
      session = await runtime.startSession(sessionId);
    } else if (session.status === 'stopped' || session.status === 'idle') {
      await session.start();
    }
    return session;
  }

  return {
    sessionId,
    portalProtected: Boolean(portalPassword),

    // True when the request may see QR / pairing codes.
    authorize(req) {
      return hasPortalKey(req, portalPassword);
    },

    ip(req) {
      return clientIp(req);
    },

    async status() {
      const session = runtime.get(sessionId);
      const pair = session ? session.activePairRequest?.() || null : null;
      return {
        id: sessionId,
        status: session ? session.status : 'idle',
        connected: session ? session.connected : false,
        portalProtected: Boolean(portalPassword),
        phone: session && session.ownJid ? maskPhone(session.ownJid.split('@')[0]) : null,
        qrVersion: session ? session.qrVersion : 0,
        qrAvailable: Boolean(session && session.lastQr && !session.connected),
        code: pair
          ? { code: pair.code, phone: maskPhone(pair.phone), expiresAt: new Date(pair.expiresAt).toISOString() }
          : null
      };
    },

    // Real pairing-code flow: validates the number, starts (or reuses) the
    // session, waits for the WhatsApp handshake, then asks Baileys for the
    // code the owner types on their phone.
    async requestCode(phoneRaw) {
      const digits = normalizePhone(phoneRaw);
      if (!digits) {
        const err = new Error('Enter a valid phone number in international format, e.g. +254712345678.');
        err.statusCode = 400;
        throw err;
      }
      const session = await ensureSession();
      const pair = await session.requestPairingCode(digits);
      return {
        code: pair.code,
        phone: maskPhone(digits),
        expiresAt: new Date(pair.expiresAt).toISOString()
      };
    },

    // The QR is itself a credential until scanned, so it is only served
    // while the session is unpaired.
    async qr() {
      const session = await ensureSession();
      if (session.connected) {
        return { qr: null, version: session.qrVersion, status: session.status };
      }
      if (!session.lastQr) {
        return { qr: null, version: session.qrVersion, status: session.status };
      }
      const { default: QRCode } = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(session.lastQr, { margin: 1, width: 512 });
      return { qr: dataUrl, version: session.qrVersion, status: session.status };
    }
  };
}
