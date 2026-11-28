import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { panel, errorPanel, escapeHtml, commandReference } from '../src/commands/format.js';
import { createRegistry } from '../src/commands/registry.js';

describe('format helpers', () => {
  it('panels render a branded title with rows', () => {
    const text = panel('Health', [
      { label: 'State', value: 'online' },
      'plain line'
    ]);
    assert.match(text, /^\*MaloneX\* - Health\n/);
    assert.match(text, /State: online\n/);
    assert.match(text, /\nplain line$/);
  });

  it('error panels carry the message', () => {
    assert.match(errorPanel('That command failed. Reference abc123.'), /Reference abc123\./);
  });

  it('escapeHtml neutralizes markup and quotes', () => {
    assert.equal(escapeHtml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
    assert.equal(escapeHtml(null), '');
  });

  it('commandReference groups by category and marks owner commands', () => {
    const registry = createRegistry();
    registry.register({ name: 'ping', description: 'Check liveness', category: 'general', access: 'public', run() {} });
    registry.register({ name: 'restart', description: 'Reconnect cleanly', category: 'owner', access: 'owner', run() {} });
    const text = commandReference(registry);
    assert.match(text, /\*general\*\n- ping: Check liveness/);
    assert.match(text, /\*owner\*\n- restart: Reconnect cleanly - owner only/);
  });
});
