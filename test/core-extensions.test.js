import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGroupContext, superUserNumbers, isSuperUser, toUserJid, digits } from '../src/core/groups.js';
import * as ratelimit from '../src/core/ratelimit.js';
import * as messagestore from '../src/core/messagestore.js';
import { formatBytes, runtime, encodeBase64, decodeBase64, encodeBinary, decodeBinary, fancyLocal, monospace, getMimeFromUrl, getExtensionFromMime, isTextMime } from '../src/core/media.js';
import { buildButtonPayload, extractButtonId } from '../src/core/buttons.js';
import { buildTextPdf } from '../src/plugins/tools.js';

const META = {
  id: '123@g.us',
  subject: 'Test Group',
  participants: [
    { id: '111@s.whatsapp.net', admin: 'superadmin' },
    { id: '222@s.whatsapp.net', admin: 'admin' },
    { id: '333@s.whatsapp.net' }
  ]
};

test('group context resolves admins, super admins and bot admin status', () => {
  const ctx = resolveGroupContext(META, { jid: '123@g.us', sender: '222@s.whatsapp.net', botJid: '111@s.whatsapp.net' });
  assert.deepEqual([...ctx.adminNums].sort(), ['111', '222']);
  assert.equal(ctx.senderIsAdmin, true);
  assert.equal(ctx.botIsAdmin, true);
  assert.equal(ctx.senderIsSuperAdmin, false);

  const member = resolveGroupContext(META, { jid: '123@g.us', sender: '333@s.whatsapp.net', botJid: '999@s.whatsapp.net' });
  assert.equal(member.senderIsAdmin, false);
  assert.equal(member.botIsAdmin, false);
  assert.equal(member.groupName, 'Test Group');
});

test('super users combine config owners, sudo numbers and the bot itself', () => {
  const session = { config: { owners: ['254700000001'] }, settings: { SUDO_NUMBERS: '254700000002, 254711' } };
  const set = superUserNumbers(session, '254700000003@s.whatsapp.net');
  assert.equal(set.has('254700000001'), true);
  assert.equal(set.has('254700000002'), true);
  assert.equal(set.has('254700000003'), true);
  assert.equal(set.has('254711'), false, 'too short sudo numbers are dropped');
  assert.equal(isSuperUser(session, '254700000002@s.whatsapp.net', null), true);
  assert.equal(isSuperUser(session, '254700000099@s.whatsapp.net', null), false);
});

test('jid helpers normalize numbers and strip device suffixes', () => {
  assert.equal(toUserJid('254712345678'), '254712345678@s.whatsapp.net');
  assert.equal(toUserJid('254712345678:12@s.whatsapp.net'), '254712345678@s.whatsapp.net');
  assert.equal(toUserJid('abc'), null);
  assert.equal(digits('254712345678:12@s.whatsapp.net'), '254712345678');
});

test('rate limiter enforces the cooldown and bypasses super users', () => {
  ratelimit.reset();
  ratelimit.configure({ cooldownMs: 2000 });
  const args = { chat: 'chat@s.whatsapp.net', sender: 'u1@s.whatsapp.net', command: 'weather' };
  assert.equal(ratelimit.check(args).ok, true);
  const second = ratelimit.check(args);
  assert.equal(second.ok, false);
  assert.ok(second.waitSeconds >= 1);
  assert.equal(ratelimit.check({ ...args, bypass: true }).ok, true);

  assert.equal(ratelimit.check({ chat: 'chat2', sender: 'u1', command: 'weather' }).ok, true, 'different chat is independent');
  ratelimit.reset('chat@s.whatsapp.net');
  assert.equal(ratelimit.check(args).ok, true, 'reset clears the bucket');
  ratelimit.configure({ cooldownMs: 0 });
  assert.equal(ratelimit.check(args).ok, true, 'zero cooldown disables limiting');
});

test('message store remembers, finds and recovers deleted messages', () => {
  messagestore.clear();
  const msg = { key: { remoteJid: 'chat@s.whatsapp.net', id: 'ABC1', participant: 'u1@s.whatsapp.net' }, message: { conversation: 'hello' } };
  messagestore.remember(msg, { sender: 'u1@s.whatsapp.net', pushName: 'User' });

  const entry = messagestore.find('chat@s.whatsapp.net', 'ABC1');
  assert.equal(entry.message.conversation, 'hello');
  assert.equal(entry.sender, 'u1@s.whatsapp.net');

  const marked = messagestore.markDeleted('chat@s.whatsapp.net', 'ABC1');
  assert.equal(marked.message.conversation, 'hello');
  assert.equal(messagestore.find('chat@s.whatsapp.net', 'ABC1'), null, 'removed from the live set');

  const taken = messagestore.takeDeleted('chat@s.whatsapp.net', 'ABC1');
  assert.equal(taken.message.conversation, 'hello');
  assert.equal(messagestore.takeDeleted('chat@s.whatsapp.net', 'ABC1'), null, 'taken entries are consumed once');
});

test('formatting helpers produce stable output', () => {
  assert.equal(formatBytes(1536), '1.50 KB');
  assert.equal(formatBytes(1024 * 1024), '1.00 MB');
  assert.equal(runtime(90061), '1d 1h 1m 1s');
  assert.equal(runtime(59), '59s');
  assert.equal(encodeBase64('hello'), 'aGVsbG8=');
  assert.equal(decodeBase64('aGVsbG8='), 'hello');
  assert.equal(encodeBinary('hi'), '01101000 01101001');
  assert.equal(decodeBinary('01101000 01101001'), 'hi');
  assert.throws(() => decodeBinary('abc'), /not valid binary/i);
  assert.throws(() => decodeBase64('!!!'), /not valid Base64/i);
  const fancy = fancyLocal('Ab');
  assert.equal(fancy.length >= 4, true);
  assert.equal(fancy[0].name, 'bold');
  assert.notEqual(fancy[0].result, 'Ab');
  assert.match(monospace('A1'), /𝙰𝟷|𝙰/);
  assert.equal(getMimeFromUrl('https://x.com/a/b/file.MP3?dl=1'), 'audio/mpeg');
  assert.equal(getExtensionFromMime('application/pdf'), '.pdf');
  assert.equal(isTextMime('application/json'), true);
  assert.equal(isTextMime('image/png'), false);
});

test('the text PDF builder emits a valid PDF structure', () => {
  const pdf = buildTextPdf('Test title', ['line one', 'line two']);
  const text = pdf.toString('binary');
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /line one/);
  assert.match(text, /startxref/);
  assert.match(text, /%%EOF$/);
});

test('button payloads render interactive structure with a plain fallback', () => {
  const payload = buildButtonPayload({
    title: 'Title',
    text: 'Body text',
    footer: 'Footer',
    image: { url: 'https://example.com/a.jpg' },
    buttons: [
      { text: 'Open', url: 'https://example.com' },
      { text: 'Copy', copy: 'CODE123' },
      { text: 'Refresh', id: 'btn_refresh' }
    ]
  });
  assert.equal(payload.image.url, 'https://example.com/a.jpg');
  assert.match(payload.text, /\*Title\*/);
  assert.match(payload.text, /Body text/);
  assert.equal(payload.interactiveMessage.nativeFlowMessage.buttons.length, 3);
  const names = payload.interactiveMessage.nativeFlowMessage.buttons.map((b) => b.name);
  assert.deepEqual(names, ['cta_url', 'cta_copy', 'quick_reply']);

  assert.equal(extractButtonId({ buttonsResponseMessage: { selectedButtonId: 'btn_refresh' } }), 'btn_refresh');
  const flow = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: 'fb_hd_1' }) } } };
  assert.equal(extractButtonId(flow), 'fb_hd_1');
  assert.equal(extractButtonId({ conversation: 'plain' }), null);
});
