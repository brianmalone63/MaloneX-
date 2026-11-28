import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../src/commands/handler.js';
import { fakeRegistryWith, fakeSock, chatMsg } from './helpers.js';
import { jidNormalizedUser } from '../src/baileys.js';
import { jidToPhone } from '../src/core/phones.js';

const OWNER_PHONE = '254700000003';

function fakeSession({ mode = 'private' } = {}) {
  return {
    config: { ownerPhone: OWNER_PHONE, mode },
    ownJid: '254712345678@s.whatsapp.net',
    health: { commands: 0 },
    errors: [],
    isOwner(jid, fromMe = false) {
      if (fromMe) return true;
      if (!jid) return false;
      if (jidNormalizedUser(jid) === this.ownJid) return true;
      return jidToPhone(jidNormalizedUser(jid)) === OWNER_PHONE;
    },
    logError(message) {
      this.errors.push(message);
    }
  };
}

const plugins = [
  { name: 'pub', description: 'public command', category: 'general', access: 'public', async run(ctx) { await ctx.reply('pub-ok'); } },
  { name: 'own', description: 'owner command', category: 'owner', access: 'owner', async run(ctx) { await ctx.reply('own-ok'); } },
  { name: 'crash', description: 'always crashes', category: 'owner', access: 'owner', async run() { throw new Error('boom'); } }
];

function cmd(name) {
  return chatMsg({ text: `.${name}`, fromMe: true, jid: '254712345678@s.whatsapp.net' });
}

async function run(session, sock, msg, mode = session.config.mode) {
  await processMessage(session, sock, msg, { registry: fakeRegistryWith(plugins), config: { prefix: '.', mode } });
}

describe('command permissions', () => {
  it('the owner (linked account) can run public commands in private mode', async () => {
    const session = fakeSession();
    const sock = fakeSock();
    await run(session, sock, cmd('pub'));
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /pub-ok/);
  });

  it('strangers get no reply in private mode', async () => {
    const session = fakeSession({ mode: 'private' });
    const sock = fakeSock();
    await run(session, sock, chatMsg({ jid: '254700000009@s.whatsapp.net', text: '.pub', fromMe: false }));
    assert.equal(sock.sent.length, 0);
    assert.equal(session.health.commands, 0);
  });

  it('strangers can run public commands when MODE=public', async () => {
    const session = fakeSession({ mode: 'public' });
    const sock = fakeSock();
    await run(session, sock, chatMsg({ jid: '254700000009@s.whatsapp.net', text: '.pub', fromMe: false }), 'public');
    assert.equal(sock.sent.length, 1);
    assert.equal(session.health.commands, 1);
  });

  it('owner-only commands stay owner-only even in public mode', async () => {
    const session = fakeSession({ mode: 'public' });
    const sock = fakeSock();
    await run(session, sock, chatMsg({ jid: '254700000009@s.whatsapp.net', text: '.own', fromMe: false }), 'public');
    assert.equal(sock.sent.length, 0);
  });

  it('the extra owner (OWNER_PHONE) passes the owner gate', async () => {
    const session = fakeSession();
    const sock = fakeSock();
    await run(session, sock, chatMsg({ jid: `${OWNER_PHONE}@s.whatsapp.net`, text: '.own', fromMe: false }));
    assert.equal(sock.sent.length, 1);
  });

  it('unknown commands are silent', async () => {
    const session = fakeSession();
    const sock = fakeSock();
    await run(session, sock, cmd('nope'));
    assert.equal(sock.sent.length, 0);
  });

  it('messages without the prefix are ignored', async () => {
    const session = fakeSession();
    const sock = fakeSock();
    await run(session, sock, chatMsg({ text: 'pub hello', fromMe: true, jid: '254712345678@s.whatsapp.net' }));
    assert.equal(sock.sent.length, 0);
  });

  it('a crashing command replies with a reference and logs the stack', async () => {
    const session = fakeSession();
    const sock = fakeSock();
    await run(session, sock, cmd('crash'));
    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /That command failed\. Reference [a-z0-9]{6}\./);
    assert.equal(session.errors.length, 1);
    assert.match(session.errors[0], /command "crash" failed \[[a-z0-9]{6}\]:[\s\S]*boom/);
  });

  it('counts commands only when they are allowed to run', async () => {
    const session = fakeSession({ mode: 'public' });
    const sock = fakeSock();
    await run(session, sock, cmd('pub'));
    await run(session, sock, chatMsg({ jid: '254700000009@s.whatsapp.net', text: '.pub', fromMe: false }), 'public');
    await run(session, sock, chatMsg({ jid: '254700000009@s.whatsapp.net', text: '.own', fromMe: false }), 'public');
    assert.equal(session.health.commands, 2);
  });
});
