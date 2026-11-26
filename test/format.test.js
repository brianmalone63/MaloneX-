import test from 'node:test';
import assert from 'node:assert/strict';
import { panel, notice, usage, error, onOff, heading, caption } from '../src/core/format.js';
import { assertNoEmoji } from './helpers.js';

test('panel renders the title as a bold uppercase heading', () => {
  const out = panel('Automation', [{ label: 'Auto view status', value: 'ON' }]);
  assert.match(out, /^\*AUTOMATION\*/);
});

test('panel renders label and value rows separated by a colon', () => {
  const out = panel('Automation', [{ label: 'Auto view status', value: 'ON' }]);
  assert.match(out, /Auto view status : ON/);
});

test('panel renders plain string rows and an optional footer', () => {
  const out = panel('Menu', ['General', 'Automation'], 'footer line');
  assert.match(out, /General/);
  assert.match(out, /Automation/);
  assert.match(out, /footer line/);
});

test('notice, usage and error include their text', () => {
  assert.match(notice('the session is restarting'), /the session is restarting/);
  assert.match(usage('use .autoview on|off'), /use \.autoview on\|off/);
  assert.match(error('media too large'), /media too large/);
});

test('caption is a short single line', () => {
  const out = caption('image · 1.00 MB');
  assert.match(out, /image · 1\.00 MB/);
  assert.equal(out.split('\n').length, 1);
});

test('heading uppercases the text', () => {
  assert.equal(heading('settings'), '*SETTINGS*');
});

test('onOff renders booleans as ON and OFF', () => {
  assert.equal(onOff(true), 'ON');
  assert.equal(onOff(false), 'OFF');
});

test('no format output ever contains an emoji', () => {
  const outputs = [
    panel('Automation', [{ label: 'A', value: 'B' }, 'plain row'], 'footer'),
    notice('text'), usage('text'), error('text'), caption('text'), heading('text')
  ];
  for (const out of outputs) assertNoEmoji(out);
});
