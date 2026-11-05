import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkActions, scheduledMs } from '../src/facebook/links.ts';
import type { Post } from '../src/queue/read.ts';

const URL = 'https://tuppin.uk/guides/x';
const link: Post = { id: 'F1', at: '2026-12-06T19:00', facebook: { type: 'link', caption: `Words.\n\n${URL}\n` } };
const reel: Post = { id: 'S1', at: '2026-12-07T19:30', file: 'a.mp4', facebook: { type: 'reel', caption: 'x' } };
const due = Date.parse('2026-12-06T19:00:00Z') / 1000;
const open = new Date('2026-11-20T12:00:00Z');
const run = (posts: Post[], scheduled: Parameters<typeof linkActions>[1], now = open) =>
  linkActions({ timezone: 'Europe/London', posts }, scheduled, now);

test('only link posts, and an open window schedules the caption with its link', () => {
  const [a, ...rest] = run([link, reel], []);
  assert.equal(rest.length, 0);
  assert.deepEqual(a, { id: 'F1', when: new Date(due * 1000), kind: 'schedule', message: `Words.\n\n${URL}`, link: URL });
});

test('a post Facebook already holds for that minute is not scheduled again', () => {
  for (const time of [due, String(due), due + 59]) {
    const [a] = run([link], [{ id: 'p1', message: 'something else', scheduled_publish_time: time }]);
    assert.deepEqual(a, { id: 'F1', when: new Date(due * 1000), kind: 'already', postId: 'p1', why: 'same time' });
  }
});

test('a post with the same link, scheduled by hand at another time, is not scheduled again', () => {
  const [a] = run([link], [{ id: 'p2', message: `Hand-made. ${URL}`, scheduled_publish_time: due + 3600 }]);
  assert.equal(a!.kind, 'already');
});

test('the check holds before the window opens too', () => {
  const [a] = run([link], [{ id: 'p1', scheduled_publish_time: due }], new Date('2026-11-01T12:00:00Z'));
  assert.equal(a!.kind, 'already');
});

test('a different minute and link is not a match', () => {
  const [a] = run([link], [{ id: 'p3', message: 'https://tuppin.uk/other', scheduled_publish_time: due + 60 }]);
  assert.equal(a!.kind, 'schedule');
});

test('waits for the 30-day window, and refuses once too late', () => {
  const [wait] = run([link], [], new Date('2026-11-06T19:59:00Z'));
  assert.equal(wait!.kind, 'wait');
  const [late] = run([link], [], new Date('2026-12-06T18:51:00Z'));
  assert.equal(late!.kind, 'problem');
});

test('a caption without its link is a problem, not a post without one', () => {
  const [a] = run([{ ...link, facebook: { type: 'link', caption: 'No link.' } }], []);
  assert.equal(a!.kind, 'problem');
});

test('Graph times in seconds, as numbers or strings', () => {
  assert.equal(scheduledMs({ id: 'x', scheduled_publish_time: 1796583600 }), 1796583600000);
  assert.equal(scheduledMs({ id: 'x', scheduled_publish_time: '1796583600' }), 1796583600000);
  assert.equal(scheduledMs({ id: 'x' }), null);
});
