import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateSetting, settingsList, Session } from '../src/session/session.js';
import { FileStore } from '../src/store/filestore.js';
import { PgStore, pgSslOptions } from '../src/store/pgstore.js';
import { fakeConfig, fakeLogger } from './helpers.js';
import { createRegistry } from '../src/commands/registry.js';

describe('setting validation', () => {
  it('parses on/off style booleans', () => {
    assert.deepEqual(validateSetting('autoview', 'on'), { ok: true, value: true });
    assert.deepEqual(validateSetting('autoview', 'false'), { ok: true, value: false });
    assert.deepEqual(validateSetting('autolike', 'enable'), { ok: true, value: true });
    assert.equal(validateSetting('autoview', 'maybe').ok, false);
  });

  it('enforces the enum and the single-character emoji rule', () => {
    assert.deepEqual(validateSetting('vv_destination', 'chat'), { ok: true, value: 'chat' });
    assert.match(validateSetting('vv_destination', 'nowhere').error, /takes one of: self, chat/);
    assert.deepEqual(validateSetting('autolike_emoji', '*'), { ok: true, value: '*' });
    assert.match(validateSetting('autolike_emoji', 'ab').error, /exactly one character/);
    assert.match(validateSetting('nope', 'x').error, /Unknown setting/);
  });

  it('lists every setting with its default', () => {
    const list = settingsList();
    const keys = list.map((s) => s.key).sort();
    assert.deepEqual(keys, ['autolike', 'autolike_emoji', 'autoview', 'vv_destination']);
    assert.equal(list.find((s) => s.key === 'autoview').default, false);
  });
});

describe('settings persistence', () => {
  it('round trips through the FileStore in a temp dir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'malonex-settings-'));
    const store = new FileStore({ dataDir: dir, logger: fakeLogger() });
    await store.init();
    await store.setSetting('000000000000', 'autoview', true);
    await store.saveSessionMeta('000000000000', { phone: '254712345678' });

    const reopened = new FileStore({ dataDir: dir, logger: fakeLogger() });
    const settings = await reopened.getSettings('000000000000');
    assert.equal(settings.autoview, true);
    assert.equal(settings._meta.phone, '254712345678');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Session.setSetting validates, updates memory and persists', async () => {
    const store = {
      saved: [],
      async getSettings() { return {}; },
      async setSetting(id, key, value) { this.saved.push({ key, value }); }
    };
    const session = new Session({
      config: fakeConfig(),
      store,
      registry: createRegistry(),
      logger: fakeLogger()
    });
    const result = await session.setSetting('autolike', 'on');
    assert.deepEqual(result, { ok: true, value: true });
    assert.equal(session.settings.autolike, true);
    assert.deepEqual(store.saved, [{ key: 'autolike', value: true }]);

    const bad = await session.setSetting('vv_destination', 'nowhere');
    assert.equal(bad.ok, false);
    assert.equal(store.saved.length, 1);
  });

  it('Session.setSetting survives storage failures with a clear error', async () => {
    const store = {
      async getSettings() { return {}; },
      async setSetting() { throw new Error('disk full'); }
    };
    const session = new Session({
      config: fakeConfig(),
      store,
      registry: createRegistry(),
      logger: fakeLogger()
    });
    const result = await session.setSetting('autoview', 'on');
    assert.equal(result.ok, false);
    assert.match(result.error, /could not be saved/);
  });
});

describe('pg store plumbing', () => {
  class FakePool {
    constructor() {
      this.queries = [];
      this.listeners = {};
    }
    on(event, fn) {
      this.listeners[event] = fn;
    }
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.includes('FROM wa_settings')) return { rows: [{ k: 'autolike', v: true }] };
      if (sql.includes('k = $2')) return { rows: [{ v: { registered: true } }] };
      if (sql.includes('k <> $2')) return { rows: [{ k: 'session:1', v: { x: 1 } }] };
      return { rows: [] };
    }
    async end() {}
  }

  it('uses TLS for remote hosts and none for localhost', () => {
    assert.equal(pgSslOptions('postgres://u:p@localhost:5432/db'), undefined);
    assert.equal(pgSslOptions('postgres://u:p@127.0.0.1:5432/db'), undefined);
    assert.deepEqual(pgSslOptions('postgres://u:p@ec2-1-2-3-4.compute-1.amazonaws.com:5432/db'), { rejectUnauthorized: false });
    assert.deepEqual(pgSslOptions('not a url'), { rejectUnauthorized: false });
  });

  it('round trips settings and auth through SQL, and bulk upserts via unnest', async () => {
    const pool = new FakePool();
    const store = new PgStore({ connectionString: 'postgres://u:p@remote.example/db', pool });
    await store.setSetting('000000000000', 'autolike', true);
    const insert = pool.queries.find((q) => q.sql.includes('INSERT INTO wa_settings'));
    assert.match(insert.sql, /ON CONFLICT/);
    assert.deepEqual(insert.params[1], 'autolike');

    const settings = await store.getSettings('000000000000');
    assert.equal(settings.autolike, true);

    await store.setAuthBulk('000000000000', [['session:1', '{"a":1}'], ['session:2', '{"b":2}']]);
    const bulk = pool.queries.find((q) => q.sql.includes('unnest'));
    assert.match(bulk.sql, /ON CONFLICT \(session_id, k\) DO UPDATE/);
    assert.deepEqual(bulk.params[1], ['session:1', 'session:2']);

    const auth = await store.getAuth('000000000000');
    assert.deepEqual(auth.creds, { registered: true });
    assert.deepEqual(auth.keys['session:1'], { x: 1 });
  });

  it('swallows pool errors instead of crashing the process', () => {
    const pool = new FakePool();
    new PgStore({ connectionString: 'postgres://u:p@remote.example/db', pool, logger: fakeLogger() });
    assert.equal(typeof pool.listeners.error, 'function');
    assert.doesNotThrow(() => pool.listeners.error(new Error('idle client crash')));
  });
});
