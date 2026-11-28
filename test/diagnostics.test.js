import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDisconnect, backoffDelay, MAX_BACKOFF_MS, MAX_CONSECUTIVE_FAILURES } from '../src/session/diagnostics.js';

describe('disconnect classification', () => {
  it('401 wipes stored state and never reconnects', () => {
    const d = classifyDisconnect(401, { registered: true });
    assert.equal(d.action, 'wipe');
    assert.match(d.reason, /logged this session out/);
    assert.match(d.advice, /SESSION/);
  });

  it('440 stops and keeps credentials with duplicate advice', () => {
    const d = classifyDisconnect(440, { registered: true });
    assert.equal(d.action, 'stop-keep');
    assert.match(d.advice, /duplicate deployment/);
  });

  it('515 is a quick reconnect, not a failure', () => {
    const d = classifyDisconnect(515, { registered: true });
    assert.equal(d.action, 'quick-reconnect');
    assert.match(d.reason, /restart/i);
  });

  it('500 reconnects and warns about the consecutive-failure stop', () => {
    const d = classifyDisconnect(500, { registered: true });
    assert.equal(d.action, 'reconnect');
    assert.match(d.advice, /three consecutive failures/);
  });

  it('408, 428 and 503 reconnect with backoff', () => {
    for (const code of [408, 428, 503]) {
      assert.equal(classifyDisconnect(code, { registered: true }).action, 'reconnect');
    }
  });

  it('an unknown code reconnects when registered', () => {
    assert.equal(classifyDisconnect(999, { registered: true }).action, 'reconnect');
  });

  it('a connection closed before registration stops with pairing advice', () => {
    const d = classifyDisconnect(428, { registered: false });
    assert.equal(d.action, 'stop');
    assert.match(d.advice, /pairing site/);
  });
});

describe('backoff maths', () => {
  it('starts at 1s and doubles', () => {
    assert.equal(backoffDelay(1, () => 0.5), 1000); // no jitter at 0.5
    assert.equal(backoffDelay(2, () => 0.5), 2000);
    assert.equal(backoffDelay(3, () => 0.5), 4000);
  });

  it('applies 20 percent jitter on both sides', () => {
    assert.equal(backoffDelay(1, () => 0), 800);
    assert.equal(backoffDelay(1, () => 1), 1200);
  });

  it('caps at five minutes', () => {
    const value = backoffDelay(30, () => 1);
    assert.equal(value, Math.round(MAX_BACKOFF_MS * 1.2));
    assert.ok(value <= MAX_BACKOFF_MS * 1.2);
  });

  it('exposes the consecutive failure limit used by the session', () => {
    assert.equal(MAX_CONSECUTIVE_FAILURES, 3);
  });
});
