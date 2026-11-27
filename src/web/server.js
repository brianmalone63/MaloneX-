import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPairingController, createRateLimiter } from './pairing.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MAX_BODY_BYTES = 64 * 1024;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Checks the bearer key sent by the admin client against config.adminKey
// using a constant-time comparison to avoid timing oracles.
function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function createWebServer({ runtime }) {
  const config = runtime.config;
  const portal = createPairingController({
    runtime,
    portalSessionId: config.portalSessionId,
    portalPassword: config.portalPassword
  });

  // Pair-code requests are expensive (a WhatsApp handshake each) and are the
  // endpoint an abuser would hammer; status polling is cheap but bounded.
  const codeLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5 });
  const pollLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
  const adminLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

  function requirePortalKey(req, res) {
    if (portal.authorize(req)) return true;
    sendJson(res, 401, { error: 'This portal is protected. Provide the portal key.' });
    return false;
  }

  function rateLimit(limiter, req, res) {
    const result = limiter.check(portal.ip(req));
    if (result.ok) return true;
    res.setHeader('Retry-After', String(result.retryAfter));
    sendJson(res, 429, { error: `Too many requests. Try again in ${result.retryAfter}s.` });
    return false;
  }

  function requireAdmin(req, res) {
    if (!config.adminKey) {
      sendJson(res, 403, { error: 'Session management is disabled. Set ADMIN_KEY to enable it.' });
      return false;
    }
    const header = req.headers['authorization'] || '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-admin-key'] || '');
    if (!timingSafeEqual(key, config.adminKey)) {
      sendJson(res, 401, { error: 'Invalid admin key.' });
      return false;
    }
    return true;
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, storage: config.storage });
        return;
      }

      // ---- Pairing portal API -------------------------------------------
      if (parts[0] === 'api' && parts[1] === 'pair') {
        if (!rateLimit(pollLimiter, req, res)) return;

        if (req.method === 'GET' && url.pathname === '/api/pair/status') {
          if (!requirePortalKey(req, res)) return;
          sendJson(res, 200, await portal.status());
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/pair/qr') {
          if (!requirePortalKey(req, res)) return;
          sendJson(res, 200, await portal.qr());
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/pair/code') {
          if (!requirePortalKey(req, res)) return;
          if (!rateLimit(codeLimiter, req, res)) return;
          const body = await readBody(req);
          sendJson(res, 200, await portal.requestCode(body.phone));
          return;
        }

        sendJson(res, 404, { error: 'Not found.' });
        return;
      }

      // ---- Session management API (admin only) --------------------------
      if (parts[0] === 'api' && parts[1] === 'sessions') {
        if (!rateLimit(adminLimiter, req, res)) return;
        if (!requireAdmin(req, res)) return;
        const id = parts[2];

        if (req.method === 'POST' && parts.length === 2) {
          // Create a new session: the id comes from the JSON body, not the URL.
          const body = await readBody(req);
          const newId = String(body.id || '');
          if (!SESSION_ID_RE.test(newId)) {
            sendJson(res, 400, { error: 'Invalid session id.' });
            return;
          }
          await runtime.store.createSession(newId);
          const session = await runtime.startSession(newId);
          sendJson(res, 201, { id: newId, status: session.status });
          return;
        }

        if (req.method === 'GET' && parts.length === 2) {
          const list = [];
          for (const meta of await runtime.store.listSessions()) {
            const session = runtime.get(meta.id);
            list.push({
              id: meta.id,
              phone: meta.phone || null,
              status: session ? session.status : 'stopped',
              connected: session ? session.connected : false,
              health: session ? session.health : null
            });
          }
          sendJson(res, 200, { sessions: list });
          return;
        }

        if (!id || !SESSION_ID_RE.test(id)) {
          sendJson(res, 400, { error: 'Invalid session id.' });
          return;
        }

        if (req.method === 'POST' && parts[3] === 'start') {
          const session = await runtime.startSession(id);
          sendJson(res, 200, { id, status: session.status });
          return;
        }

        if (req.method === 'POST' && parts[3] === 'stop') {
          const stopped = await runtime.stopSession(id);
          sendJson(res, stopped ? 200 : 404, stopped ? { id, status: 'stopped' } : { error: 'Unknown session.' });
          return;
        }

        if (req.method === 'POST' && parts[3] === 'restart') {
          const session = runtime.get(id);
          if (!session) {
            sendJson(res, 404, { error: 'Unknown session.' });
            return;
          }
          await session.restart();
          sendJson(res, 200, { id, status: session.status });
          return;
        }

        if (req.method === 'GET' && parts[3] === 'qr') {
          const session = runtime.get(id);
          if (!session || !session.lastQr) {
            sendJson(res, 200, { id, qr: null, status: session ? session.status : 'stopped' });
            return;
          }
          const { default: QRCode } = await import('qrcode');
          const dataUrl = await QRCode.toDataURL(session.lastQr);
          sendJson(res, 200, { id, qr: dataUrl, status: session.status });
          return;
        }

        if (req.method === 'GET' && parts.length === 3) {
          const session = runtime.get(id);
          if (!session) {
            sendJson(res, 404, { error: 'Unknown session.' });
            return;
          }
          sendJson(res, 200, { id, ...session.info });
          return;
        }

        if (req.method === 'DELETE' && parts.length === 3) {
          await runtime.stopSession(id);
          const deleted = await runtime.store.deleteSession(id);
          sendJson(res, deleted ? 200 : 404, deleted ? { id, deleted: true } : { error: 'Unknown session.' });
          return;
        }

        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      }

      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 400;
      sendJson(res, status, { error: err.message });
    }
  });
}
