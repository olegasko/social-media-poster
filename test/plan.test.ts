import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/plan/plan.ts';
import type { Post } from '../src/queue/read.ts';
import type { DriveFile } from '../src/drive/files.ts';

const link: Post = { id: 'F1', at: '2026-12-06T19:00', facebook: { type: 'link', caption: 'Words.\n\nhttps://tuppin.uk/guides/x' } };
const reel: Post = {
  id: 'S1',
  at: '2026-12-07T19:30',
  file: 'one-phone.mp4',
  facebook: { type: 'reel', caption: 'Words #one' },
  instagram: { type: 'reel', caption: 'Words #one' },
};
const video: DriveFile = {
  id: 'x',
  name: 'one-phone.mp4',
  mimeType: 'video/mp4',
  size: String(8 * 1024 * 1024),
  videoMediaMetadata: { width: 1080, height: 1920, durationMillis: '21000' },
};

const at = (iso: string) => new Date(iso);
const run = (posts: Post[], files: DriveFile[], now: string) => plan({ timezone: 'Europe/London', posts }, files, at(now));
const step = (posts: Post[], files: DriveFile[], now: string, what: string) => run(posts, files, now)[0]!.steps.find((s) => s.what === what)!;

test('a link post is scheduled up to 75 days ahead, less the hour', () => {
  assert.match(step([link], [], '2026-11-05T12:00:00Z', 'facebook link').text, /^would schedule a link post for Sun 6 Dec 2026, 19:00 UK/);
  const far = step([link], [], '2026-09-22T19:00:00Z', 'facebook link');
  assert.equal(far.text, 'window opens Tue 22 Sep 2026, 21:00 UK');
  assert.equal(far.problem, undefined);
});

test('a Reel waits for its 29-day window, then is scheduled', () => {
  assert.equal(step([reel], [video], '2026-11-08T20:29:00Z', 'facebook reel').text, 'window opens Sun 8 Nov 2026, 20:30 UK');
  assert.match(step([reel], [video], '2026-11-08T20:31:00Z', 'facebook reel').text, /^would upload the video and schedule the Reel/);
});

test('inside 10 minutes, or past, is too late for Facebook', () => {
  const s = step([link], [], '2026-12-06T18:51:00Z', 'facebook link');
  assert.equal(s.problem, true);
  assert.match(s.text, /too late/);
});

test('Instagram is posted at the time, and up to an hour late, never later', () => {
  assert.match(step([reel], [video], '2026-12-07T19:00:00Z', 'instagram reel').text, /^would publish at Mon 7 Dec 2026, 19:30 UK/);
  assert.match(step([reel], [video], '2026-12-07T20:30:00Z', 'instagram reel').text, /^would publish now/);
  const missed = step([reel], [video], '2026-12-07T20:31:00Z', 'instagram reel');
  assert.equal(missed.problem, true);
  assert.match(missed.text, /^missed/);
});

test('a missing video is a problem only when the post would go now', () => {
  assert.equal(step([reel], [], '2026-11-05T12:00:00Z', 'video').problem, undefined);
  assert.equal(step([reel], [], '2026-11-20T12:00:00Z', 'video').problem, true);
});

test('a video that does not fit the platforms is a problem', () => {
  const wide = { ...video, videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '21000' } };
  assert.match(step([reel], [wide], '2026-11-20T12:00:00Z', 'video').text, /not 9:16/);
  const long = { ...video, videoMediaMetadata: { width: 1080, height: 1920, durationMillis: '91000' } };
  assert.match(step([reel], [long], '2026-11-20T12:00:00Z', 'video').text, /outside Facebook's 3–90/);
  const webm = { ...video, mimeType: 'video/webm' };
  assert.match(step([reel], [webm], '2026-11-20T12:00:00Z', 'video').text, /not MP4/);
  const raw = { ...video, videoMediaMetadata: undefined };
  assert.match(step([reel], [raw], '2026-11-20T12:00:00Z', 'video').text, /still be processing/);
  assert.equal(step([reel], [video], '2026-11-20T12:00:00Z', 'video').problem, undefined);
});

test('an Instagram caption over the limits is a problem', () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
  const s = step([{ ...reel, instagram: { type: 'reel', caption: tags } }], [video], '2026-11-05T12:00:00Z', 'instagram reel');
  assert.equal(s.problem, true);
});

test('a link post must end with its link', () => {
  const bare = { ...link, facebook: { type: 'link' as const, caption: 'No link here.' } };
  assert.equal(step([bare], [], '2026-11-05T12:00:00Z', 'facebook link').problem, true);
});

test('a UK time that does not exist is a problem for that post alone', () => {
  const plans = run([{ ...link, at: '2027-03-28T01:30' }, link], [], '2026-11-05T12:00:00Z');
  assert.equal(plans[0]!.steps[0]!.problem, true);
  assert.equal(plans[1]!.steps[0]!.problem, undefined);
});
