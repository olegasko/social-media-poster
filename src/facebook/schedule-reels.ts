// Schedules the queue's Facebook Reels whose window is open, on the Page in
// META_PAGE_ID. MODE=dry-run (the default) reads the Page's Reels and the
// Drive folder and prints what it would do; only MODE=schedule writes, at most
// MAX_POSTS Reels a run (default 1).
//
// Each Reel is Meta's three phases (Reels Publishing API, read 9 November
// 2026): start an upload session on /{page}/video_reels, send the bytes to
// rupload.facebook.com, then finish with video_state SCHEDULED and the time.
// It is believed only once Facebook reads it back as scheduled, and its time
// shows either on the Reel or as a video on scheduled_posts (reels.ts says
// why: measured, the Reel itself carries no time).
//
// Captions are not printed: this repository's logs are public. The times of
// the Page's scheduled Reels are, because they are the check that this job
// can see Reels scheduled by hand in the Planner.

import { readQueue } from '../queue/read.ts';
import { folderFiles, downloadFile } from '../drive/files.ts';
import { graphGet, graphPost, reelUpload } from '../meta/graph.ts';
import { publishMs, publishStatus, reelActions, scheduledVideos, videoAt, type PageReel, type ScheduledPost } from './reels.ts';
import { ukLabel } from '../time/london.ts';

const pageId = process.env.META_PAGE_ID;
if (!pageId || !/^\d+$/.test(pageId)) throw new Error('META_PAGE_ID is not set to a page id');
const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) throw new Error('GDRIVE_FOLDER_ID is not set');
const mode = process.env.MODE?.trim() || 'dry-run';
if (mode !== 'dry-run' && mode !== 'schedule') throw new Error('MODE must be dry-run or schedule');
const max = Number(process.env.MAX_POSTS?.trim() || '1');
if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('MAX_POSTS must be a whole number from 1 to 10');

const FIELDS = 'id,description,status';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageReels(): Promise<PageReel[]> {
  const out: PageReel[] = [];
  let after = '';
  for (let page = 0; page < 20; page += 1) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
    const r = await graphGet<{ data: PageReel[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${pageId}/video_reels?fields=${FIELDS}&limit=100${cursor}`,
    );
    out.push(...r.data);
    if (!r.paging?.next || !r.paging.cursors?.after) return out;
    after = r.paging.cursors.after;
  }
  throw new Error('more than 2000 Reels: refusing to guess which are ours');
}

async function pageScheduledVideos(): Promise<{ id: string; ms: number }[]> {
  const out: ScheduledPost[] = [];
  let after = '';
  for (let page = 0; page < 20; page += 1) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
    const r = await graphGet<{ data: ScheduledPost[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${pageId}/scheduled_posts?fields=id,scheduled_publish_time,attachments{media_type,type}&limit=100${cursor}`,
    );
    out.push(...r.data);
    if (!r.paging?.next || !r.paging.cursors?.after) return scheduledVideos(out);
    after = r.paging.cursors.after;
  }
  throw new Error('more than 2000 scheduled posts: refusing to guess which are ours');
}

/** Polls a Reel's status until `done` says so, or a phase reports an error, or time runs out. */
async function until(videoId: string, done: (r: PageReel) => boolean, seconds: number): Promise<PageReel> {
  let last: PageReel = { id: videoId };
  for (let waited = 0; waited <= seconds; waited += 5) {
    last = await graphGet<PageReel>(`${videoId}?fields=${FIELDS}`);
    const s = last.status;
    if (s?.video_status === 'error' || s?.video_status === 'upload_failed' || s?.processing_phase?.status === 'error') {
      throw new Error(`Reel ${videoId}: Facebook reports ${s.video_status}, processing ${s.processing_phase?.status ?? '?'}`);
    }
    if (done(last)) return last;
    await wait(5000);
  }
  return last;
}

const now = new Date();
const [queue, files, reels, videos] = await Promise.all([readQueue(), folderFiles(folderId), pageReels(), pageScheduledVideos()]);
const scheduledTimes = reels.filter((r) => publishStatus(r) === 'scheduled').map((r) => publishMs(r)).filter((ms) => ms !== null);
console.log(`${mode} as at ${ukLabel(now)}: the Page has ${reels.length} Reel(s), ${scheduledTimes.length} scheduled`);
for (const ms of scheduledTimes.sort((a, b) => a - b)) console.log(`  scheduled Reel at ${ukLabel(new Date(ms))}`);
console.log(`scheduled_posts holds ${videos.length} video(s)`);
for (const { ms } of [...videos].sort((a, b) => a.ms - b.ms)) console.log(`  scheduled video at ${ukLabel(new Date(ms))}`);
console.log('');

let problems = 0;
let done = 0;
for (const a of reelActions(queue, reels, videos, files, now)) {
  if (a.kind === 'problem') {
    problems += 1;
    console.log(`${a.id}  PROBLEM: ${a.why}`);
    continue;
  }
  const label = `${a.id}  ${ukLabel(a.when)}`;
  if (a.kind === 'already') console.log(`${label}  already scheduled (${a.why}): Reel ${a.reelId}`);
  else if (a.kind === 'wait') console.log(`${label}  window opens ${ukLabel(a.opens)}`);
  else if (mode === 'dry-run') console.log(`${label}  would upload ${a.file.name} and schedule it (description ${a.description.length} characters)`);
  else if (done >= max) console.log(`${label}  left for the next run: MAX_POSTS is ${max}`);
  else {
    done += 1;
    const seconds = Math.round(a.when.getTime() / 1000);
    const bytes = await downloadFile(a.file);
    const start = await graphPost<{ video_id: string; upload_url: string }>(`${pageId}/video_reels`, { upload_phase: 'start' });
    await reelUpload(start.upload_url, bytes);
    await until(start.video_id, (r) => r.status?.video_status !== 'uploading', 120);
    await graphPost<{ success?: boolean }>(`${pageId}/video_reels`, {
      video_id: start.video_id,
      upload_phase: 'finish',
      video_state: 'SCHEDULED',
      scheduled_publish_time: seconds,
      description: a.description,
    });
    // Read it back: the write is believed only once Facebook says what it holds.
    // The duplicate check above found no video at this minute, so one there now is this Reel.
    const ms = seconds * 1000;
    const back = await until(start.video_id, (r) => publishStatus(r) === 'scheduled', 180);
    const at = publishMs(back);
    let held = at === ms;
    for (let waited = 0; !held && publishStatus(back) === 'scheduled' && at === null && waited <= 60; waited += 10) {
      held = videoAt(await pageScheduledVideos(), ms);
      if (!held) await wait(10_000);
    }
    if (publishStatus(back) !== 'scheduled' || !held) {
      problems += 1;
      const where = at ? ukLabel(new Date(at)) : 'no time on the Reel and no video at that minute on scheduled_posts';
      console.log(`${label}  PROBLEM: uploaded Reel ${start.video_id}, but Facebook holds it ${publishStatus(back) ?? 'with no status'} for ${where}`);
    } else {
      console.log(`${label}  scheduled: Reel ${start.video_id} (${a.file.name}, ${bytes.length} bytes)${at === ms ? '' : ', its time read from scheduled_posts'}`);
    }
  }
}
console.log(problems ? `\nfailed: ${problems} problem(s)` : '\nok');
if (problems) process.exitCode = 1;
