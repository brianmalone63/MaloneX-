import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findViewOnce, deliverViewOnce } from '../src/features/vv.js';
import { fakeSock } from './helpers.js';

function viewOnceImage({ viewOnce = true, mimetype = 'image/jpeg' } = {}) {
  return {
    imageMessage: { viewOnce, mimetype, caption: 'secret photo' }
  };
}

describe('findViewOnce', () => {
  it('finds direct view-once media', () => {
    const found = findViewOnce(viewOnceImage());
    assert.equal(found.kind, 'imageMessage');
    assert.equal(found.media.mimetype, 'image/jpeg');
  });

  it('finds wrapped view-once media (V2 and V2Extension)', () => {
    assert.equal(findViewOnce({ viewOnceMessageV2: { message: { videoMessage: { viewOnce: true } } } }).kind, 'videoMessage');
    assert.equal(findViewOnce({ viewOnceMessageV2Extension: { message: { audioMessage: { viewOnce: true, ptt: true } } } }).kind, 'audioMessage');
  });

  it('returns null for normal media and non-objects', () => {
    assert.equal(findViewOnce({ imageMessage: { viewOnce: false } }), null);
    assert.equal(findViewOnce({}), null);
    assert.equal(findViewOnce(null), null);
  });
});

describe('deliverViewOnce', () => {
  const OWNER = '254712345678@s.whatsapp.net';
  const SOURCE = '254700000009@s.whatsapp.net';

  function sockCapturing() {
    const sock = fakeSock();
    return sock;
  }

  it('delivers to the owner chat by default and keeps the mimetype', async () => {
    const sock = sockCapturing();
    const result = await deliverViewOnce({
      quoted: viewOnceImage(),
      sock,
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'self',
      download: async () => Buffer.alloc(10),
      maxBytes: 16 * 1024 * 1024
    });
    assert.equal(result.ok, true);
    assert.match(result.where, /own chat/);
    assert.equal(sock.sent[0].jid, OWNER);
    assert.deepEqual(sock.sent[0].content.mimetype, 'image/jpeg');
  });

  it('delivers back to the chat when vv_destination is chat', async () => {
    const sock = sockCapturing();
    const result = await deliverViewOnce({
      quoted: viewOnceImage(),
      sock,
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'chat',
      download: async () => Buffer.alloc(10),
      maxBytes: 16 * 1024 * 1024
    });
    assert.equal(result.ok, true);
    assert.equal(sock.sent[0].jid, SOURCE);
  });

  it('enforces the 16 MB cap with a clear error', async () => {
    const result = await deliverViewOnce({
      quoted: viewOnceImage(),
      sock: sockCapturing(),
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'self',
      download: async () => Buffer.alloc(17 * 1024 * 1024),
      maxBytes: 16 * 1024 * 1024
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /16 MB cap/);
  });

  it('explains expired or broken downloads', async () => {
    const broken = await deliverViewOnce({
      quoted: viewOnceImage(),
      sock: sockCapturing(),
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'self',
      download: async () => { throw new Error('media expired'); },
      maxBytes: 16 * 1024 * 1024
    });
    assert.equal(broken.ok, false);
    assert.match(broken.error, /download failed/);

    const empty = await deliverViewOnce({
      quoted: viewOnceImage(),
      sock: sockCapturing(),
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'self',
      download: async () => null,
      maxBytes: 16 * 1024 * 1024
    });
    assert.match(empty.error, /nothing usable/);
  });

  it('rejects messages that are not view-once', async () => {
    const result = await deliverViewOnce({
      quoted: { imageMessage: { viewOnce: false } },
      sock: sockCapturing(),
      ownerJid: OWNER,
      sourceJid: SOURCE,
      destination: 'self',
      download: async () => Buffer.alloc(1),
      maxBytes: 16 * 1024 * 1024
    });
    assert.match(result.error, /not a view-once/);
  });
});
