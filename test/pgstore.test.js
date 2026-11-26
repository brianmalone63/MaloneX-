import test from 'node:test';
import assert from 'node:assert/strict';
import { PgStore } from '../src/core/pgstore.js';

// Fake pool that records every query and returns canned rows.
function fakePool(rowsFor = {}) {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      const matched = Object.keys(rowsFor).find((key) => text.includes(key));
      return { rows: matched ? rowsFor[matched] : [], rowCount: 1 };
    }
  };
}

test('init creates the sessions table', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.init();
  const create = pool.calls[0].text;
  assert.match(create, /CREATE TABLE IF NOT EXISTS wa_sessions/);
  assert.match(create, /id TEXT PRIMARY KEY/);
});

test('init creates the settings table with cascade and composite key', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.init();
  const create = pool.calls[1].text;
  assert.match(create, /CREATE TABLE IF NOT EXISTS wa_settings/);
  assert.match(create, /REFERENCES wa_sessions\(id\) ON DELETE CASCADE/);
  assert.match(create, /PRIMARY KEY \(session_id, key\)/);
});

test('createSession inserts with ON CONFLICT DO NOTHING and reports success', async () => {
  const pool = fakePool({ 'RETURNING id': [{ id: 'alpha' }] });
  const store = new PgStore({ pool });
  assert.equal(await store.createSession('alpha'), true);

  const empty = fakePool();
  const store2 = new PgStore({ pool: empty });
  assert.equal(await store2.createSession('alpha'), false);
  assert.match(empty.calls[0].text, /ON CONFLICT \(id\) DO NOTHING/);
});

test('listSessions maps snake_case columns to camelCase', async () => {
  const pool = fakePool({ 'ORDER BY created_at': [{ id: 'alpha', phone: '254700000001', created_at: 't1', updated_at: 't2' }] });
  const store = new PgStore({ pool });
  const list = await store.listSessions();
  assert.deepEqual(list, [{ id: 'alpha', phone: '254700000001', createdAt: 't1', updatedAt: 't2' }]);
});

test('getSession returns null when the session is missing', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  assert.equal(await store.getSession('ghost'), null);
});

test('saveSessionMeta upserts the phone number', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  await store.saveSessionMeta('alpha', { phone: '254700000001' });
  const call = pool.calls[0];
  assert.match(call.text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(call.params, ['alpha', '254700000001']);
});

test('deleteSession deletes the row and reports whether it existed', async () => {
  const pool = fakePool();
  const store = new PgStore({ pool });
  assert.equal(await store.deleteSession('alpha'), true);
  assert.match(pool.calls[0].text, /DELETE FROM wa_sessions WHERE id = \$1/);
  assert.deepEqual(pool.calls[0].params, ['alpha']);
});

test('close does not end an injected pool', async () => {
  let endCalled = false;
  const pool = fakePool();
  pool.end = async () => { endCalled = true; };
  const store = new PgStore({ pool });
  await store.close();
  assert.equal(endCalled, false);
});
