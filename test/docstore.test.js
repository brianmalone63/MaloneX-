import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/core/filestore.js';
import { PgStore, parseSettingValue } from '../src/core/pgstore.js';
import { readGroupSettings, writeGroupSetting, containsBadWord, getBadWords, setBadWords, GROUP_SETTING_DEFAULTS } from '../src/core/groupsettings.js';

// Fake pool that records every query and returns canned rows for the SQL
// fragments listed in rowsFor.
function fakePool(rowsFor = {}) {
  const queries = [];
  return {
    queries,
    async query(text, params) {
      queries.push({ sql: text.replace(/\s+/g, ' ').trim(), params });
      const matched = Object.keys(rowsFor).find((key) => text.includes(key));
      return { rows: matched ? rowsFor[matched] : [], rowCount: 1 };
    }
  };
}

function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-docs-'));
}

test('docstore round trip on the FileStore in a temp dir', async () => {
  const dir = await tempDir();
  const store = new FileStore({ dataDir: dir });
  await store.init();

  assert.equal(await store.getDoc('sess1', 'notes', 'user@s.whatsapp.net'), null);
  await store.setDoc('sess1', 'notes', 'user@s.whatsapp.net', { notes: [{ text: 'hello' }] });
  const doc = await store.getDoc('sess1', 'notes', 'user@s.whatsapp.net');
  assert.equal(doc.notes[0].text, 'hello');

  const list = await store.listDocs('sess1', 'notes');
  assert.equal(list.length, 1);
  assert.equal(list[0].key, 'user_s_whatsapp_net');

  await store.delDoc('sess1', 'notes', 'user@s.whatsapp.net');
  assert.equal(await store.getDoc('sess1', 'notes', 'user@s.whatsapp.net'), null);

  await store.setDoc('sess1', 'games', 'chat', { kind: 'ttt' });
  await store.delAllDocs('sess1', 'games');
  assert.deepEqual(await store.listDocs('sess1', 'games'), []);

  await fsp.rm(dir, { recursive: true, force: true });
});

test('docstore round trip on the PgStore with a fake pool', async () => {
  const pool = fakePool({
    'SELECT key, value FROM wa_group_settings': [],
    'SELECT value FROM wa_docs': [{ value: JSON.stringify({ ok: 1 }) }],
    'SELECT key, value FROM wa_docs': [{ key: 'k1', value: '5' }]
  });
  const { queries } = pool;
  const store = new PgStore({ pool });
  await store.init();

  assert.deepEqual(queries.filter((q) => /wa_group_settings/.test(q.sql) && /CREATE/.test(q.sql)).length >= 1, true);
  assert.deepEqual(queries.filter((q) => /wa_docs/.test(q.sql) && /CREATE/.test(q.sql)).length >= 1, true);

  await store.setGroupSetting('sess1', '123@g.us', 'ANTILINK', 'warn');
  const insert = queries.find((q) => /INSERT INTO wa_group_settings/.test(q.sql));
  assert.equal(insert.params[3], JSON.stringify('warn'));

  assert.deepEqual(await store.getDoc('sess1', 'x', 'y'), { ok: 1 });
  await store.setDoc('sess1', 'x', 'y', { a: 1 });
  const docInsert = queries.filter((q) => /INSERT INTO wa_docs/.test(q.sql)).pop();
  assert.equal(docInsert.params[3], JSON.stringify({ a: 1 }));

  const listed = await store.listDocs('sess1', 'x');
  assert.equal(listed[0].value, 5);

  await store.delDoc('sess1', 'x', 'y');
  const del = queries.filter((q) => /DELETE FROM wa_docs/.test(q.sql)).pop();
  assert.deepEqual(del.params, ['sess1', 'x', 'y']);
});

test('group settings apply defaults and validate values', async () => {
  const dir = await tempDir();
  const store = new FileStore({ dataDir: dir });
  await store.init();

  const settings = await readGroupSettings(store, 's1', '123@g.us');
  assert.equal(settings.ANTILINK, 'off');
  assert.equal(settings.ANTILINK_WARN_COUNT, '5');
  assert.equal(settings.WELCOME_MESSAGE, 'off');
  assert.equal(Object.keys(GROUP_SETTING_DEFAULTS).length >= 12, true);

  const good = await writeGroupSetting(store, 's1', '123@g.us', 'ANTILINK', 'kick');
  assert.equal(good.ok, true);
  const next = await readGroupSettings(store, 's1', '123@g.us');
  assert.equal(next.ANTILINK, 'kick');

  const bad = await writeGroupSetting(store, 's1', '123@g.us', 'ANTILINK', 'explode');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /must be one of/);

  const badLimit = await writeGroupSetting(store, 's1', '123@g.us', 'ANTILINK_WARN_COUNT', '500');
  assert.equal(badLimit.ok, false);

  await fsp.rm(dir, { recursive: true, force: true });
});

test('bad words list defaults, custom lists and phrase detection', async () => {
  const dir = await tempDir();
  const store = new FileStore({ dataDir: dir });
  await store.init();

  const defaults = await getBadWords(store, 's1', 'g1');
  assert.equal(defaults.length > 10, true);
  assert.equal(containsBadWord('this is total bullshit my friend', defaults), 'bullshit');
  assert.equal(containsBadWord('clean sentence', defaults), null);

  await setBadWords(store, 's1', 'g1', ['spamword']);
  const custom = await getBadWords(store, 's1', 'g1');
  assert.deepEqual(custom, ['spamword']);
  assert.equal(containsBadWord('what a SPAMWORD really', custom), 'spamword');

  await fsp.rm(dir, { recursive: true, force: true });
});

test('parseSettingValue falls back to raw strings for non JSON values', () => {
  assert.equal(parseSettingValue('5'), 5);
  assert.deepEqual(parseSettingValue('{"a":1}'), { a: 1 });
  assert.equal(parseSettingValue('warn'), 'warn');
  assert.equal(parseSettingValue(null), null);
});
