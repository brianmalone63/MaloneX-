import test from 'node:test';
import assert from 'node:assert/strict';
import settingsCommands from '../src/plugins/settings.js';
import generalCommands from '../src/plugins/general.js';
import autoviewCommand from '../src/plugins/autoview.js';
import { PluginRegistry } from '../src/core/pluginloader.js';
import { stubSession, fakeSock, messageStub, assertNoEmoji } from './helpers.js';

const menuCommand = generalCommands.find((c) => c.name === 'menu');
const settingsCommand = settingsCommands.find((c) => c.name === 'settings');

function registryWith(...commands) {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  for (const cmd of commands) registry.registerCommand(cmd);
  return registry;
}

function commandContext({ session = null, registryCommands = [], args = [], superUser = true } = {}) {
  const s = session || stubSession();
  const sock = fakeSock();
  const msg = messageStub({ fromMe: true, message: { conversation: '.x' } });
  const registry = registryWith(...registryCommands);
  return {
    session: s,
    sock,
    msg,
    registry,
    logger: s.logger,
    settings: s.settings,
    config: s.config,
    jid: msg.key.remoteJid,
    args,
    argText: args.join(' '),
    isOwner: true,
    superUser,
    prefix: '.',
    timeZone: 'UTC',
    footer: 'MaloneX',
    packName: 'MaloneX',
    packAuthor: 'Brian Malone',
    botName: 'MaloneX',
    buttons: async (options) => sock.sendMessage(msg.key.remoteJid, options, { quoted: msg }),
    reply: async (content) => sock.sendMessage(msg.key.remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg })
  };
}

test('the settings panel lists the global settings including automation keys', async () => {
  const session = stubSession({ settingsRaw: { autoview: true, autolike: true, BOT_NAME: 'CustomX' } });
  const ctx = commandContext({ session });
  await settingsCommand.run(ctx);

  assert.equal(ctx.sock.sent.length, 1);
  const text = ctx.sock.sent[0].content.text;
  assert.match(text, /autoview : ON/i);
  assert.match(text, /autolike : ON/i);
  assert.match(text, /BOT_NAME : CustomX/);
  assert.match(text, /vv_destination : self/);
  assert.match(text, /PREFIX : \(empty\)/);
});

test('the menu lists the Automation category with all new commands for the owner', async () => {
  const ctx = commandContext({
    registryCommands: [
      { name: 'menu', description: 'list', category: 'General', access: 'public', run: () => {} },
      { name: 'autoview', description: 'auto view', category: 'Automation', access: 'owner', run: () => {} },
      { name: 'autolike', description: 'auto like', category: 'Automation', access: 'owner', run: () => {} },
      { name: 'vv', aliases: ['viewonce'], description: 'retrieve', category: 'Automation', access: 'owner', run: () => {} },
      { name: 'vvmode', description: 'delivery', category: 'Automation', access: 'owner', run: () => {} },
      { name: 'settings', description: 'overview', category: 'Settings', access: 'owner', run: () => {} }
    ]
  });
  await menuCommand.run(ctx);

  const text = ctx.sock.sent[0].content.text;
  assert.match(text, /\*AUTOMATION\*/);
  for (const name of ['autoview', 'autolike', 'vv', 'vvmode']) {
    assert.match(text, new RegExp(`\\.${name}`), `menu must list .${name}`);
  }
});

test('the menu hides owner-only categories from non-owners when public mode is on', async () => {
  const ctx = commandContext({
    superUser: false,
    registryCommands: [
      { name: 'menu', description: 'list', category: 'General', access: 'public', run: () => {} },
      { name: 'vv', description: 'retrieve', category: 'Automation', access: 'owner', run: () => {} }
    ]
  });
  await menuCommand.run(ctx);

  const text = ctx.sock.sent[0].content.text;
  assert.doesNotMatch(text, /\.vv/);
  assert.match(text, /\.menu/);
});

test('the menu output never contains an emoji', async () => {
  const ctx = commandContext({
    registryCommands: [
      { name: 'autoview', description: 'auto view statuses', category: 'Automation', access: 'owner', run: () => {} }
    ]
  });
  await menuCommand.run(ctx);
  assertNoEmoji(ctx.sock.sent[0].content.text);
});

test('the autoview command toggles the setting and confirms in a panel', async () => {
  const ctx = commandContext({ args: ['on'] });
  await autoviewCommand.run(ctx);
  assert.equal(ctx.session.settings.autoview, true);
  assert.match(ctx.sock.sent[0].content.text, /Auto view status : ON/);

  ctx.args = ['off'];
  ctx.argText = 'off';
  await autoviewCommand.run(ctx);
  assert.equal(ctx.session.settings.autoview, false);
  assert.match(ctx.sock.sent[1].content.text, /Auto view status : OFF/);
});

test('the autoview command without a mode answers with usage', async () => {
  const ctx = commandContext({ args: [] });
  await autoviewCommand.run(ctx);
  assert.equal(ctx.session.settings.autoview, false);
  assert.match(ctx.sock.sent[0].content.text, /autoview on\|off/);
});
