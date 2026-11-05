import { test } from 'node:test';
import assert from 'node:assert/strict';
import { londonToUtc, ukLabel } from '../src/time/london.ts';

test('winter is GMT', () => {
  assert.equal(londonToUtc('2026-12-06T19:00').toISOString(), '2026-12-06T19:00:00.000Z');
});

test('summer is BST, an hour ahead', () => {
  assert.equal(londonToUtc('2027-06-06T19:00').toISOString(), '2027-06-06T18:00:00.000Z');
});

test('either side of the clocks going forward and back', () => {
  assert.equal(londonToUtc('2027-03-28T00:59').toISOString(), '2027-03-28T00:59:00.000Z');
  assert.equal(londonToUtc('2027-03-28T02:00').toISOString(), '2027-03-28T01:00:00.000Z');
  assert.equal(londonToUtc('2027-10-31T00:59').toISOString(), '2027-10-30T23:59:00.000Z');
  assert.equal(londonToUtc('2027-10-31T02:00').toISOString(), '2027-10-31T02:00:00.000Z');
});

test('a time the clocks skip or repeat is refused, not guessed', () => {
  assert.throws(() => londonToUtc('2027-03-28T01:30'), /does not exist/);
  assert.throws(() => londonToUtc('2027-10-31T01:30'), /happens twice/);
});

test('a malformed or impossible date is refused', () => {
  assert.throws(() => londonToUtc('2026-12-6T19:00'), /not a YYYY-MM-DDTHH:MM/);
  assert.throws(() => londonToUtc('2027-02-30T19:00'), /not a real date/);
});

test('labels in UK time', () => {
  assert.equal(ukLabel(new Date('2026-12-06T19:00:00Z')), 'Sun 6 Dec 2026, 19:00 UK');
  assert.equal(ukLabel(new Date('2027-06-06T18:00:00Z')), 'Sun 6 Jun 2027, 19:00 UK');
  assert.equal(ukLabel(new Date('2026-09-22T20:00:00Z')), 'Tue 22 Sep 2026, 21:00 UK');
});
