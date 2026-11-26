import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/pluginloader.js';
import { parseCommand, processMessage } from '../src/core/handler.js';
import { stubSession, fakeSock, messageStub, textMessage } from './helpers.js';

function makeCommand(name, access = 'public') {
  const calls = [];
  return {
    command: {
      name,
      description: `${name} description`,
      category: 'General',
      access,
      async run(ctx) { calls.push(ctx); }
    },
    calls
  };
}

function registryWith(...commands) {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  for (const cmd of commands) registry.registerCommand(cmd);
  return registry;
}

test('parseCommand extracts name, args and argText case-insensitively', () => {
  const parsed = parseCommand('.AutoView ON now', '.');
  assert.deepEqual(parsed, { name: 'autoview', args: ['ON', 'now'], argText: 'ON now' });
});

test('parseCommand returns null without the prefix or with an empty body', () => {
  assert.equal(parseCommand('hello', '.'), null);
  assert.equal(parseCommand('.', '.'), null);
  assert.equal(parseCommand('', '.'), null);
  assert.equal(parseCommand('.ping', null), null);
});

test('a message without the prefix never triggers anything', async () => {
  const cmd = makeCommand('ping');
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ message: textMessage('hello there') }), { registry: registryWith(cmd.command) });
  assert.equal(cmd.calls.length, 0);
  assert.equal(sock.sent.length, 0);
});

test('an unknown command gets a notice in direct chats', async () => {
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ fromMe: true, message: textMessage('.nosuchthing') }), { registry: registryWith() });
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /Unknown command/);
});

test('non-owners are ignored entirely in private mode', async () => {
  const cmd = makeCommand('ping');
  const session = stubSession({ config: { prefix: '.', owners: [], publicMode: false } });
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ message: textMessage('.ping') }), { registry: registryWith(cmd.command) });
  assert.equal(cmd.calls.length, 0);
  assert.equal(sock.sent.length, 0);
  assert.equal(session.health.commandsHandled, 0);
});

test('owner-only commands reply with a denial for non-owners', async () => {
  const cmd = makeCommand('vv', 'owner');
  const session = stubSession({ config: { prefix: '.', owners: [], publicMode: true } });
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ message: textMessage('.vv') }), { registry: registryWith(cmd.command) });
  assert.equal(cmd.calls.length, 0);
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /restricted to the account owner/);
});

test('a matching command runs with parsed args and counts in diagnostics', async () => {
  const cmd = makeCommand('autolike');
  const session = stubSession();
  const sock = fakeSock();
  const msg = messageStub({ fromMe: true, message: textMessage('.autolike on') });
  await processMessage(session, sock, msg, { registry: registryWith(cmd.command) });
  assert.equal(cmd.calls.length, 1);
  assert.deepEqual(cmd.calls[0].args, ['on']);
  assert.equal(cmd.calls[0].isOwner, true);
  assert.equal(cmd.calls[0].command, 'autolike');
  assert.equal(session.health.commandsHandled, 1);
});

test('a throwing command increments health errors and replies with an error panel', async () => {
  const registry = registryWith({
    name: 'explode', description: '', category: 'General', access: 'public',
    async run() { throw new Error('boom'); }
  });
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ fromMe: true, message: textMessage('.explode') }), { registry });
  assert.equal(session.health.errors, 1);
  assert.equal(session.health.lastError, 'boom');
  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].content.text, /could not be completed/);
});
