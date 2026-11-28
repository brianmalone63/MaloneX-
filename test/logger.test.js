// The logger must never print raw objects (chat contents or session values
// could ride in on one), must still surface error names and messages from
// pino-style calls like logger.error({ err }, '...'), and must respect the
// configured level. Lines go out as "<timestamp> [scope] text".
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/core/logger.js';

function capture() {
  const lines = [];
  return { lines, sink: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) } };
}

describe('logger', () => {
  it('prints plain strings and numbers', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink);
    log.info('Connected as +254****678.', 42);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[malonex\] Connected as \+254\*\*\*\*678\. 42$/);
  });

  it('drops object arguments from pino-style calls instead of printing "[object]"', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink);
    log.info({ browser: 'chrome', helloMsg: { secret: 'raw-protocol-data' } }, 'connected to WA');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[malonex\] connected to WA$/);
    assert.ok(!lines[0].includes('[object]'));
    assert.ok(!lines[0].includes('raw-protocol-data'));
  });

  it('extracts an error from an object argument without printing the object', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink);
    const err = new Error('Connection Timed Out');
    log.error({ err }, 'error in validating connection');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[malonex\] error in validating connection \(Error: Connection Timed Out\)$/);
  });

  it('renders a bare Error argument as name and message', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink);
    log.warn(new RangeError('bad input'));
    assert.match(lines[0], /\[malonex\] \(RangeError: bad input\)$/);
  });

  it('hides everything below the configured level', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink);
    log.debug('Baileys would log credentials at trace level.');
    log.trace('never');
    assert.equal(lines.length, 0);
    log.info('visible');
    assert.equal(lines.length, 1);
  });

  it('routes warnings and errors through the matching console method', () => {
    const warnings = [];
    const errors = [];
    const sink = { log: () => {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) };
    const log = createLogger('malonex', 'info', sink);
    log.warn('warning text');
    log.error('error text');
    assert.equal(warnings.length, 1);
    assert.equal(errors.length, 1);
  });

  it('child loggers keep the rules under a nested scope', () => {
    const { lines, sink } = capture();
    const log = createLogger('malonex', 'info', sink).child('session');
    log.info({ some: 'object' }, 'scoped message');
    assert.match(lines[0], /\[malonex:session\] scoped message$/);
  });
});
