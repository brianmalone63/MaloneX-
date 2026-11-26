import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

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

export function createWebServer({ runtime }) {
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
        sendJson(res, 200, { ok: true, storage: runtime.config.storage });
        return;
      }

      if (parts[0] !== 'api' || parts[1] !== 'sessions') {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }
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
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });
}
