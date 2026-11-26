import test from 'node:test';
import assert from 'node:assert/strict';
import autolike, { runAutolikeHook, internals, resetInternalState, getState } from '../src/plugins/autolike.js';
import { stubSession, fakeSock, messageStub } from './helpers.js';

const OTHER = '254800000000@s.whatsapp.net';
const OWN = '1000000000@s.whatsapp.net';
const IMAGE_STATUS = { imageMessage: { mimetype: 'image/jpeg' } };

function autolikeContext({ msg = null, settingsRaw = { autolike: true }, ownJid = OWN, owners = [], id = '254700000000' } = {}) {
  const session = stubSession({
    id,
    settingsRaw,
    ownJid,
    owners,
    config: { prefix: '.', owners, publicMode: false, maxMediaBytes: 16 * 1024 * 1024 }
  });
  const sock = fakeSock();
  const message = msg || messageStub({ jid: 'status@broadcast', participant: OTHER, id: `ST-${Math.floor(Math.random() * 1e9)}`, message: IMAGE_STATUS });
  const ctx = {
    session,
    sock,
    msg: message,
    logger: session.logger,
    settings: session.settings,
    config: session.config,
    isStatus: message.key.remoteJid === 'status@broadcast',
    isFromMe: Boolean(message.key.fromMe),
    reply: async (content) => sock.sendMessage(message.key.remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: message })
  };
  return { ctx, session, sock };
}

function fakeTiming() {
  const originalSleep = internals.sleep;
  const originalRandom = internals.randomInt;
  internals.sleep = async () => {};
  internals.randomInt = () => 5000;
  return () => {
    internals.sleep = originalSleep;
    internals.randomInt = originalRandom;
  };
}

test('autolike reacts to other people statuses and marks them viewed', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const { ctx, sock } = autolikeContext();
    await runAutolikeHook(ctx);
    assert.equal(sock.sent.length, 1, 'one reaction sent');
    assert.equal(sock.reads.length, 1, 'and one read receipt');

    const react = sock.sent[0];
    assert.equal(react.jid, 'status@broadcast');
    assert.equal(react.content.react.key, ctx.msg.key);
    assert.equal(react.content.react.text, '\u2764\uFE0F');
    assert.deepEqual(react.opts, { statusJidList: [OTHER, OWN] });

    assert.equal(sock.reads.length, 1, 'the reacted status is also marked viewed');
    assert.deepEqual(sock.reads[0], ctx.msg.key);
  } finally {
    restore();
  }
});

test('autolike never reacts to the owner own statuses', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    // Own status: fromMe.
    const own1 = messageStub({ jid: 'status@broadcast', fromMe: true, participant: OWN, message: IMAGE_STATUS });
    const a = autolikeContext({ msg: own1 });
    await runAutolikeHook(a.ctx);
    assert.equal(a.sock.sent.length, 0);

    // Own status: participant equals the linked number.
    const own2 = messageStub({ jid: 'status@broadcast', participant: OWN, message: IMAGE_STATUS });
    const b = autolikeContext({ msg: own2 });
    await runAutolikeHook(b.ctx);
    assert.equal(b.sock.sent.length, 0);
  } finally {
    restore();
  }
});

test('each status id is reacted to at most once', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const msg = messageStub({ jid: 'status@broadcast', participant: OTHER, id: 'SAME-ID', message: IMAGE_STATUS });
    const { ctx, sock } = autolikeContext({ msg });
    await runAutolikeHook(ctx);
    await runAutolikeHook(ctx);
    const reactions = sock.sent.filter((s) => s.content.react);
    assert.equal(reactions.length, 1);
  } finally {
    restore();
  }
});

test('the hourly cap of 60 reactions is enforced', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const { ctx, sock } = autolikeContext({ id: 'cap-session' });
    const state = getState(ctx.session.id);
    const now = Date.now();
    state.reactions = Array.from({ length: 60 }, (_, i) => now - i * 1000);
    await runAutolikeHook(ctx);
    assert.equal(sock.sent.filter((s) => s.content.react).length, 0, 'must skip when the cap is reached');
  } finally {
    restore();
  }
});

test('reaction state and caps are tracked per session', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const capped = autolikeContext({ id: 'capped-session' });
    const state = getState(capped.session.id);
    state.reactions = Array.from({ length: 60 }, () => Date.now());
    await runAutolikeHook(capped.ctx);
    assert.equal(capped.sock.sent.length, 0);

    const fresh = autolikeContext({ id: 'fresh-session' });
    assert.notEqual(fresh.session.id, capped.session.id);
    await runAutolikeHook(fresh.ctx);
    assert.equal(fresh.sock.sent.filter((s) => s.content.react).length, 1);
  } finally {
    restore();
  }
});

test('a status that is not viewable content is never reacted to', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const msg = messageStub({ jid: 'status@broadcast', participant: OTHER, message: { protocolMessage: { type: 0 } } });
    const { ctx, sock } = autolikeContext({ msg });
    await runAutolikeHook(ctx);
    assert.equal(sock.sent.length, 0);
  } finally {
    restore();
  }
});

test('the command rejects anything that is not a single emoji', async () => {
  resetInternalState();
  const { ctx, session } = autolikeContext({ settingsRaw: { autolike: false } });
  ctx.args = ['on', 'not-an-emoji'];
  ctx.argText = 'on not-an-emoji';
  await autolike.run(ctx);
  assert.equal(session.settings.autolike, false, 'must not turn on with a bad emoji');
  assert.equal(session.settings.autolike_emoji, '\u2764\uFE0F', 'must keep the previous emoji');
  const replies = ctx.sock.sent;
  assert.equal(replies.length, 1);
  assert.match(replies[0].content.text, /exactly one emoji/);
});

test('the command accepts a single emoji and toggles off cleanly', async () => {
  resetInternalState();
  const restore = fakeTiming();
  try {
    const { ctx, session } = autolikeContext({ settingsRaw: { autolike: false } });
    ctx.args = ['on', '\u{1F929}'];
    ctx.argText = 'on \u{1F929}';
    await autolike.run(ctx);
    assert.equal(session.settings.autolike, true);
    assert.equal(session.settings.autolike_emoji, '\u{1F929}');

    ctx.args = ['off'];
    ctx.argText = 'off';
    await autolike.run(ctx);
    assert.equal(session.settings.autolike, false);
    assert.equal(session.settings.autolike_emoji, '\u{1F929}', 'turning off keeps the chosen emoji');
  } finally {
    restore();
  }
});
