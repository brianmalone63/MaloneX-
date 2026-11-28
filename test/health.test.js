import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityPct, formatDuration } from '../src/session/health.js';

describe('availability maths', () => {
  it('is 100 percent when connected for the whole uptime', () => {
    assert.equal(availabilityPct(60000, 60000), 100);
  });

  it('is proportional for partial coverage', () => {
    assert.equal(availabilityPct(30000, 60000), 50);
    assert.equal(availabilityPct(33333, 99999), 33.33);
  });

  it('is 0 with no data and never negative', () => {
    assert.equal(availabilityPct(0, 0), 0);
    assert.equal(availabilityPct(0, 1000), 0);
    assert.equal(availabilityPct(-5, 1000), 0);
    assert.equal(availabilityPct(2000, 1000), 100);
  });
});

describe('duration formatting', () => {
  it('renders days, hours, minutes and seconds', () => {
    assert.equal(formatDuration(3661), '1h 1m 1s');
    assert.equal(formatDuration(90061), '1d 1h 1m 1s');
    assert.equal(formatDuration(0), '0m 0s');
    assert.equal(formatDuration(60), '1m 0s');
  });
});
