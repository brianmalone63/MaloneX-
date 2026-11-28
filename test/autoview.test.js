import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoView } from '../src/features/autoview.js';
import { fakeSock, featureSession, statusMsg, chatMsg } from './helpers.js';

function captureSchedule() {
  const jobs = [];
  const schedule = (fn, ms) => jobs.push({ fn, ms });
  return { jobs, schedule };
}

describe('autoview', () => {
  it('does nothing when the setting is off', async () => {
    const { jobs, schedule } = captureSchedule();
    const view = createAutoView({ schedule });
    const sock = fakeSock();
    await view(featureSession({ settings: { autoview: false } }), sock, statusMsg());
    assert.equal(jobs.length, 0);
    assert.equal(sock.reads.length, 0);
  });

  it('reads other people\'s statuses after a 1-4 s delay', async () => {
    const { jobs, schedule } = captureSchedule();
    const view = createAutoView({ schedule, rng: () => 0 });
    const sock = fakeSock();
    const msg = statusMsg({ id: 'S1' });
    await view(featureSession({ settings: { autoview: true } }), sock, msg);
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0].ms >= 1000 && jobs[0].ms <= 4000);
    jobs[0].fn();
    assert.equal(sock.reads.length, 1);
    assert.deepEqual(sock.reads[0].key, msg.key);
  });

  it('ignores own statuses and ordinary chats', async () => {
    const { jobs, schedule } = captureSchedule();
    const view = createAutoView({ schedule });
    const sock = fakeSock();
    const session = featureSession({ settings: { autoview: true } });
    await view(session, sock, statusMsg({ id: 'S1', fromMe: true }));
    await view(session, sock, chatMsg({ text: 'hi' }));
    assert.equal(jobs.length, 0);
    assert.equal(sock.reads.length, 0);
  });
});
