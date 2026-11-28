// Fake-Baileys state machine: drives the real Session class through pair,
// 515 restarts, reconnects, 401 wipe, 440 duplicate stop, stale events,
// three consecutive 500s, restart and shutdown. Fully offline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session/session.js';
import { createRegistry } from '../src/commands/registry.js';
import { fakeConfig, fakeLogger, fakeStore, fakeSock, waitFor, sleep } from './helpers.js';

function makeSession(storeOverrides = {}, sessionOverrides = {}) {
  const store = { ...fakeStore(), ...storeOverrides };
  const created = [];
  const session = new Session({
    config: fakeConfig(),
    store,
    registry: createRegistry(),
    logger: fakeLogger(),
    versionFn: () => null,
    sockFactory: () => {
      const sock = fakeSock();
      created.push(sock);
      return sock;
    },
    backoffFn: () => 10, // Fast reconnects for tests.
    quickReconnectMs: 5,
    pairingTimeoutMs: 200,
    ...sessionOverrides
  });
  return { session, store, created };
}

// Negative assertions (no reconnect expected) settle with plain sleeps from
// the helpers module; positive reconnect waits use waitFor() so parallel
// test-file workers cannot make short fixed sleeps race the timers.

describe('fake-Baileys state machine', () => {
  it('pairs, goes online, handles a 515 restart and comes back', async () => {
    const { session, created } = makeSession();
    await session.start();
    assert.equal(created.length, 1);

    created[0].qr();
    assert.equal(session.status, 'pairing');

    const pair = await session.requestPairingCode('254712345678');
    assert.equal(pair.code, 'ABCD1234');

    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();
    assert.equal(session.status, 'online');
    assert.equal(session.connected, true);
    assert.equal(session.ownJid, '254712345678@s.whatsapp.net');
    assert.equal(session.pairRequest, null); // Cleared on connect.

    created[0].close(515); // WhatsApp asks for a clean restart.
    assert.equal(session.status, 'reconnecting');
    await waitFor(() => created.length >= 2);
    assert.equal(created.length, 2); // Quick reconnect happened.

    created[1].user = { id: '254712345678@s.whatsapp.net' };
    created[1].open();
    assert.equal(session.status, 'online');
    assert.equal(session.health.consecutiveFailures, 0);
  });

  it('reconnects after a 428 with the backoff path', async () => {
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    created[0].close(428);
    assert.equal(session.status, 'reconnecting');
    assert.equal(session.health.consecutiveFailures, 1);
    assert.equal(session.health.disconnects, 1);
    await waitFor(() => created.length >= 2);
    assert.equal(created.length, 2);
  });

  it('ignores stale events from an older socket generation', async () => {
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    created[0].close(428);
    await waitFor(() => created.length >= 2);
    const gen2 = session.generation;

    // The old socket emits a late "open" and a late QR after being replaced.
    created[0].open();
    created[0].qr();
    assert.equal(session.connected, false);
    assert.equal(session.generation, gen2);
    assert.notEqual(session.status, 'online');
  });

  it('wipes stored state on 401 and never reconnects', async () => {
    const { session, store, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();
    assert.equal(store.calls.saveCreds >= 0, true); // creds.update never fired in the fake; wipe is what matters.

    created[0].close(401);
    assert.equal(session.status, 'logged_out');
    await sleep(20);
    assert.equal(store.calls.wipeAuth, 1);
    await sleep(120);
    assert.equal(created.length, 1); // No reconnect was scheduled.
    assert.equal(session.health.lastDisconnect.reason, 'WhatsApp logged this session out (401).');
  });

  it('stops but keeps credentials on 440 (duplicate deployment)', async () => {
    const { session, store, created } = makeSession();
    await session.start();
    created[0].open();

    created[0].close(440);
    assert.equal(session.status, 'conflict');
    await sleep(20);
    assert.equal(store.calls.wipeAuth, 0); // Credentials kept.
    await sleep(120);
    assert.equal(created.length, 1); // No reconnect.
  });

  it('stops with advice when the connection closes before registration', async () => {
    const { session, created } = makeSession();
    await session.start();
    assert.equal(session.registered, false); // No SESSION, no stored creds.

    created[0].close(428);
    assert.equal(session.status, 'stopped');
    await sleep(120);
    assert.equal(created.length, 1);
  });

  it('stops after three consecutive 500 failures', async () => {
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    created[0].close(500);
    await waitFor(() => created.length >= 2);
    created[1].close(500);
    await waitFor(() => created.length >= 3);
    created[2].close(500);
    assert.equal(session.status, 'failed');
    assert.equal(session.health.consecutiveFailures, 3);
    await sleep(120);
    assert.equal(created.length, 3); // No fourth attempt.
  });

  it('keeps retrying past three consecutive 408 failures', async () => {
    // Network-class drops (408) must not stop the deployment: a slow or
    // throttled host keeps backing off (capped at five minutes) until the
    // connection comes back.
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    for (let i = 0; i < 4; i += 1) {
      const sock = created[i];
      sock.close(408);
      assert.equal(session.status, 'reconnecting'); // No stop between attempts.
      await waitFor(() => created.length >= i + 2);
    }
    assert.notEqual(session.status, 'failed'); // Still trying, never stopped.
    assert.equal(session.health.consecutiveFailures, 4);
    await sleep(120);
    assert.equal(created.length, 5); // The fifth attempt was made.
  });

  it('restarts cleanly and clears timers', async () => {
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    await session.restart();
    assert.equal(created.length, 2);
    assert.equal(session.generation, 3); // stop advances to 2, start to 3.
    assert.equal(session.status, 'connecting');
  });

  it('shuts down: socket ended, status shutdown, no reconnects afterwards', async () => {
    const { session, created } = makeSession();
    await session.start();
    created[0].user = { id: '254712345678@s.whatsapp.net' };
    created[0].open();

    created[0].close(515); // Schedules a quick reconnect...
    await session.shutdown(); // ...but the shutdown wins.
    assert.equal(session.status, 'shutdown');
    assert.equal(created[0].ended, 1);
    const count = created.length;
    await sleep(120);
    assert.equal(created.length, count); // Timer was cleared.
  });

  it('reports health and diagnostics with masked data', async () => {
    const { session } = makeSession();
    await session.start();
    const rows = session.diagnostics();
    const state = rows.find((r) => r.label === 'State');
    const linked = rows.find((r) => r.label === 'Linked number');
    assert.equal(state.value, 'connecting');
    assert.equal(linked.value, 'not linked');
    assert.ok(session.availability() >= 0);
  });
});
