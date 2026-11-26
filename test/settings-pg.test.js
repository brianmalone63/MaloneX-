import test from 'node:test';
import assert from 'node:assert/strict';
import { PgStore } from '../src/core/pgstore.js';

// Fake pool recording queries; settings rows are returned from a canned store.
function fakePool(initialSettings = {}) {
  const calls = [];
  const settings = { ...initialSettings };
  return {
    calls,
    settings,
    async query(text, params) {
      const clean = text.replace(/\s+/g, ' ').trim();
      calls.push({ text: clean, params });
      if (clean.startsWith('SELECT key, value FROM wa_settings')) {
        return { rows: Object.entries(settings).map(([key, value]) => ({ key, value })) };
      }
      if (clean.includes('INSERT INTO wa_settings')) {
        settings[params[1]] = params[2];
      }
      return { rows: [], rowCount: 1 };
    }
  };
}

test('init creates wa_settings referencing wa_sessions with cascade', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.init();
  const create = pool.calls[1].text;
  assert.match(create, /CREATE TABLE IF NOT EXISTS wa_settings/);
  assert.match(create, /session_id TEXT REFERENCES wa_sessions\(id\) ON DELETE CASCADE/);
  assert.match(create, /PRIMARY KEY \(session_id, key\)/);
});

test('getSettings reads rows and JSON-parses stored values', async () => {
  const pool = fakePool({ autoview: 'true', vv_destination: '"chat"', autolike_emoji: '"\u2764\uFE0F"' });
  const store = new PgStore({ pool });
  const settings = await store.getSettings('alpha');
  assert.deepEqual(settings, { autoview: true, vv_destination: 'chat', autolike_emoji: '\u2764\uFE0F' });
  assert.match(pool.calls[0].text, /SELECT key, value FROM wa_settings WHERE session_id = \$1/);
});

test('getSettings returns an empty object when there are no rows', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  assert.deepEqual(await store.getSettings('alpha'), {});
});

test('setSetting upserts the value as JSON and keeps the session row first', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.setSetting('alpha', 'vv_destination', 'chat');

  assert.match(pool.calls[0].text, /INSERT INTO wa_sessions \(id\) VALUES \(\$1\) ON CONFLICT \(id\) DO NOTHING/);
  assert.deepEqual(pool.calls[0].params, ['alpha']);

  const upsert = pool.calls[1];
  assert.match(upsert.text, /INSERT INTO wa_settings \(session_id, key, value\) VALUES \(\$1, \$2, \$3\)/);
  assert.match(upsert.text, /ON CONFLICT \(session_id, key\) DO UPDATE SET value = EXCLUDED\.value/);
  assert.deepEqual(upsert.params, ['alpha', 'vv_destination', '"chat"']);
});

test('settings round trip through the fake pool returns the stored values', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.setSetting('alpha', 'autoview', true);
  await store.setSetting('alpha', 'autolike_emoji', '\u2764\uFE0F');
  assert.deepEqual(await store.getSettings('alpha'), { autoview: true, autolike_emoji: '\u2764\uFE0F' });
});
