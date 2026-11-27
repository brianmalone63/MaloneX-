import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/core/session.js';

function fakeStore() {
  return {
    saved: [],
    async sessionDir() { return '/tmp/does-not-matter'; },
    async saveSessionMeta(id, meta) { this.saved.push({ id, meta }); },
    async getSettings() { return {}; },
    async setSetting() {},
    async resetAuth() {}
  };
}

function fakeConfig() {
  return { owners: [], publicMode: false };
}

function makeSession() {
  const session = new Session({ id: 'main', store: fakeStore(), config: fakeConfig(), registry: {} });
  session.pairingReadyTimeoutMs = 30000;
  return session;
}

function fakeSock() {
  return {
    user: null,
    pairingRequests: [],
    async requestPairingCode(phone) {
      this.pairingRequests.push(phone);
      return 'ab12cd34';
    },
    end() {},
    async logout() {}
  };
}

describe('Session.requestPairingCode', () => {
  it('refuses to pair when the session is already connected', async () => {
    const session = makeSession();
    session.connected = true;
    await assert.rejects(
      () => session.requestPairingCode('254712345678'),
      (err) => err.statusCode === 409 && /already connected/i.test(err.message)
    );
  });

  it('refuses to pair while the session is shutting down', async () => {
    const session = makeSession();
    session.stopping = true;
    await assert.rejects(
      () => session.requestPairingCode('254712345678'),
      /shutting down/i
    );
  });

  it('requests the code through Baileys once the handshake is ready', async () => {
    const session = makeSession();
    const sock = fakeSock();
    session.sock = sock;
    // Simulate the QR event having fired: the noise handshake is done.
    session.lastQrAt = Date.now();
    const pair = await session.requestPairingCode('254712345678');
    assert.deepEqual(sock.pairingRequests, ['254712345678']);
    assert.equal(pair.code, 'AB12CD34');
    assert.equal(pair.phone, '254712345678');
    assert.ok(pair.expiresAt > Date.now());
    assert.equal(session.status, 'pairing');
    assert.equal(session.activePairRequest().code, 'AB12CD34');
  });

  it('fails with a clear error when WhatsApp is not ready in time', async () => {
    const session = makeSession();
    session.pairingReadyTimeoutMs = 100;
    session.sock = fakeSock();
    session.lastQrAt = null; // handshake never completes
    await assert.rejects(
      () => session.requestPairingCode('254712345678'),
      /did not become ready/i
    );
  });

  it('wraps socket failures in a readable error', async () => {
    const session = makeSession();
    const sock = fakeSock();
    sock.requestPairingCode = async () => {
      throw new Error('Connection Closed');
    };
    session.sock = sock;
    session.lastQrAt = Date.now();
    await assert.rejects(
      () => session.requestPairingCode('254712345678'),
      /WhatsApp rejected the pairing request/
    );
  });

  it('expires pairing requests lazily', () => {
    const session = makeSession();
    session.pairRequest = { phone: '254712345678', code: 'AB12CD34', expiresAt: Date.now() - 1 };
    assert.equal(session.activePairRequest(), null);
  });
});

describe('Session pairing lifecycle', () => {
  it('clears the pairing request when the connection opens', () => {
    const session = makeSession();
    session.pairRequest = { phone: '254712345678', code: 'AB12CD34', expiresAt: Date.now() + 100000 };
    session.lastQr = 'old-qr';
    session.generation = 3;
    session.sock = fakeSock();
    session.sock.user = { id: '254712345678@s.whatsapp.net' };
    session.onConnectionUpdate({ connection: 'open' }, 3);
    assert.equal(session.connected, true);
    assert.equal(session.status, 'connected');
    assert.equal(session.pairRequest, null);
    assert.equal(session.lastQr, null);
    assert.equal(session.ownJid, '254712345678@s.whatsapp.net');
    assert.match(session.store.saved[0].meta.phone, /^254712345678$/);
  });

  it('ignores connection updates from an older generation', () => {
    const session = makeSession();
    session.generation = 5;
    session.onConnectionUpdate({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 428 } } } }, 4);
    assert.equal(session.status, 'idle');
    assert.equal(session.connected, false);
  });

  it('stops cleanly and forgets the pairing request', async () => {
    const session = makeSession();
    session.pairRequest = { phone: '254712345678', code: 'AB12CD34', expiresAt: Date.now() + 100000 };
    session.sock = fakeSock();
    await session.stop();
    assert.equal(session.pairRequest, null);
    assert.equal(session.status, 'stopped');
  });

  it('exposes qrVersion in the info payload for portal polling', () => {
    const session = makeSession();
    session.qrVersion = 7;
    assert.equal(session.info.qrVersion, 7);
    session.onConnectionUpdate({ qr: 'new-qr' }, session.generation);
    assert.equal(session.qrVersion, 8);
    assert.equal(session.status, 'pairing');
    assert.equal(session.lastQr, 'new-qr');
    assert.ok(session.lastQrAt > 0);
  });
});
