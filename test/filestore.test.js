import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/core/filestore.js';

async function tempStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-filestore-'));
  const store = new FileStore({ dataDir: dir });
  await store.init();
  return { store, dir };
}

test('init creates the data directory', async () => {
  const { store, dir } = await tempStore();
  assert.ok(fs.existsSync(dir));
  assert.ok(store.dataDir.startsWith(os.tmpdir()));
});

test('createSession creates a folder and returns true', async () => {
  const { store } = await tempStore();
  assert.equal(await store.createSession('alpha'), true);
  assert.ok(fs.existsSync(store.sessionDir('alpha')));
});

test('createSession returns false for an existing session', async () => {
  const { store } = await tempStore();
  assert.equal(await store.createSession('alpha'), true);
  assert.equal(await store.createSession('alpha'), false);
});

test('createSession rejects invalid ids to prevent path traversal', async () => {
  const { store } = await tempStore();
  for (const bad of ['../evil', 'a/b', '', 'a'.repeat(65), '.hidden']) {
    await assert.rejects(() => store.createSession(bad));
  }
});

test('listSessions returns created sessions sorted by id', async () => {
  const { store } = await tempStore();
  await store.createSession('beta');
  await store.createSession('alpha');
  const list = await store.listSessions();
  assert.deepEqual(list.map((s) => s.id), ['alpha', 'beta']);
});

test('getSession returns saved meta and null for unknown sessions', async () => {
  const { store } = await tempStore();
  await store.createSession('alpha');
  await store.saveSessionMeta('alpha', { phone: '254700000001' });
  const meta = await store.getSession('alpha');
  assert.equal(meta.phone, '254700000001');
  assert.equal(await store.getSession('ghost'), null);
});

test('saveSessionMeta merges fields and stamps updatedAt', async () => {
  const { store } = await tempStore();
  await store.createSession('alpha');
  await store.saveSessionMeta('alpha', { phone: '254700000001' });
  await store.saveSessionMeta('alpha', { note: 'kept' });
  const meta = await store.getSession('alpha');
  assert.equal(meta.note, 'kept');
  assert.equal(meta.phone, '254700000001');
  assert.ok(meta.updatedAt);
});

test('deleteSession removes the folder', async () => {
  const { store } = await tempStore();
  await store.createSession('alpha');
  await store.deleteSession('alpha');
  assert.equal(fs.existsSync(store.sessionDir('alpha')), false);
});

test('getSettings returns an empty object when nothing is stored', async () => {
  const { store } = await tempStore();
  assert.deepEqual(await store.getSettings('alpha'), {});
});

test('settings persist across store instances in the same directory', async () => {
  const { store, dir } = await tempStore();
  await store.createSession('alpha');
  await store.setSetting('alpha', 'autoview', true);
  await store.setSetting('alpha', 'autolike_emoji', '\u2764\uFE0F');

  const second = new FileStore({ dataDir: dir });
  assert.deepEqual(await second.getSettings('alpha'), { autoview: true, autolike_emoji: '\u2764\uFE0F' });

  // Atomic writes leave no temp files behind.
  const files = fs.readdirSync(store.sessionDir('alpha'));
  assert.equal(files.filter((f) => f.endsWith('.tmp')).length, 0);
});
