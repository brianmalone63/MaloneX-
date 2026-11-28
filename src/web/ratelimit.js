// Fixed-window per-IP rate limiter, in-memory (single process by design).
// Windows are swept lazily so the Map cannot grow without bound.
export function createRateLimiter({ windowMs, max, nowFn = Date.now } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const now = nowFn();
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 10000) this.sweep(now);
        return { ok: true, retryAfter: 0 };
      }
      if (entry.count >= max) {
        return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
      }
      entry.count += 1;
      return { ok: true, retryAfter: 0 };
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

// Client IP for rate limiting. X-Forwarded-For is used ONLY when
// TRUST_PROXY is on, and only its LAST entry (the entry added by the proxy
// closest to the server, which clients cannot spoof). Otherwise the actual
// socket address is used.
export function clientIp(req, { trustProxy }) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}
