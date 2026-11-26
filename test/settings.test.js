import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/core/filestore.js';
import { Session } from '../src/core/session.js';
import {
  SETTINGS_SCHEMA, SETTING_KEYS, defaultSettings, validateSetting,
  applyDefaults, isSingleEmoji
} from '../src/core/settings.js';

test('safety relevant settings default to off and identity settings are seeded', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.autoview, false);
  assert.equal(defaults.autolike, false);
  assert.equal(defaults.autolike_emoji, '\u2764\uFE0F');
  assert.equal(defaults.vv_destination, 'self');
  // Every protection and automation switch must ship disabled.
  for (const key of ['ANTIDELETE', 'ANTI_EDIT', 'ANTICALL', 'ANTIVIEWONCE', 'PM_PERMIT']) {
    assert.equal(defaults[key] === false || defaults[key] === 'off', true, `${key} must default off`);
  }
  assert.equal(defaults.AUTO_REACT, 'off');
  assert.equal(defaults.AUTO_READ_MESSAGES, 'off');
  assert.equal(defaults.CHATBOT, 'off');
  assert.equal(defaults.AUTO_BIO, false);
  // Identity and service keys carry sane defaults.
  assert.equal(defaults.BOT_NAME, 'MaloneX');
  assert.equal(defaults.PACK_AUTHOR, 'Brian Malone');
  assert.equal(SETTING_KEYS.includes('autoview') && SETTING_KEYS.includes('MEDIA_API_URL'), true);
  assert.ok(SETTING_KEYS.length >= 30);
});

test('unknown setting keys are rejected', () => {
  const result = validateSetting('bogus_key', true);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown setting/);
});

test('boolean settings enforce their type', () => {
  assert.equal(validateSetting('autoview', true).ok, true);
  assert.equal(validateSetting('autoview', 'yes').ok, false);
  assert.equal(validateSetting('autolike', 1).ok, false);
});

test('enum settings only accept listed values', () => {
  assert.equal(validateSetting('vv_destination', 'self').ok, true);
  assert.equal(validateSetting('vv_destination', 'chat').ok, true);
  assert.equal(validateSetting('vv_destination', 'group').ok, false);
  assert.equal(validateSetting('vv_destination', 'SELF').ok, false);
});

test('the emoji validator accepts exactly one emoji and rejects the rest', () => {
  assert.equal(isSingleEmoji('\u2764\uFE0F'), true);
  assert.equal(isSingleEmoji('\u{1F44D}'), true);
  assert.equal(isSingleEmoji('\u{1F929}'), true);
  assert.equal(isSingleEmoji('abc'), false);
  assert.equal(isSingleEmoji('\u2764\uFE0F\u2764\uFE0F'), false);
  assert.equal(isSingleEmoji('1'), false);
  assert.equal(isSingleEmoji('#'), false);
  assert.equal(isSingleEmoji(''), false);
  assert.equal(validateSetting('autolike_emoji', 'not-an-emoji').ok, false);
});

test('applyDefaults fills missing keys and drops unknown stored keys', () => {
  const settings = applyDefaults({ autoview: true, hacker: 'nope' });
  assert.equal(settings.autoview, true);
  assert.equal(settings.autolike, false);
  assert.equal(settings.vv_destination, 'self');
  assert.equal('hacker' in settings, false);
});

test('settings persist round trip through the FileStore in a temp dir', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-settings-'));
  const store = new FileStore({ dataDir: dir });
  await store.init();
  await store.createSession('alpha');
  await store.setSetting('alpha', 'autoview', true);
  await store.setSetting('alpha', 'vv_destination', 'chat');

  const reopened = new FileStore({ dataDir: dir });
  assert.deepEqual(await reopened.getSettings('alpha'), { autoview: true, vv_destination: 'chat' });
});

test('session.setSetting updates memory, rejects unknown keys and persists', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-session-settings-'));
  const store = new FileStore({ dataDir: dir });
  await store.init();
  await store.createSession('alpha');
  const session = new Session({ id: 'alpha', store, config: { prefix: '.', owners: [], publicMode: false }, registry: { hooks: [], commands: [] } });

  assert.equal(session.settings.autoview, false);
  const ok = await session.setSetting('autoview', true);
  assert.equal(ok.ok, true);
  assert.equal(session.settings.autoview, true);
  assert.equal((await store.getSettings('alpha')).autoview, true);

  const bad = await session.setSetting('nonsense', true);
  assert.equal(bad.ok, false);
  assert.equal('nonsense' in session.settings, false);
});
