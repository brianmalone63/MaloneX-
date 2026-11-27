import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, maskPhone, createRateLimiter, createPairingController } from '../src/web/pairing.js';
import { createWebServer } from '../src/web/server.js';

// A fake session exposing exactly the surface the portal consumes.
function fakeSession(overrides = {}) {
  const session = {
    id: 'main',
    status: 'connecting',
    connected: false,
    ownJid: null,
    qrVersion: 1,
    lastQr: 'fake-qr-string@malonex',
    pairRequest: null,
    requestedPhones: [],
    activePairRequest() {
      if (!this.pairRequest) return null;
      if (Date.now() > this.pairRequest.expiresAt) return null;
      return this.pairRequest;
    },
    async requestPairingCode(phone) {
      if (this.connected) {
        const err = new Error('MaloneX is already connected to WhatsApp.');
        err.statusCode = 409;
        throw err;
      }
      this.requestedPhones.push(phone);
      this.pairRequest = {
        phone,
        code: 'AB12CD34',
        requestedAt: new Date().toISOString(),
        expiresAt: Date.now() + 5 * 60 * 1000
      };
      return this.pairRequest;
    },
    async start() {},
    async stop() {}
  };
  return Object.assign(session, overrides);
}

function fakeRuntime({ adminKey = null, portalPassword = null, sessions = {} } = {}) {
  const created = [];
  const map = new Map(Object.entries(sessions));
  return {
    created,
    config: { portalSessionId: 'main', portalPassword, adminKey, storage: 'file' },
    store: {
      async createSession(id) {
        created.push(id);
        if (!map.has(id)) map.set(id, fakeSession({ status: 'idle', lastQr: null }));
      },
      async listSessions() {
        return [...map.keys()].map((id) => ({ id }));
      }
    },
    get(id) {
      return map.get(id) || null;
    },
    async startSession(id) {
      const session = map.get(id);
      if (!session) throw new Error('unknown session');
      session.status = 'connecting';
      return session;
    },
    async stopSession() {
      return map.size > 0;
    }
  };
}

async function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function withServer(runtime, fn) {
  const server = createWebServer({ runtime });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('normalizePhone', () => {
  it('accepts international formats and strips decorations', () => {
    assert.equal(normalizePhone('+254 712 345 678'), '254712345678');
    assert.equal(normalizePhone('+1 (415) 555-2671'), '14155552671');
    assert.equal(normalizePhone('254712345678'), '254712345678');
    assert.equal(normalizePhone(' 44 7911 123456 '), '447911123456');
  });

  it('rejects invalid numbers', () => {
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone('0712345678'), null); // leading zero: no country code
    assert.equal(normalizePhone('12345'), null); // too short
    assert.equal(normalizePhone('1234567890123456'), null); // too long
    assert.equal(normalizePhone('not a phone'), null);
    assert.equal(normalizePhone(null), null);
  });
});

describe('maskPhone', () => {
  it('keeps only the first three and last two digits', () => {
    assert.equal(maskPhone('254712345678'), '254••••78');
    assert.equal(maskPhone('12345'), '*****');
    assert.equal(maskPhone(''), '');
  });
});

describe('createRateLimiter', () => {
  it('allows up to max then blocks until the window resets', () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 100, max: 3, nowFn: () => now });
    assert.equal(limiter.check('ip').ok, true);
    assert.equal(limiter.check('ip').ok, true);
    assert.equal(limiter.check('ip').ok, true);
    const blocked = limiter.check('ip');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryAfter > 0, true);
    now += 101;
    assert.equal(limiter.check('ip').ok, true);
  });

  it('tracks keys independently and sweeps expired ones', () => {
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 50, max: 1, nowFn: () => now });
    assert.equal(limiter.check('a').ok, true);
    assert.equal(limiter.check('b').ok, true);
    assert.equal(limiter.check('a').ok, false);
    now = 60;
    limiter.sweep();
    assert.equal(limiter.size, 0);
    assert.equal(limiter.check('a').ok, true);
  });
});

describe('pairing portal API', () => {
  it('serves the portal page and health endpoint', async () => {
    await withServer(fakeRuntime(), async (base) => {
      const page = await fetch(`${base}/`);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /MaloneX/);
      assert.match(html, /GET PAIR CODE/);

      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true, storage: 'file' });
    });
  });

  it('returns the portal status shape', async () => {
    const session = fakeSession({ ownJid: '254712345678@s.whatsapp.net' });
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      const res = await fetch(`${base}/api/pair/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.id, 'main');
      assert.equal(data.status, 'connecting');
      assert.equal(data.connected, false);
      assert.equal(data.portalProtected, false);
      assert.equal(data.phone, '254••••78');
      assert.equal(data.qrVersion, 1);
      assert.equal(data.qrAvailable, true);
      assert.equal(data.code, null);
    });
  });

  it('requests a real pairing code through the session and masks the phone', async () => {
    const session = fakeSession({ lastQr: null });
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      const res = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254 712 345 678' })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.code, 'AB12CD34');
      assert.equal(data.phone, '254••••78');
      assert.match(data.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.deepEqual(session.requestedPhones, ['254712345678']);
    });
  });

  it('creates and starts the portal session on demand when missing', async () => {
    const runtime = fakeRuntime();
    await withServer(runtime, async (base) => {
      const res = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254712345678' })
      });
      assert.equal(res.status, 200);
      assert.deepEqual(runtime.created, ['main']);
    });
  });

  it('rejects invalid phone numbers with 400', async () => {
    await withServer(fakeRuntime(), async (base) => {
      const res = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '0712' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /international format/i);
    });
  });

  it('surfaces 409 when the bot is already paired', async () => {
    const session = fakeSession({ connected: true, status: 'connected', lastQr: null });
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      const res = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254712345678' })
      });
      assert.equal(res.status, 409);
    });
  });

  it('rate limits pair-code requests per client', async () => {
    const session = fakeSession({ lastQr: null });
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      for (let i = 0; i < 5; i += 1) {
        const res = await fetch(`${base}/api/pair/code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+254712345678' })
        });
        assert.equal(res.status, 200);
      }
      const sixth = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254712345678' })
      });
      assert.equal(sixth.status, 429);
      assert.ok(sixth.headers.get('retry-after'));
    });
  });

  it('serves a QR data URL only while unpaired', async () => {
    const session = fakeSession();
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      const paired = await fetch(`${base}/api/pair/qr`);
      const pairedData = await paired.json();
      assert.match(pairedData.qr, /^data:image\/png;base64,/);
      assert.equal(pairedData.version, 1);

      session.connected = true;
      session.status = 'connected';
      session.lastQr = null;
      const connected = await fetch(`${base}/api/pair/qr`);
      const connectedData = await connected.json();
      assert.equal(connectedData.qr, null);
      assert.equal(connectedData.status, 'connected');
    });
  });

  it('shows the pending code in status until it expires', async () => {
    const session = fakeSession({ lastQr: null });
    await withServer(fakeRuntime({ sessions: { main: session } }), async (base) => {
      await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254712345678' })
      });
      const status = await (await fetch(`${base}/api/pair/status`)).json();
      assert.equal(status.code.code, 'AB12CD34');

      session.pairRequest.expiresAt = Date.now() - 1;
      const expired = await (await fetch(`${base}/api/pair/status`)).json();
      assert.equal(expired.code, null);
    });
  });

  it('returns 404 for unknown portal routes', async () => {
    await withServer(fakeRuntime(), async (base) => {
      const res = await fetch(`${base}/api/pair/nothing`);
      assert.equal(res.status, 404);
    });
  });
});

describe('portal password protection', () => {
  it('gates status, code and QR behind the key when configured', async () => {
    const session = fakeSession({ lastQr: null });
    await withServer(fakeRuntime({ portalPassword: 'open-sesame', sessions: { main: session } }), async (base) => {
      const noKey = await fetch(`${base}/api/pair/status`);
      assert.equal(noKey.status, 401);

      const badKey = await fetch(`${base}/api/pair/status`, { headers: { 'x-portal-key': 'wrong' } });
      assert.equal(badKey.status, 401);

      const headerKey = await fetch(`${base}/api/pair/status`, { headers: { 'x-portal-key': 'open-sesame' } });
      assert.equal(headerKey.status, 200);

      const bearerKey = await fetch(`${base}/api/pair/status`, { headers: { authorization: 'Bearer open-sesame' } });
      assert.equal(bearerKey.status, 200);

      const status = await headerKey.json();
      assert.equal(status.portalProtected, true);

      const qr = await fetch(`${base}/api/pair/qr`);
      assert.equal(qr.status, 401);

      const code = await fetch(`${base}/api/pair/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+254712345678' })
      });
      assert.equal(code.status, 401);
      assert.deepEqual(session.requestedPhones, []);
    });
  });
});

describe('admin session management API', () => {
  it('is disabled entirely when ADMIN_KEY is not configured', async () => {
    await withServer(fakeRuntime(), async (base) => {
      const res = await fetch(`${base}/api/sessions`);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /ADMIN_KEY/);
    });
  });

  it('requires a valid bearer key when ADMIN_KEY is configured', async () => {
    await withServer(fakeRuntime({ adminKey: 'k', sessions: { main: fakeSession() } }), async (base) => {
      const missing = await fetch(`${base}/api/sessions`);
      assert.equal(missing.status, 401);

      const wrong = await fetch(`${base}/api/sessions`, { headers: { authorization: 'Bearer nope' } });
      assert.equal(wrong.status, 401);

      const ok = await fetch(`${base}/api/sessions`, { headers: { authorization: 'Bearer k' } });
      assert.equal(ok.status, 200);
      const data = await ok.json();
      assert.equal(data.sessions.length, 1);
      assert.equal(data.sessions[0].id, 'main');
    });
  });

  it('rejects admin key bypass attempts with padding differences', async () => {
    await withServer(fakeRuntime({ adminKey: 'k' }), async (base) => {
      const wrong = await fetch(`${base}/api/sessions`, { headers: { 'x-admin-key': 'wrong-length' } });
      assert.equal(wrong.status, 401);
    });
  });
});
