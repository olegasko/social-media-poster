import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishMs, reelActions, scheduledVideos, videoAt, type PageReel, type ScheduledPost } from '../src/facebook/reels.ts';
import type { DriveFile } from '../src/drive/files.ts';
import type { Post } from '../src/queue/read.ts';

const caption = 'A brown envelope.\n\nMore words.\n\n#StillOnHold\n';
const reel: Post = { id: 'S6', at: '2026-12-07T19:30', file: 'a.mp4', facebook: { type: 'reel', caption } };
const link: Post = { id: 'F1', at: '2026-12-06T19:00', facebook: { type: 'link', caption: 'x\nhttps://tuppin.uk/x' } };
const video: DriveFile = {
  id: 'f1',
  name: 'a.mp4',
  mimeType: 'video/mp4',
  size: '5000000',
  videoMediaMetadata: { width: 1080, height: 1920, durationMillis: '21000' },
};
const due = Date.parse('2026-12-07T19:30:00Z') / 1000;
const open = new Date('2026-11-20T12:00:00Z');
const scheduledAt = (id: string, seconds: number | string, description?: string): PageReel => ({
  id,
  ...(description !== undefined && { description }),
  status: { publishing_phase: { publish_status: 'scheduled', publish_time: seconds } },
});
const run = (posts: Post[], reels: PageReel[], files: DriveFile[] = [video], now = open, videos: { id: string; ms: number }[] = []) =>
  reelActions({ timezone: 'Europe/London', posts }, reels, videos, files, now);
const post = (id: string, seconds: number | string, media_type?: string, type?: string): ScheduledPost => ({
  id,
  scheduled_publish_time: seconds,
  attachments: { data: [{ ...(media_type && { media_type }), ...(type && { type }) }] },
});

test('only Reels, and an open window schedules the caption with its video', () => {
  const [a, ...rest] = run([link, reel], []);
  assert.equal(rest.length, 0);
  assert.deepEqual(a, { id: 'S6', when: new Date(due * 1000), kind: 'schedule', description: caption.trimEnd(), file: video });
});

test('a Reel Facebook already holds for that minute is not scheduled again', () => {
  for (const time of [due, String(due), due + 59]) {
    const [a] = run([reel], [scheduledAt('r1', time, 'something else')]);
    assert.deepEqual(a, { id: 'S6', when: new Date(due * 1000), kind: 'already', reelId: 'r1', why: 'same time' });
  }
});

test('a Reel with the same first line, scheduled by hand at another time or already out, is not scheduled again', () => {
  const [a] = run([reel], [scheduledAt('r2', due + 3600, 'A brown envelope.\n\nEdited in the Planner.')]);
  assert.equal(a!.kind, 'already');
  const published: PageReel = { id: 'r3', description: '  A brown envelope.  ', status: { publishing_phase: { publish_status: 'published' } } };
  assert.equal(run([reel], [published])[0]!.kind, 'already');
});

test('a draft or an errored Reel does not count as done', () => {
  for (const publish_status of ['draft', 'error']) {
    const r: PageReel = { id: 'r4', description: caption, status: { publishing_phase: { publish_status, publish_time: due } } };
    assert.equal(run([reel], [r])[0]!.kind, 'schedule');
  }
});

test('a different minute and first line is not a match', () => {
  const [a] = run([reel], [scheduledAt('r5', due + 60, 'Another episode.')]);
  assert.equal(a!.kind, 'schedule');
});

test('waits for the 27-day window, and refuses once too late', () => {
  const [w] = run([reel], [], [video], new Date('2026-11-10T19:29:00Z'));
  assert.deepEqual(w, { id: 'S6', when: new Date(due * 1000), kind: 'wait', opens: new Date('2026-11-10T19:30:00Z') });
  assert.equal(run([reel], [], [video], new Date('2026-11-10T19:30:00Z'))[0]!.kind, 'schedule');
  assert.equal(run([reel], [], [video], new Date('2026-12-07T19:21:00Z'))[0]!.kind, 'problem');
});

test('the check for a Reel already held comes before the video is needed', () => {
  assert.equal(run([reel], [scheduledAt('r1', due)], [])[0]!.kind, 'already');
});

test('a missing or unsuitable video is a problem when the window is open, not a Reel without one', () => {
  assert.match((run([reel], [], []) as [{ why: string }])[0].why, /not in Drive/);
  const wide = { ...video, videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '21000' } };
  assert.match((run([reel], [], [wide]) as [{ why: string }])[0].why, /not 9:16/);
  const { file: _, ...noFile } = reel;
  assert.match((run([noFile], []) as [{ why: string }])[0].why, /names no video/);
});

test('a Reel with an empty caption is a problem', () => {
  assert.equal(run([{ ...reel, facebook: { type: 'reel', caption: '  \n' } }], [])[0]!.kind, 'problem');
});

test('publish times in seconds, as numbers or strings; nothing else', () => {
  assert.equal(publishMs(scheduledAt('x', due)), due * 1000);
  assert.equal(publishMs(scheduledAt('x', String(due))), due * 1000);
  assert.equal(publishMs({ id: 'x' }), null);
  assert.equal(publishMs(scheduledAt('x', 0)), null);
});

test('scheduled_posts: only videos count, with their times, and a link post is not a Reel', () => {
  const got = scheduledVideos([
    post('v1', due, 'video'),
    post('v2', String(due + 7 * 86400), undefined, 'video_inline'),
    post('l1', due - 1800, 'link'),
    { id: 'n1', scheduled_publish_time: due },
    post('v3', '', 'video'),
  ]);
  assert.deepEqual(got, [
    { id: 'v1', ms: due * 1000 },
    { id: 'v2', ms: (due + 7 * 86400) * 1000 },
  ]);
});

test('a video on scheduled_posts at that minute is a Reel already held, as S6 was on 11 November 2026', () => {
  const videos = scheduledVideos([post('p1', due + 30, 'video')]);
  const [a] = run([reel], [], [], open, videos);
  assert.deepEqual(a, { id: 'S6', when: new Date(due * 1000), kind: 'already', reelId: 'p1', why: 'scheduled video at the same time' });
  assert.ok(videoAt(videos, due * 1000));
});

test('a video on scheduled_posts at another minute, or a link post at that minute, does not stop a Reel', () => {
  assert.equal(run([reel], [], [video], open, scheduledVideos([post('p2', due + 60, 'video')]))[0]!.kind, 'schedule');
  assert.equal(run([reel], [], [video], open, scheduledVideos([post('l2', due, 'link')]))[0]!.kind, 'schedule');
  assert.equal(videoAt(scheduledVideos([post('p3', due + 60, 'video')]), due * 1000), false);
});
