const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isFresh, snapshotTtlMs } = require('../services/snapshotStore');

describe('snapshotStore isFresh', () => {
  it('rejects missing meta', () => {
    assert.equal(isFresh(null), false);
    assert.equal(isFresh({}), false);
  });

  it('accepts recent createdAt within TTL', () => {
    const now = Date.now();
    assert.equal(isFresh({ createdAt: new Date(now - 1000).toISOString() }, now), true);
  });

  it('rejects expired createdAt', () => {
    const now = Date.now();
    const old = new Date(now - snapshotTtlMs() - 1000).toISOString();
    assert.equal(isFresh({ createdAt: old }, now), false);
  });
});
