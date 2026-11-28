import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../src/commands/handler.js';
import { createRegistry } from '../src/commands/registry.js';
import { fakeSock, chatMsg, statusMsg } from './helpers.js';

function fakeSession() {
  return {
    config: { ownerPhone: null, mode: 'private' },
    ownJid: '254712345678@s.whatsapp.net',
    health: { commands: 0 },
    errors: [],
    isOwner(_jid, fromMe) {
      return fromMe === true;
    },
    logError(message) {
      this.errors.push(message);
    }
  };
}

const hookPlugin = {
  name: 'hooky',
  description: 'records every message id',
  category: 'internal',
  access: 'owner',
  run() {},
  hook: 'message',
  runHook({ msg, record }) {
    record.push(msg.key.id);
  }
};

const pubPlugin = {
  name: 'pub',
  description: 'public command',
  category: 'general',
  access: 'public',
  async run(ctx) {
    await ctx.reply('pub-ok');
  }
};

describe('hooks', () => {
  it('run on every message, including status@broadcast', async () => {
    const registry = createRegistry();
    const record = [];
    registry.register({ ...hookPlugin, runHook({ msg }) { record.push(msg.key.id); } });
    const session = fakeSession();
    const sock = fakeSock();

    await processMessage(session, sock, statusMsg(), { registry, config: { prefix: '.', mode: 'private' } });
    await processMessage(session, sock, chatMsg({ text: 'no prefix' }), { registry, config: { prefix: '.', mode: 'private' } });

    assert.deepEqual(record, ['ST1', 'MSG1']);
    assert.equal(sock.sent.length, 0); // No command ran for either message.
  });

  it('run before commands and cannot break them', async () => {
    const registry = createRegistry();
    const record = [];
    registry.register({
      ...hookPlugin,
      runHook() {
        record.push('hook');
        throw new Error('hook exploded');
      }
    });
    registry.register(pubPlugin);
    const session = fakeSession();
    const sock = fakeSock();

    await processMessage(session, sock, chatMsg({ text: '.pub', fromMe: true, jid: '254712345678@s.whatsapp.net' }), { registry, config: { prefix: '.', mode: 'private' } });

    assert.deepEqual(record, ['hook']);
    assert.equal(sock.sent.length, 1); // The command still ran.
    assert.match(sock.sent[0].content.text, /pub-ok/);
    assert.equal(session.errors.length, 1);
    assert.match(session.errors[0], /hook "hooky" failed: hook exploded/);
  });
});
