import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoLike, createLruSet, createHourlyCounter } from '../src/features/autolike.js';
import { fakeSock, featureSession, statusMsg, HEART } from './helpers.js';

function captureSchedule() {
  const jobs = [];
  const schedule = (fn, ms) => jobs.push({ fn, ms });
  return { jobs, schedule };
}

describe('hourly counter', () => {
  it('allows up to the cap and refuses after it', () => {
    let now = 0;
    const spend = createHourlyCounter(2, () => now);
    assert.equal(spend(), true);
    assert.equal(spend(), true);
    assert.equal(spend(), false);
  });

  it('frees the budget as the hour passes', () => {
    let now = 0;
    const spend = createHourlyCounter(1, () => now);
    assert.equal(spend(), true);
    assert.equal(spend(), false);
    now += 60 * 60 * 1000 + 1;
    assert.equal(spend(), true);
  });
});

describe('LRU set', () => {
  it('evicts the oldest entry beyond the size', () => {
    const lru = createLruSet(2);
    lru.add('a');
    lru.add('b');
    assert.equal(lru.has('a'), true);
    lru.add('c');
    assert.equal(lru.has('a'), false);
    assert.equal(lru.has('b'), true);
    assert.equal(lru.has('c'), true);
  });

  it('refreshes recency on repeated adds', () => {
    const lru = createLruSet(2);
    lru.add('a');
    lru.add('b');
    lru.add('a'); // a is refreshed, b becomes oldest
    lru.add('c');
    assert.equal(lru.has('a'), true);
    assert.equal(lru.has('b'), false);
  });
});

describe('autolike', () => {
  it('does nothing when the setting is off', async () => {
    const { jobs, schedule } = captureSchedule();
    const like = createAutoLike({ schedule });
    const sock = fakeSock();
    await like(featureSession({ settings: { autolike: false } }), sock, statusMsg());
    assert.equal(jobs.length, 0);
    assert.equal(sock.sent.length, 0);
  });

  it('reacts once per status after a 3-8 s delay with the configured emoji', async () => {
    const { jobs, schedule } = captureSchedule();
    const like = createAutoLike({ schedule, rng: () => 0 });
    const sock = fakeSock();
    const session = featureSession({ settings: { autolike: true, autolike_emoji: HEART } });
    const msg = statusMsg({ id: 'S1' });

    await like(session, sock, msg);
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0].ms >= 3000 && jobs[0].ms <= 8000);
    jobs[0].fn();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(sock.sent.length, 1);
    assert.equal(sock.sent[0].jid, 'status@broadcast');
    assert.deepEqual(sock.sent[0].content.react.text, HEART);
    assert.deepEqual(sock.sent[0].content.react.key, msg.key);
  });

  it('never reacts twice to the same status id', async () => {
    const { jobs, schedule } = captureSchedule();
    const like = createAutoLike({ schedule });
    const sock = fakeSock();
    const session = featureSession({ settings: { autolike: true } });
    await like(session, sock, statusMsg({ id: 'S1' }));
    await like(session, sock, statusMsg({ id: 'S1' }));
    assert.equal(jobs.length, 1);
  });

  it('never reacts to own statuses', async () => {
    const { jobs, schedule } = captureSchedule();
    const like = createAutoLike({ schedule });
    const sock = fakeSock();
    const session = featureSession({ settings: { autolike: true }, ownJid: '254700000001@s.whatsapp.net' });
    await like(session, sock, statusMsg({ id: 'S1', participant: '254700000001@s.whatsapp.net' }));
    await like(session, sock, statusMsg({ id: 'S2', fromMe: true }));
    assert.equal(jobs.length, 0);
  });

  it('stops reacting once the hourly cap is spent', async () => {
    const { jobs, schedule } = captureSchedule();
    const spend = createHourlyCounter(2, () => 0);
    spend();
    spend(); // Budget exhausted before the feature runs.
    const like = createAutoLike({ schedule, hourly: spend });
    const sock = fakeSock();
    await like(featureSession({ settings: { autolike: true } }), sock, statusMsg({ id: 'S1' }));
    await like(featureSession({ settings: { autolike: true } }), sock, statusMsg({ id: 'S2' }));
    assert.equal(jobs.length, 0);
  });
});
