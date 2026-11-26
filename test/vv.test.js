import test from 'node:test';
import assert from 'node:assert/strict';
import vvCommands, { internals, unwrapViewOnce } from '../src/plugins/vv.js';
import { stubSession, fakeSock, messageStub } from './helpers.js';

const [vv, vvmode] = vvCommands;
const OWN = '1000000000@s.whatsapp.net';
const OTHER = '254800000000@s.whatsapp.net';
const CHAT = '254700000000@s.whatsapp.net';

const VIEW_ONCE_IMAGE = {
  viewOnceMessageV2: {
    message: { imageMessage: { mimetype: 'image/jpeg', caption: 'hidden' } }
  }
};
const VIEW_ONCE_AUDIO = {
  viewOnceMessageV2Extension: {
    message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } }
  }
};
const PLAIN_IMAGE = { imageMessage: { mimetype: 'image/jpeg' } };

function vvContext({ quoted = null, message = null, settingsRaw = {} } = {}) {
  const session = stubSession({ settingsRaw, ownJid: OWN });
  const sock = fakeSock();
  const body = message || {
    extendedTextMessage: {
      text: '.vv',
      contextInfo: quoted === null ? undefined : { quotedMessage: quoted, participant: OTHER }
    }
  };
  const msg = messageStub({ jid: CHAT, fromMe: true, message: body });
  const ctx = {
    session,
    sock,
    msg,
    logger: session.logger,
    settings: session.settings,
    config: session.config,
    jid: CHAT,
    quoted: msg.message.extendedTextMessage?.contextInfo?.quotedMessage || null,
    args: [],
    argText: '',
    isStatus: false,
    isFromMe: true,
    isOwner: true,
    reply: async (content) => sock.sendMessage(CHAT, typeof content === 'string' ? { text: content } : content, { quoted: msg })
  };
  return { ctx, session, sock };
}

test('replying without a quoted message answers with usage text', async () => {
  const { ctx, sock } = vvContext({ quoted: null });
  await vv.run(ctx);
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /Reply to a view-once message/);
});

test('a quoted message that is not view-once answers with a clear error', async () => {
  const { ctx, sock } = vvContext({ quoted: PLAIN_IMAGE });
  await vv.run(ctx);
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /not a view-once message/);
});

test('a view-once image is downloaded and delivered to the owner own chat by default', async () => {
  const downloads = [];
  const originalDownload = internals.downloadMediaMessage;
  internals.downloadMediaMessage = async (message, type, opts) => {
    downloads.push({ message, type, opts });
    return Buffer.from('image-bytes');
  };
  try {
    const { ctx, sock } = vvContext({ quoted: VIEW_ONCE_IMAGE });
    await vv.run(ctx);

    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].type, 'buffer');
    assert.deepEqual(downloads[0].message.message, VIEW_ONCE_IMAGE);
    assert.ok(typeof downloads[0].opts.reuploadRequest === 'function');

    assert.equal(sock.sent.length, 2);
    const send = sock.sent[0];
    assert.equal(send.jid, OWN, 'default destination is the linked number');
    assert.deepEqual(send.content.image, Buffer.from('image-bytes'));
    assert.match(send.content.caption, /View-once retrieved/);
    assert.match(send.content.caption, /image · 0\.00 MB|image ·/);

    // The source chat gets a short confirmation when the media goes elsewhere.
    const confirm = sock.sent[1];
    assert.equal(confirm.jid, CHAT);
    assert.match(confirm.content.text, /your own chat/);
  } finally {
    internals.downloadMediaMessage = originalDownload;
  }
});

test('vv_destination chat delivers the media back into the source chat', async () => {
  const originalDownload = internals.downloadMediaMessage;
  internals.downloadMediaMessage = async () => Buffer.from('image-bytes');
  try {
    const { ctx, sock } = vvContext({ quoted: VIEW_ONCE_IMAGE, settingsRaw: { vv_destination: 'chat' } });
    await vv.run(ctx);
    assert.equal(sock.sent[0].jid, CHAT);
  } finally {
    internals.downloadMediaMessage = originalDownload;
  }
});

test('media over 16 MB returns a plain-language error and is never sent', async () => {
  const originalDownload = internals.downloadMediaMessage;
  internals.downloadMediaMessage = async () => Buffer.alloc(17 * 1024 * 1024);
  try {
    const { ctx, sock, session } = vvContext({ quoted: VIEW_ONCE_IMAGE });
    await vv.run(ctx);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /larger than 16 MB/);
    assert.equal(session.health.errors, 0, 'size rejection is not an error condition');
  } finally {
    internals.downloadMediaMessage = originalDownload;
  }
});

test('a failed download returns a friendly error instead of crashing', async () => {
  const originalDownload = internals.downloadMediaMessage;
  internals.downloadMediaMessage = async () => { throw new Error('media expired'); };
  try {
    const { ctx, sock, session } = vvContext({ quoted: VIEW_ONCE_IMAGE });
    await vv.run(ctx);
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /could not be downloaded/);
    assert.equal(session.health.errors, 1);
    assert.equal(session.health.lastError, 'media expired');
  } finally {
    internals.downloadMediaMessage = originalDownload;
  }
});

test('view-once audio unwraps V2Extension and keeps the voice note flag', async () => {
  const originalDownload = internals.downloadMediaMessage;
  internals.downloadMediaMessage = async () => Buffer.from('audio-bytes');
  try {
    const { ctx, sock } = vvContext({ quoted: VIEW_ONCE_AUDIO });
    await vv.run(ctx);
    assert.equal(sock.sent[0].jid, OWN);
    assert.deepEqual(sock.sent[0].content.audio, Buffer.from('audio-bytes'));
    assert.equal(sock.sent[0].content.ptt, true);
    assert.equal(sock.sent[0].content.caption, undefined, 'audio has no caption');
    assert.equal(sock.sent[0].content.mimetype, 'audio/ogg; codecs=opus');
  } finally {
    internals.downloadMediaMessage = originalDownload;
  }
});

test('unwrapViewOnce handles all three wrapper forms and rejects non-wrapped messages', () => {
  const inner = { imageMessage: { mimetype: 'image/jpeg' } };
  assert.deepEqual(unwrapViewOnce({ viewOnceMessage: { message: inner } }), inner);
  assert.deepEqual(unwrapViewOnce({ viewOnceMessageV2: { message: inner } }), inner);
  assert.deepEqual(unwrapViewOnce({ viewOnceMessageV2Extension: { message: inner } }), inner);
  assert.equal(unwrapViewOnce(inner), null, 'plain media quotes are not view-once');
  assert.equal(unwrapViewOnce(null), null);
});

test('vvmode switches the destination setting and rejects invalid values', async () => {
  const a = vvContext({});
  a.ctx.args = ['chat'];
  a.ctx.argText = 'chat';
  await vvmode.run(a.ctx);
  assert.equal(a.session.settings.vv_destination, 'chat');

  const b = vvContext({});
  b.ctx.args = ['group'];
  b.ctx.argText = 'group';
  await vvmode.run(b.ctx);
  assert.equal(b.session.settings.vv_destination, 'self', 'invalid mode keeps the current value');
  assert.match(b.sock.sent[0].content.text, /vvmode self\|chat/);
});
