// Web server on node:http, no framework.
//   GET  /                    start page (session instructions / pairing form)
//   GET  /health              liveness probe
//   GET  /api/config          safe, public configuration info
//   POST /api/pair            request a pairing code (ACCESS_KEY gated)
//   GET  /api/pair/status     pairing status (ACCESS_KEY gated when set)
//   GET  /api/admin/overview  health + diagnostics (x-access-key required)
// 4 KB body limit, security headers on every response, per-IP rate limits,
// X-Forwarded-For used only when TRUST_PROXY=true (last entry only).
import http from 'node:http';
import { renderHomePage } from './pages.js';
import { createRateLimiter, clientIp } from './ratelimit.js';
import { UserError, safeMessage } from '../core/errors.js';
import { maskPhone, jidToPhone } from '../core/phones.js';

const MAX_BODY_BYTES = 4 * 1024;

export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'");
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new UserError('The request body is larger than 4 KB.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function createWebServer({ config, session, logger }) {
  // Pairing codes cost a WhatsApp handshake, so they are tightly limited;
  // status polling is cheap but still bounded.
  const pairLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5 });
  const pollLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
  const adminLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
  const hasKey = config.accessKey !== null;

  function requireAccessKey(req, res, purpose) {
    if (!hasKey) {
      sendJson(res, 403, { error: `${purpose} is disabled until the ACCESS_KEY variable is set on this deployment.` });
      return false;
    }
    const provided = req.headers['x-access-key'];
    if (!timingSafeEqual(provided, config.accessKey)) {
      sendJson(res, 401, { error: `Missing or wrong access key. ${purpose} needs the ACCESS_KEY value in the form or in the x-access-key header.` });
      return false;
    }
    return true;
  }

  function rateLimit(limiter, req, res) {
    const result = limiter.check(clientIp(req, { trustProxy: config.trustProxy }));
    if (result.ok) return true;
    res.setHeader('Retry-After', String(result.retryAfter));
    sendJson(res, 429, { error: `Too many requests from your address. Try again in ${result.retryAfter}s.` });
    return false;
  }

  function sessionPhone() {
    return session?.ownJid ? maskPhone(jidToPhone(session.ownJid) || '') : null;
  }

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
  }

  function sendHtml(res, status, html) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html)
    });
    res.end(html);
  }

  const httpServer = http.createServer(async (req, res) => {
    applySecurityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        sendHtml(res, 200, renderHomePage({
          brand: config.brand,
          status: session?.status || 'idle',
          phone: sessionPhone(),
          pairingSiteUrl: config.pairingSiteUrl,
          pairingEnabled: hasKey,
          hasSession: config.session !== null
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, storage: config.storage });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        if (!rateLimit(pollLimiter, req, res)) return;
        sendJson(res, 200, {
          brand: config.brand,
          prefix: config.prefix,
          mode: config.mode,
          pairingSite: config.pairingSiteUrl,
          hasSession: config.session !== null,
          paired: sessionPhone() !== null,
          phone: sessionPhone(),
          status: session?.status || 'idle',
          pairingEnabled: hasKey,
          storage: config.storage
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/pair') {
        if (!rateLimit(pairLimiter, req, res)) return;
        if (!requireAccessKey(req, res, 'Pairing')) return;
        const body = await readBody(req);
        const pair = await session.requestPairingCode(body.phone);
        sendJson(res, 200, {
          code: pair.code,
          phone: maskPhone(pair.phone),
          expiresAt: new Date(pair.expiresAt).toISOString()
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/pair/status') {
        if (!rateLimit(pollLimiter, req, res)) return;
        if (!requireAccessKey(req, res, 'Pairing status')) return;
        const pair = session?.pairRequest || null;
        const active = pair && Date.now() <= pair.expiresAt ? pair : null;
        sendJson(res, 200, {
          status: session?.status || 'idle',
          paired: sessionPhone() !== null,
          phone: sessionPhone(),
          code: active ? { phone: maskPhone(active.phone), expiresAt: new Date(active.expiresAt).toISOString() } : null
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
        if (!rateLimit(adminLimiter, req, res)) return;
        if (!requireAccessKey(req, res, 'The admin overview')) return;
        sendJson(res, 200, {
          brand: config.brand,
          mode: config.mode,
          prefix: config.prefix,
          storage: config.storage,
          status: session?.status || 'idle',
          uptimeSeconds: session?.uptimeSeconds?.() ?? 0,
          health: session?.health || null,
          diagnostics: session?.diagnostics?.() || []
        });
        return;
      }

      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      if (logger) logger.warn(`web request ${req.method} ${url.pathname} failed: ${err.message}`);
      sendJson(res, 400, { error: safeMessage(err) });
    }
  });

  return httpServer;
}
