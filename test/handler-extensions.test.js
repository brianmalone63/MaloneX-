import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/pluginloader.js';
import { processMessage, effectivePublicMode } from '../src/core/handler.js';
import { stubSession, fakeSock, messageStub, textMessage } from './helpers.js';
import * as ratelimit from '../src/core/ratelimit.js';

const GROUP = '120363@g.us';
const MEMBER = '254700000003@s.whatsapp.net';
const ADMIN = '254700000002@s.whatsapp.net';
const GROUP_META = {
  id: GROUP,
  subject: 'Test',
  participants: [
    { id: '254700000001@s.whatsapp.net', admin: 'superadmin' },
    { id: ADMIN, admin: 'admin' },
    { id: MEMBER }
  ]
};

function makeRegistry(commands) {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  for (const cmd of commands) registry.registerCommand(cmd);
  return registry;
}

function groupSock() {
  const sock = fakeSock();
  sock.groupMetadata = async () => GROUP_META;
  return sock;
}

function groupMessage(body, participant, fromMe = false) {
  return messageStub({ jid: GROUP, participant, fromMe, message: textMessage(body) });
}

test('effectivePublicMode honours settings overrides over the environment', () => {
  const envSession = stubSession();
  assert.equal(effectivePublicMode(envSession), false);
  const forced = stubSession({ settingsRaw: { MODE: 'public' } });
  assert.equal(effectivePublicMode(forced), true);
  const privateForced = stubSession({ settingsRaw: { MODE: 'private' } });
  assert.equal(effectivePublicMode(privateForced), false);
});

test('admin commands run for group admins and are denied for members', async () => {
  ratelimit.reset();
  const registry = makeRegistry([
    { name: 'promote', description: 'promote', category: 'Group', access: 'admin', run: async (ctx) => ctx.reply('promoted') }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'public' } });
  session.ownJid = '111@s.whatsapp.net';

  const adminSock = groupSock();
  await processMessage(session, adminSock, groupMessage('.promote 254700000009', ADMIN), { registry });
  assert.match(adminSock.sent[0].content.text, /promoted/);

  const memberSock = groupSock();
  await processMessage(session, memberSock, groupMessage('.promote 254700000009', MEMBER), { registry });
  assert.match(memberSock.sent[0].content.text, /restricted to group admins/);
});

test('sudo numbers gain owner access without being the bot owner', async () => {
  ratelimit.reset();
  const registry = makeRegistry([
    { name: 'blockcmd', description: 'block', category: 'Owner', access: 'owner', run: async (ctx) => ctx.reply('blocked now') }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'public', SUDO_NUMBERS: '254700000003' } });
  session.ownJid = '1000000000@s.whatsapp.net';
  const sock = groupSock();

  await processMessage(session, sock, groupMessage('.blockcmd', MEMBER), { registry });
  assert.match(sock.sent[0].content.text, /blocked now/);
});

test('groupOnly commands refuse to run in a direct chat', async () => {
  ratelimit.reset();
  const registry = makeRegistry([
    { name: 'kick', description: 'kick', category: 'Group', access: 'admin', groupOnly: true, run: async () => { throw new Error('should not run'); } }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'public' } });
  session.ownJid = '1000000000@s.whatsapp.net';
  const sock = fakeSock();
  const msg = messageStub({ fromMe: true, message: textMessage('.kick 254700000009') });

  await processMessage(session, sock, msg, { registry });
  assert.match(sock.sent[0].content.text, /only works inside a group/);
});

test('the rate limiter slows down repeated public commands from the same sender', async () => {
  ratelimit.reset();
  ratelimit.configure({ cooldownMs: 3000 });
  const registry = makeRegistry([
    { name: 'weather', description: 'weather', category: 'Search', access: 'public', run: async (ctx) => ctx.reply('forecast') }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'public' } });
  session.ownJid = '1000000000@s.whatsapp.net';
  const sock = groupSock();

  await processMessage(session, sock, groupMessage('.weather nairobi', MEMBER), { registry });
  assert.match(sock.sent[0].content.text, /forecast/);

  await processMessage(session, sock, groupMessage('.weather nairobi', MEMBER), { registry });
  assert.match(sock.sent[1].content.text, /Slow down/);
});

test('private mode keeps out non super users entirely', async () => {
  ratelimit.reset();
  const registry = makeRegistry([
    { name: 'ping', description: 'ping', category: 'General', access: 'public', run: async (ctx) => ctx.reply('pong') }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'private' } });
  session.ownJid = '1000000000@s.whatsapp.net';
  const sock = groupSock();

  await processMessage(session, sock, groupMessage('.ping', MEMBER), { registry });
  assert.equal(sock.sent.length, 0, 'no reply for outsiders in private mode');
});

test('pm permit intercepts private chats from non owners when enabled', async () => {
  ratelimit.reset();
  const registry = makeRegistry([
    { name: 'ping', description: 'ping', category: 'General', access: 'public', run: async (ctx) => ctx.reply('pong') }
  ]);
  const session = stubSession({ settingsRaw: { MODE: 'public', PM_PERMIT: true } });
  session.ownJid = '1000000000@s.whatsapp.net';
  const sock = fakeSock();
  const msg = messageStub({ fromMe: false, message: textMessage('.ping') });

  await processMessage(session, sock, msg, { registry });
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /protected by MaloneX/);
});
