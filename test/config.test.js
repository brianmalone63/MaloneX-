import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/core/config.js';

test('default prefix is a dot', () => {
  assert.equal(loadConfig({}).prefix, '.');
});

test('a custom prefix is taken from the environment', () => {
  assert.equal(loadConfig({ PREFIX: '#' }).prefix, '#');
});

test('owners are parsed from a comma separated list with digits only', () => {
  const config = loadConfig({ OWNER: ' +254700000001 , 254700000002,254 700 000 003' });
  assert.deepEqual(config.owners, ['254700000001', '254700000002', '254700000003']);
});

test('public mode accepts common truthy values and defaults to false', () => {
  assert.equal(loadConfig({}).publicMode, false);
  assert.equal(loadConfig({ PUBLIC_MODE: 'true' }).publicMode, true);
  assert.equal(loadConfig({ PUBLIC_MODE: '1' }).publicMode, true);
  assert.equal(loadConfig({ PUBLIC_MODE: 'Yes' }).publicMode, true);
  assert.equal(loadConfig({ PUBLIC_MODE: 'off' }).publicMode, false);
});

test('postgres is selected automatically from a postgres DATABASE_URL', () => {
  assert.equal(loadConfig({ DATABASE_URL: 'postgres://u:p@h/db' }).storage, 'postgres');
  assert.equal(loadConfig({ DATABASE_URL: 'postgresql://u:p@h/db' }).storage, 'postgres');
  assert.equal(loadConfig({ DATABASE_URL: '' }).storage, 'file');
  assert.equal(loadConfig({ DATABASE_URL: 'file:/tmp/db' }).storage, 'file');
});

test('an explicit STORAGE value wins over DATABASE_URL detection', () => {
  assert.equal(loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', STORAGE: 'file' }).storage, 'file');
  assert.equal(loadConfig({ STORAGE: 'postgres' }).storage, 'postgres');
});

test('dataDir defaults to ./data and honours DATA_DIR', () => {
  assert.equal(loadConfig({}).dataDir, './data');
  assert.equal(loadConfig({ DATA_DIR: '/tmp/malonex-data' }).dataDir, '/tmp/malonex-data');
});

test('port falls back to 3000 when missing or invalid', () => {
  assert.equal(loadConfig({}).port, 3000);
  assert.equal(loadConfig({ PORT: '4000' }).port, 4000);
  assert.equal(loadConfig({ PORT: 'not-a-number' }).port, 3000);
});
