import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { considerReport, distinctReporterCount, hashReporterId, roomSizeFromHashes } from './reporters.js';

describe('reporter identity', () => {
  it('hashes the same IP to one id and never returns the raw IP', async () => {
    const salt = 'a'.repeat(32);
    const a = await hashReporterId(salt, '203.0.113.10');
    const b = await hashReporterId(salt, '203.0.113.10');
    const c = await hashReporterId(salt, '203.0.113.11');
    const otherSalt = await hashReporterId('b'.repeat(32), '203.0.113.10');
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.equal(a.includes('203.0.113.10'), false);
    assert.notEqual(a, c);
    assert.notEqual(a, otherSalt);
    assert.equal(await hashReporterId(salt, ''), '');
    assert.equal(await hashReporterId('', '203.0.113.10'), '');
  });

  it('dedupes reports per hash, ignores the uploader, and counts room size by distinct IPs', () => {
    const first = considerReport([], 'aaa', 'uploader');
    assert.equal(first.accepted, true);
    const again = considerReport(first.reports, 'aaa', 'uploader');
    assert.equal(again.accepted, false);
    assert.equal(again.reason, 'duplicate');
    assert.equal(again.reports.length, 1);
    const self = considerReport([], 'uploader', 'uploader');
    assert.equal(self.accepted, false);
    assert.equal(self.reason, 'uploader');
    assert.equal(self.reports.length, 0);
    const missing = considerReport(['aaa'], '', 'uploader');
    assert.equal(missing.accepted, false);
    assert.equal(missing.reports.length, 1);
    const manySockets = ['rep', 'rep', 'rep', 'uploader', '', null];
    assert.equal(distinctReporterCount(manySockets), 2);
    assert.equal(roomSizeFromHashes(manySockets), 2);
    assert.equal(roomSizeFromHashes([]), 1);
  });
});
