import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/pluginloader.js';
import { processMessage } from '../src/core/handler.js';
import { stubSession, fakeSock, messageStub, textMessage } from './helpers.js';

function commandRecorder(name, order, access = 'owner') {
  return {
    name,
    description: `${name} description`,
    category: 'General',
    access,
    async run() { order.push(`command:${name}`); }
  };
}

function makeRegistry(hooks, commands) {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  for (const hook of hooks) registry.registerHook(hook);
  for (const cmd of commands) registry.registerCommand(cmd);
  return registry;
}

test('hooks run before command parsing', async () => {
  const order = [];
  const registry = makeRegistry(
    [{ hook: 'message', run: async () => { order.push('hook'); } }],
    [commandRecorder('ping', order, 'public')]
  );
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ fromMe: true, message: textMessage('.ping') }), { registry });
  assert.deepEqual(order, ['hook', 'command:ping']);
});

test('hooks run on status@broadcast while commands are ignored for statuses', async () => {
  const order = [];
  const seenStatus = [];
  const registry = makeRegistry(
    [{ hook: 'message', run: async (ctx) => { order.push('hook'); seenStatus.push(ctx.isStatus); } }],
    [commandRecorder('ping', order, 'public')]
  );
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ jid: 'status@broadcast', message: textMessage('status text') }), { registry });
  assert.deepEqual(order, ['hook']);
  assert.equal(seenStatus[0], true);
  assert.equal(session.health.messagesSeen, 1);
});

test('a throwing hook does not stop later hooks or crash the handler', async () => {
  const order = [];
  const registry = makeRegistry(
    [
      { hook: 'message', run: async () => { throw new Error('hook exploded'); } },
      { hook: 'message', run: async () => { order.push('second-hook'); } }
    ],
    [commandRecorder('ping', order, 'public')]
  );
  const session = stubSession();
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ fromMe: true, message: textMessage('.ping') }), { registry });
  assert.deepEqual(order, ['second-hook', 'command:ping']);
  assert.equal(session.health.errors, 1);
  assert.equal(session.health.lastError, 'hook exploded');
});

test('hook failures are logged with the session id masked', async () => {
  const registry = makeRegistry(
    [{ hook: 'message', run: async () => { throw new Error('bad hook'); } }],
    []
  );
  const session = stubSession({ id: '254711222333' });
  const sock = fakeSock();
  await processMessage(session, sock, messageStub({ message: textMessage('plain message') }), { registry });

  const warnings = session.logger.calls.filter((c) => c.level === 'warn');
  assert.equal(warnings.length, 1);
  const printed = JSON.stringify(warnings[0]);
  assert.match(printed, /bad hook/);
  // The masked id 254********3 must appear; the raw number must not.
  assert.match(printed, /254\*+/);
  assert.doesNotMatch(printed, /254711222333/);
});

test('hooks receive the full context including settings and quoted message', async () => {
  const seen = {};
  const quoted = { imageMessage: { url: 'https://example.com/a.jpg' } };
  const registry = makeRegistry(
    [{
      hook: 'message',
      run: async (ctx) => {
        seen.settings = ctx.settings;
        seen.quoted = ctx.quoted;
        seen.sender = ctx.sender;
        seen.jid = ctx.jid;
      }
    }],
    []
  );
  const session = stubSession({ settingsRaw: { autoview: true } });
  const sock = fakeSock();
  const msg = messageStub({ message: { extendedTextMessage: { text: 'look at this', contextInfo: { quotedMessage: quoted } } } });
  await processMessage(session, sock, msg, { registry });
  assert.equal(seen.settings.autoview, true);
  assert.deepEqual(seen.quoted, quoted);
  assert.equal(seen.sender, '254700000000@s.whatsapp.net');
  assert.equal(seen.jid, '254700000000@s.whatsapp.net');
});
