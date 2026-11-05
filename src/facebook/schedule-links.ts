// Schedules the queue's Facebook link posts whose window is open, on the Page
// in META_PAGE_ID. MODE=dry-run (the default) reads the Page's scheduled posts
// and prints what it would do; only MODE=schedule writes, at most MAX_POSTS
// posts a run (default 1), each read back to prove Facebook holds it for the
// right time and unpublished.
//
// Captions are not printed: this repository's logs are public.

import { readQueue } from '../queue/read.ts';
import { graphGet, graphPost } from '../meta/graph.ts';
import { linkActions, scheduledMs, type Scheduled } from './links.ts';
import { ukLabel } from '../time/london.ts';

const pageId = process.env.META_PAGE_ID;
if (!pageId || !/^\d+$/.test(pageId)) throw new Error('META_PAGE_ID is not set to a page id');
const mode = process.env.MODE?.trim() || 'dry-run';
if (mode !== 'dry-run' && mode !== 'schedule') throw new Error('MODE must be dry-run or schedule');
const max = Number(process.env.MAX_POSTS?.trim() || '1');
if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('MAX_POSTS must be a whole number from 1 to 10');

async function scheduledPosts(): Promise<Scheduled[]> {
  const out: Scheduled[] = [];
  let after = '';
  for (let page = 0; page < 20; page += 1) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
    const r = await graphGet<{ data: Scheduled[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${pageId}/scheduled_posts?fields=id,message,scheduled_publish_time&limit=100${cursor}`,
    );
    out.push(...r.data);
    if (!r.paging?.next || !r.paging.cursors?.after) return out;
    after = r.paging.cursors.after;
  }
  throw new Error('more than 2000 scheduled posts: refusing to guess which are ours');
}

const now = new Date();
const [queue, scheduled] = await Promise.all([readQueue(), scheduledPosts()]);
console.log(`${mode} as at ${ukLabel(now)}: the Page has ${scheduled.length} scheduled post(s)\n`);

const actions = linkActions(queue, scheduled, now);
let problems = 0;
let done = 0;
for (const a of actions) {
  if (a.kind === 'problem') {
    problems += 1;
    console.log(`${a.id}  PROBLEM: ${a.why}`);
    continue;
  }
  const label = `${a.id}  ${ukLabel(a.when)}`;
  if (a.kind === 'already') console.log(`${label}  already scheduled (${a.why}): post ${a.postId}`);
  else if (a.kind === 'wait') console.log(`${label}  window opens ${ukLabel(a.opens)}`);
  else if (mode === 'dry-run') console.log(`${label}  would schedule (message ${a.message.length} characters, link on its last line)`);
  else if (done >= max) console.log(`${label}  left for the next run: MAX_POSTS is ${max}`);
  else {
    const seconds = Math.round(a.when.getTime() / 1000);
    const created = await graphPost<{ id: string }>(`${pageId}/feed`, {
      message: a.message,
      link: a.link,
      published: false,
      scheduled_publish_time: seconds,
    });
    done += 1;
    // Read it back: the write is believed only once Facebook says what it holds.
    const back = await graphGet<{ id: string; is_published?: boolean; scheduled_publish_time?: number | string }>(
      `${created.id}?fields=id,is_published,scheduled_publish_time`,
    );
    const at = scheduledMs(back);
    if (back.is_published !== false || at !== seconds * 1000) {
      problems += 1;
      console.log(`${label}  PROBLEM: created post ${created.id}, but Facebook holds it ${back.is_published ? 'published' : 'unpublished'} for ${at ? ukLabel(new Date(at)) : 'no time'}`);
    } else {
      console.log(`${label}  scheduled: post ${created.id}`);
    }
  }
}
console.log(problems ? `\nfailed: ${problems} problem(s)` : '\nok');
if (problems) process.exitCode = 1;
