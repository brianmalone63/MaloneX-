import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, maskPhone, jidToPhone } from '../src/core/phones.js';

describe('phone normalization', () => {
  it('accepts international formats and strips decorations', () => {
    assert.equal(normalizePhone('+254 712 345 678'), '254712345678');
    assert.equal(normalizePhone('+1 (415) 555-2671'), '14155552671');
    assert.equal(normalizePhone('254712345678'), '254712345678');
  });

  it('rejects invalid numbers', () => {
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone('0712345678'), null); // leading zero
    assert.equal(normalizePhone('12345'), null); // too short
    assert.equal(normalizePhone('1234567890123456'), null); // too long
    assert.equal(normalizePhone('not a phone'), null);
    assert.equal(normalizePhone(null), null);
  });
});

describe('phone masking', () => {
  it('keeps the first three and last three digits', () => {
    assert.equal(maskPhone('254712345678'), '+254****678');
    assert.equal(maskPhone('14155552671'), '+141****671');
  });

  it('fully masks short inputs and hides non-digits', () => {
    assert.equal(maskPhone('12345678'), '+********');
    assert.equal(maskPhone('abc'), '+****');
    assert.equal(maskPhone(null), '+****');
  });
});

describe('jid to phone', () => {
  it('strips the server and device suffixes', () => {
    assert.equal(jidToPhone('254712345678:12@s.whatsapp.net'), '254712345678');
    assert.equal(jidToPhone('254712345678@s.whatsapp.net'), '254712345678');
    assert.equal(jidToPhone(null), null);
  });
});
