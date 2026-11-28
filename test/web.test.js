import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.js';
import { fakeConfig, fakeLogger, listen, closeServer } from './helpers.js';

function fakeSession() {
  return {
    status: 'idle',
    ownJid: null,
    pairRequest: null,
    health: { messages: 0, commands: 0, errors: 0 },
    async requestPairingCode(phone) {
      this.pairRequest = { phone: '254712345678', code: 'ABCD1234', expiresAt: Date.now() + 60000 };
      return this.pairRequest;
    },
    diagnostics() {
      return [{ label: 'State', value: this.status }];
    },
    uptimeSeconds() {
      return 10;
    }
  };
}

async function withServer(config, fn, session = fakeSession()) {
  const server = createWebServer({ config, session, logger: fakeLogger() });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base, session);
  } finally {
    await closeServer(server);
  }
}

const post = (base, path, body, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

describe('web server', () => {
  it('serves the start page with the pairing site link and brand', async () => {
    await withServer(fakeConfig({ accessKey: 'k' }), async (base) => {
      const res = await fetch(base + '/');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /MaloneX/);
      assert.match(html, /https:\/\/brian\.pairsite\.space/);
      assert.match(html, /Get your session/);
      assert.match(html, /SESSION/);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    });
  });

  it('exposes /health and a safe /api/config', async () => {
    await withServer(fakeConfig({ accessKey: 'k' }), async (base) => {
      const health = await (await fetch(base + '/health')).json();
      assert.deepEqual(health, { ok: true, storage: 'file' });

      const cfg = await (await fetch(base + '/api/config')).json();
      assert.equal(cfg.brand, 'MaloneX');
      assert.equal(cfg.prefix, '.');
      assert.equal(cfg.mode, 'private');
      assert.equal(cfg.pairingSite, 'https://brian.pairsite.space');
      assert.equal(cfg.hasSession, false);
      assert.equal(cfg.paired, false);
      assert.equal(cfg.pairingEnabled, true);
      assert.equal(cfg.storage, 'file');
    });
  });

  it('gates /api/pair behind the access key', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      const missing = await post(base, '/api/pair', { phone: '+254712345678' });
      assert.equal(missing.status, 401);

      const wrong = await post(base, '/api/pair', { phone: '+254712345678' }, { 'x-access-key': 'nope' });
      assert.equal(wrong.status, 401);

      const ok = await post(base, '/api/pair', { phone: '+254712345678' }, { 'x-access-key': 'testkey' });
      assert.equal(ok.status, 200);
      const data = await ok.json();
      assert.equal(data.code, 'ABCD1234');
      assert.equal(data.phone, '+254****678');
    });
  });

  it('disables pairing entirely when ACCESS_KEY is unset', async () => {
    await withServer(fakeConfig({ accessKey: null }), async (base) => {
      const res = await post(base, '/api/pair', { phone: '+254712345678' });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /ACCESS_KEY/);

      const page = await (await fetch(base + '/')).text();
      assert.doesNotMatch(page, /pairBtn/); // No pairing form on the page.
    });
  });

  it('rate limits pair-code requests per address', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      for (let i = 0; i < 5; i += 1) {
        const res = await post(base, '/api/pair', { phone: '+254712345678' }, { 'x-access-key': 'testkey' });
        assert.equal(res.status, 200);
      }
      const sixth = await post(base, '/api/pair', { phone: '+254712345678' }, { 'x-access-key': 'testkey' });
      assert.equal(sixth.status, 429);
      assert.ok(sixth.headers.get('retry-after'));
    });
  });

  it('ignores spoofed X-Forwarded-For when TRUST_PROXY=false', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey', trustProxy: false }), async (base) => {
      const spoof = { 'x-access-key': 'testkey', 'x-forwarded-for': '' };
      for (let i = 0; i < 5; i += 1) {
        spoof['x-forwarded-for'] = `10.0.0.${i}`;
        const res = await post(base, '/api/pair', { phone: '+254712345678' }, spoof);
        assert.equal(res.status, 200);
      }
      spoof['x-forwarded-for'] = '10.9.9.9'; // A "new" spoofed address.
      const sixth = await post(base, '/api/pair', { phone: '+254712345678' }, spoof);
      assert.equal(sixth.status, 429); // Still limited: the socket address is the key.
    });
  });

  it('uses the last X-Forwarded-For entry per proxy hop when TRUST_PROXY=true', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey', trustProxy: true }), async (base) => {
      const headersA = { 'x-access-key': 'testkey', 'x-forwarded-for': '9.9.9.9, 10.0.0.1' };
      const headersB = { 'x-access-key': 'testkey', 'x-forwarded-for': '9.9.9.9, 10.0.0.2' };
      for (let i = 0; i < 5; i += 1) {
        assert.equal((await post(base, '/api/pair', { phone: '+254712345678' }, headersA)).status, 200);
      }
      // Same client chain (last entry 10.0.0.1) is now limited...
      const limited = await post(base, '/api/pair', { phone: '+254712345678' }, headersA);
      assert.equal(limited.status, 429);
      // ...but a different last entry has its own bucket.
      const other = await post(base, '/api/pair', { phone: '+254712345678' }, headersB);
      assert.equal(other.status, 200);
    });
  });

  it('rejects bodies over 4 KB with a safe message', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      const big = JSON.stringify({ phone: '+254712345678', junk: 'x'.repeat(5000) });
      const res = await post(base, '/api/pair', big, { 'x-access-key': 'testkey' });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /4 KB/);
    });
  });

  it('never leaks parser internals for malformed JSON', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      const res = await post(base, '/api/pair', '{not json', { 'x-access-key': 'testkey' });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Something went wrong on the server/);
      assert.doesNotMatch(data.error, /Unexpected token/);
    });
  });

  it('gates the admin overview behind the access key', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      const missing = await fetch(base + '/api/admin/overview');
      assert.equal(missing.status, 401);

      const ok = await fetch(base + '/api/admin/overview', { headers: { 'x-access-key': 'testkey' } });
      assert.equal(ok.status, 200);
      const data = await ok.json();
      assert.equal(data.brand, 'MaloneX');
      assert.ok(Array.isArray(data.diagnostics));
      assert.match(data.diagnostics[0].label, /State/);
    });
  });

  it('reports pairing status only with the access key', async () => {
    await withServer(fakeConfig({ accessKey: 'testkey' }), async (base) => {
      const missing = await fetch(base + '/api/pair/status');
      assert.equal(missing.status, 401);

      const ok = await fetch(base + '/api/pair/status', { headers: { 'x-access-key': 'testkey' } });
      assert.equal(ok.status, 200);
      const data = await ok.json();
      assert.equal(data.status, 'idle');
      assert.equal(data.paired, false);
      assert.equal(data.code, null);
    });
  });

  it('404s unknown routes', async () => {
    await withServer(fakeConfig(), async (base) => {
      assert.equal((await fetch(base + '/api/nothing')).status, 404);
    });
  });
});
