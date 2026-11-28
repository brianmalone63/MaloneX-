import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseSession } from '../src/session/importSession.js';

// Synthetic fixtures only. Nothing here is a real session; values are tiny
// and fake, and the number "1000000000" is not routable.
const CREDS = {
  me: { id: '1000000000@s.whatsapp.net', name: 'fixture' },
  registered: true,
  noiseKey: { type: 'Buffer', data: [1, 2, 3] },
  signedIdentityKey: { type: 'Buffer', data: [4, 5] }
};
const KEYS = {
  'session:fixture1': { type: 'Buffer', data: [9, 9] }
};

const json = (obj) => JSON.stringify(obj);
const b64 = (obj) => Buffer.from(json(obj), 'utf8').toString('base64');
const gzipB64 = (obj) => zlib.gzipSync(Buffer.from(json(obj), 'utf8')).toString('base64');
const b64url = (obj) => Buffer.from(json(obj), 'utf8').toString('base64url');

const OBJECT_B = { creds: CREDS, keys: KEYS };
const OBJECT_C = {
  'creds.json': CREDS,
  'keys/session/fixture1.json': KEYS['session:fixture1']
};

function assertValid(result) {
  assert.equal(result.creds.registered, true);
  assert.equal(result.creds.me.id, '1000000000@s.whatsapp.net');
  assert.ok(result.creds.noiseKey.type === 'Buffer' || result.creds.noiseKey.constructor === Buffer);
}

describe('parseSession: supported formats', () => {
  it('parses raw JSON creds (format a)', () => {
    const result = parseSession(json(CREDS));
    assertValid(result);
    assert.deepEqual(result.keys, {});
  });

  it('parses raw { creds, keys } (format b)', () => {
    const result = parseSession(json(OBJECT_B));
    assertValid(result);
    assert.deepEqual(Object.keys(result.keys), ['session:fixture1']);
  });

  it('parses base64 of JSON (format 2)', () => {
    assertValid(parseSession(b64(OBJECT_B)));
  });

  it('parses gzip then base64 of JSON (format 3)', () => {
    assertValid(parseSession(gzipB64(OBJECT_B)));
  });

  it('parses a filename map (format c) and normalizes keys', () => {
    const result = parseSession(json(OBJECT_C));
    assertValid(result);
    assert.deepEqual(Object.keys(result.keys), ['session:fixture1']);
  });
});

describe('parseSession: prefixes', () => {
  it('strips prefixes ending in ~, _ or :', () => {
    assertValid(parseSession(`MaloneX~${b64(OBJECT_B)}`));
    assertValid(parseSession(`MaloneX~${b64(OBJECT_B)}`));
    assertValid(parseSession(`MY_BOT_${b64(OBJECT_B)}`)); // Two separators; the whole prefix is skipped.
    assertValid(parseSession(`bot:${b64(OBJECT_B)}`));
  });

  it('honors SESSION_PREFIX when forced', () => {
    assertValid(parseSession(`MaloneX~${b64(OBJECT_B)}`, { forcedPrefix: 'MaloneX' }));
    assert.throws(
      () => parseSession(`Other~${b64(OBJECT_B)}`, { forcedPrefix: 'MaloneX' }),
      (err) => /does not start with the expected prefix/.test(err.message)
    );
  });

  it('does not corrupt URL-safe base64 bodies that contain underscores', () => {
    // JSON numbers are stored as text, so the encoded bytes stay printable
    // ASCII. A run of "~" (0x7E = 01111110) contains six consecutive one
    // bits, which base64url renders as "-" or "_" once the group alignment
    // matches; sweeping the padding finds that alignment deterministically.
    let payload = null;
    for (let pad = 0; pad < 8 && payload === null; pad += 1) {
      const candidate = b64url({ ...OBJECT_B, note: '.'.repeat(pad) + '~~~~~~~~' });
      if (candidate.includes('_') || candidate.includes('-')) payload = candidate;
    }
    assert.ok(payload, 'fixture generation should find a URL-safe body');
    assertValid(parseSession(payload));
  });
});

describe('parseSession: validation failures', () => {
  it('rejects a session without creds.me and says which check failed', () => {
    const raw = json({ registered: true, noiseKey: { type: 'Buffer', data: [1] } });
    try {
      parseSession(raw);
      assert.fail('should have thrown');
    } catch (err) {
      assert.match(err.message, /creds\.me/);
      assert.match(err.message, /Supported formats/);
    }
  });

  it('rejects an unregistered device', () => {
    const raw = json({ ...CREDS, registered: false });
    try {
      parseSession(raw);
      assert.fail('should have thrown');
    } catch (err) {
      assert.match(err.message, /registered === true/);
    }
  });

  it('rejects JSON that is not Baileys credentials at all', () => {
    try {
      parseSession(json({ hello: 'world' }));
      assert.fail('should have thrown');
    } catch (err) {
      assert.match(err.message, /does not look like Baileys credentials/);
    }
  });

  it('rejects undecodable input and names the supported formats', () => {
    try {
      parseSession('definitely not a session');
      assert.fail('should have thrown');
    } catch (err) {
      assert.match(err.message, /Could not decode/);
      assert.match(err.message, /raw JSON/);
    }
  });

  it('rejects empty and oversized values', () => {
    assert.throws(() => parseSession(''), /empty/);
    const huge = 'x'.repeat(5 * 1024 * 1024);
    assert.throws(() => parseSession(huge), /larger than/);
  });
});

describe('parseSession: safety', () => {
  it('never echoes the input in an error message', () => {
    const secretish = `Brand~${b64({ noiseKey: 'very-secret-bytes' })}`;
    try {
      parseSession(secretish);
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.message.includes('very-secret-bytes'), false);
      assert.equal(err.message.includes('Brand'), false);
    }
    const huge = 'S' + 'e'.repeat(100000) + 'cret-value';
    try {
      parseSession(huge);
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.message.includes('cret-value'), false);
    }
  });
});
