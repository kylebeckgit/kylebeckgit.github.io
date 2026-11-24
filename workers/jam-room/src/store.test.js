import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evictOldestIfNeeded, sortApprovedPool } from './store.js';
import { POOL_CAP } from './validate.js';

describe('approved pool eviction', () => {
  it('evicts the oldest approvedAt clip, not a late-approved pending with an early createdAt', () => {
    const late = { id: 'late', createdAt: 1, approvedAt: 100, meta: { approvedAt: 100 } };
    const mid = { id: 'mid', createdAt: 50, approvedAt: 60, meta: { approvedAt: 60 } };
    const early = { id: 'early', createdAt: 40, approvedAt: 40, meta: { approvedAt: 40 } };
    const ranked = sortApprovedPool([late, mid, early]);
    assert.deepEqual(ranked.map((row) => row.id), ['early', 'mid', 'late']);

    const rows = [];
    const sql = {
      exec(query, ...args) {
        if (String(query).includes('CREATE TABLE')) return [];
        if (String(query).startsWith('DELETE FROM uploads WHERE id')) {
          const i = rows.findIndex((row) => row.id === args[0]);
          if (i >= 0) rows.splice(i, 1);
          return [];
        }
        if (String(query).includes("status = 'approved'")) {
          return rows.filter((row) => row.status === 'approved');
        }
        return rows;
      },
    };

    for (let i = 0; i < POOL_CAP; i++) {
      rows.push({
        id: `old-${i}`,
        status: 'approved',
        createdAt: 200 + i,
        updatedAt: 200 + i,
        userId: 'u',
        meta: JSON.stringify({ approvedAt: 200 + i }),
        reports: '[]',
        speech: 0,
        keepOptIn: 0,
      });
    }
    rows.push({
      id: 'late-pending',
      status: 'approved',
      createdAt: 1,
      updatedAt: 10_000,
      userId: 'u',
      meta: JSON.stringify({ approvedAt: 10_000 }),
      reports: '[]',
      speech: 0,
      keepOptIn: 0,
    });
    assert.equal(rows.length, POOL_CAP + 1);
    const evicted = evictOldestIfNeeded(sql);
    assert.deepEqual(evicted, ['old-0']);
    assert.equal(rows.some((row) => row.id === 'late-pending'), true);
    assert.equal(rows.some((row) => row.id === 'old-0'), false);
    assert.equal(rows.length, POOL_CAP);
  });
});
