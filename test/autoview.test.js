import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutoviewHook, internals as autoviewInternals } from '../src/plugins/autoview.js';
import { statusHasContent } from '../src/core/handler.js';
import { stubSession, fakeSock, messageStub } from './helpers.js';

const PARTICIPANT = '254800000000@s.whatsapp.net';
const IMAGE_STATUS = { imageMessage: { mimetype: 'image/jpeg', caption: 'a status' } };
const TEXT_STATUS = { conversation: 'plain text status' };
const PROTOCOL_STATUS = { protocolMessage: { type: 0 } };

function autoviewContext(overrides = {}) {
  const session = stubSession(overrides.session || {});
  const sock = fakeSock();
  const msg = overrides.msg || messageStub({ jid: 'status@broadcast', participant: PARTICIPANT, id: 'ST1', message: IMAGE_STATUS });
  const ctx = {
    session,
    sock,
    msg,
    logger: session.logger,
    settings: session.settings,
    isStatus: msg.key.remoteJid === 'status@broadcast',
    isFromMe: Boolean(msg.key.fromMe),
    ...overrides.ctx
  };
  return { ctx, session, sock };
}

test('autoview does nothing when the setting is off', async () => {
  const sleepCalls = [];
  const originalSleep = autoviewInternals.sleep;
  autoviewInternals.sleep = async (ms) => sleepCalls.push(ms);
  try {
    const { ctx, sock } = autoviewContext(); // defaults: autoview off
    await runAutoviewHook(ctx);
    assert.equal(sock.reads.length, 0);
    assert.equal(sleepCalls.length, 0);
  } finally {
    autoviewInternals.sleep = originalSleep;
  }
});

test('autoview reads other people statuses with media or text when on', async () => {
  const originalSleep = autoviewInternals.sleep;
  autoviewInternals.sleep = async () => {};
  try {
    for (const body of [IMAGE_STATUS, TEXT_STATUS]) {
      const { ctx, sock } = autoviewContext({ session: { settingsRaw: { autoview: true } }, msg: messageStub({ jid: 'status@broadcast', participant: PARTICIPANT, id: `ST-${Math.random()}`, message: body }) });
      await runAutoviewHook(ctx);
      assert.equal(sock.reads.length, 1);
      assert.deepEqual(sock.reads[0], ctx.msg.key);
      assert.equal(sock.sent.length, 0, 'autoview must only read, never send');
    }
  } finally {
    autoviewInternals.sleep = originalSleep;
  }
});

test('autoview ignores the owner own statuses', async () => {
  const originalSleep = autoviewInternals.sleep;
  autoviewInternals.sleep = async () => {};
  try {
    const msg = messageStub({ jid: 'status@broadcast', fromMe: true, participant: '1000000000@s.whatsapp.net', message: IMAGE_STATUS });
    const { ctx, sock } = autoviewContext({ session: { settingsRaw: { autoview: true } }, msg });
    await runAutoviewHook(ctx);
    assert.equal(sock.reads.length, 0);
  } finally {
    autoviewInternals.sleep = originalSleep;
  }
});

test('autoview skips protocol statuses with no media or text', async () => {
  const originalSleep = autoviewInternals.sleep;
  autoviewInternals.sleep = async () => {};
  try {
    assert.equal(statusHasContent(PROTOCOL_STATUS), false);
    const msg = messageStub({ jid: 'status@broadcast', participant: PARTICIPANT, message: PROTOCOL_STATUS });
    const { ctx, sock } = autoviewContext({ session: { settingsRaw: { autoview: true } }, msg });
    await runAutoviewHook(ctx);
    assert.equal(sock.reads.length, 0);
  } finally {
    autoviewInternals.sleep = originalSleep;
  }
});

test('autoview delays between 1 and 4 seconds before reading', async () => {
  const sleepCalls = [];
  const originalSleep = autoviewInternals.sleep;
  const originalRandom = autoviewInternals.randomInt;
  autoviewInternals.randomInt = (min, max) => { assert.equal(min, 1000); assert.equal(max, 4000); return 2345; };
  autoviewInternals.sleep = async (ms) => sleepCalls.push(ms);
  try {
    const { ctx, sock } = autoviewContext({ session: { settingsRaw: { autoview: true } } });
    await runAutoviewHook(ctx);
    assert.deepEqual(sleepCalls, [2345]);
    assert.equal(sock.reads.length, 1);
  } finally {
    autoviewInternals.sleep = originalSleep;
    autoviewInternals.randomInt = originalRandom;
  }
});

test('a run that becomes stale after a reconnect never touches the socket', async () => {
  const { ctx, sock, session } = autoviewContext({ session: { settingsRaw: { autoview: true } } });
  const originalSleep = autoviewInternals.sleep;
  // Simulate a reconnect happening while the hook waits: the generation moves on.
  autoviewInternals.sleep = async () => { session.generation += 1; session.connected = false; };
  try {
    await runAutoviewHook(ctx);
    assert.equal(sock.reads.length, 0);
  } finally {
    autoviewInternals.sleep = originalSleep;
  }
});
