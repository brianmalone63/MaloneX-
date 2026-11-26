import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PluginRegistry, loadPlugins } from '../src/core/pluginloader.js';

async function tempPluginDir(files) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-plugins-'));
  for (const [name, content] of Object.entries(files)) {
    await fsp.writeFile(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

test('a default-export command object is registered', async () => {
  const dir = await tempPluginDir({
    'one.js': `export default { name: 'ping', description: 'd', category: 'General', access: 'public', run: () => {} };`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.commands.length, 1);
  assert.equal(registry.find('ping').name, 'ping');
});

test('an array of commands is registered fully', async () => {
  const dir = await tempPluginDir({
    'two.js': `export default [
      { name: 'vv', description: 'a', category: 'Automation', access: 'owner', run: () => {} },
      { name: 'vvmode', description: 'b', category: 'Automation', access: 'owner', run: () => {} }
    ];`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.commands.length, 2);
  assert.ok(registry.find('vvmode'));
});

test('a named hook export is collected in the registry', async () => {
  const dir = await tempPluginDir({
    'hooked.js': `export const hook = { hook: 'message', run: async () => {} };`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.hooks.length, 1);
  assert.equal(registry.hooks[0].hook, 'message');
});

test('aliases resolve through the same lookup', async () => {
  const dir = await tempPluginDir({
    'alias.js': `export default { name: 'vv', aliases: ['viewonce'], run: () => {} };`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.find('viewonce').name, 'vv');
});

test('lookup is case-insensitive and ignores a leading dot', async () => {
  const dir = await tempPluginDir({
    'x.js': `export default { name: 'Menu', run: () => {} };`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.find('.MENU').name, 'menu');
});

test('a plugin file with a syntax error is skipped, others still load', async () => {
  const dir = await tempPluginDir({
    'broken.js': `export default { name: 'broken', run: => {} };`,
    'good.js': `export default { name: 'good', run: () => {} };`
  });
  const registry = await loadPlugins({ dir });
  assert.equal(registry.commands.length, 1);
  assert.equal(registry.find('good').name, 'good');
});

test('commands without a name or run function are rejected', () => {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  assert.equal(registry.registerCommand({ name: 'norun' }), false);
  assert.equal(registry.registerCommand({ run: () => {} }), false);
  assert.equal(registry.registerCommand(null), false);
  assert.equal(registry.commands.length, 0);
});

test('hooks with the wrong type or run are rejected', () => {
  const registry = new PluginRegistry({ logger: { warn: () => {} } });
  assert.equal(registry.registerHook({ hook: 'other', run: () => {} }), false);
  assert.equal(registry.registerHook({ hook: 'message' }), false);
  assert.equal(registry.registerHook(null), false);
  assert.equal(registry.hooks.length, 0);
});
