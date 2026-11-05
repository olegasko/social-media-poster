// What the poster would do with the queue at a given moment, without doing
// it. Pure: the queue, the Drive listing and the time go in, a plan comes out,
// so the decisions can be tested without a network.
//
// Limits are Meta's, read on 5 November 2026:
// - Page feed: scheduled_publish_time 10 minutes to 75 days ahead.
// - Facebook Reels: 10 minutes to 29 days ahead; 3–90 seconds; 9:16; at least
//   540 x 960; MP4 recommended.
// - Instagram Reels: no API scheduling; 3 seconds to 15 minutes; at most
//   1920 pixels wide; at most 300 MB; caption at most 2200 characters,
//   30 hashtags and 20 @ tags. H.264 or HEVC, which Drive can't tell us.

import type { Post, Queue } from '../queue/read.ts';
import type { DriveFile } from '../drive/files.ts';
import { londonToUtc, ukLabel } from '../time/london.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Facebook refuses a scheduled time closer than this. */
export const FACEBOOK_MIN_AHEAD = 10 * MINUTE;
/** How far ahead Facebook takes each kind of post, less an hour so a run at the edge isn't refused. */
export const FACEBOOK_MAX_AHEAD = { link: 75 * DAY - 60 * MINUTE, reel: 29 * DAY - 60 * MINUTE };
/** Instagram is posted at the time. Later than this, the post is reported as missed rather than posted. */
export const INSTAGRAM_LATE_LIMIT = 60 * MINUTE;

export type Step = { what: string; text: string; problem?: true };
export type PostPlan = { id: string; label: string; steps: Step[] };

function facebookStep(p: Post, when: Date, now: Date): Step & { now?: true } {
  const entry = p.facebook!;
  const ahead = when.getTime() - now.getTime();
  const what = `facebook ${entry.type}`;
  if (ahead < FACEBOOK_MIN_AHEAD) {
    return { what, text: 'too late to schedule: it was due within 10 minutes or has passed', problem: true };
  }
  const max = FACEBOOK_MAX_AHEAD[entry.type];
  if (ahead > max) return { what, text: `window opens ${ukLabel(new Date(when.getTime() - max))}` };
  if (entry.type === 'link') {
    const last = entry.caption.trimEnd().split('\n').at(-1) ?? '';
    if (!/^https:\/\/\S+$/.test(last)) return { what, text: 'the caption does not end with the link it posts', problem: true };
    return { what, text: `would schedule a link post for ${ukLabel(when)} (message ${entry.caption.trimEnd().length} characters, link on its last line)`, now: true };
  }
  return { what, text: `would upload the video and schedule the Reel for ${ukLabel(when)} (description ${entry.caption.trimEnd().length} characters)`, now: true };
}

function instagramStep(p: Post, when: Date, now: Date): Step & { now?: true } {
  const caption = p.instagram!.caption.trimEnd();
  const what = 'instagram reel';
  const hashtags = (caption.match(/#\w+/g) ?? []).length;
  const mentions = (caption.match(/@\w+/g) ?? []).length;
  if (caption.length > 2200 || hashtags > 30 || mentions > 20) {
    return { what, text: `caption over Instagram's limits: ${caption.length} characters, ${hashtags} hashtags, ${mentions} @ tags`, problem: true };
  }
  const late = now.getTime() - when.getTime();
  if (late < 0) return { what, text: `would publish at ${ukLabel(when)}, on the first run from then (caption ${caption.length} characters, ${hashtags} hashtags)` };
  if (late <= INSTAGRAM_LATE_LIMIT) return { what, text: `would publish now (caption ${caption.length} characters, ${hashtags} hashtags)`, now: true };
  return { what, text: `missed: due ${ukLabel(when)}, more than an hour ago, so not posted`, problem: true };
}

function videoProblems(file: DriveFile, instagram: boolean): string[] {
  const out: string[] = [];
  if (file.mimeType !== 'video/mp4') out.push(`is ${file.mimeType}, not MP4`);
  const size = Number(file.size ?? 0);
  if (instagram && size > 300 * 1024 * 1024) out.push(`is ${(size / 1024 / 1024).toFixed(0)} MB, over Instagram's 300`);
  const v = file.videoMediaMetadata;
  if (!v?.width || !v.height || !v.durationMillis) return [...out, "has no video details yet: Drive may still be processing it"];
  const seconds = Number(v.durationMillis) / 1000;
  if (Math.abs(v.width / v.height - 9 / 16) > 0.01) out.push(`is ${v.width} x ${v.height}, not 9:16`);
  if (v.width < 540 || v.height < 960) out.push(`is ${v.width} x ${v.height}, under Facebook's 540 x 960`);
  if (v.width > 1920) out.push(`is ${v.width} pixels wide, over Instagram's 1920`);
  if (seconds < 3 || seconds > 90) out.push(`runs ${seconds.toFixed(1)} s, outside Facebook's 3–90`);
  return out;
}

function videoStep(p: Post, files: DriveFile[], acting: boolean): Step {
  const file = files.find((f) => f.name === p.file);
  if (!file) {
    // A video uploaded later is normal; one missing when it's needed is not.
    return acting ? { what: 'video', text: `${p.file} is not in Drive`, problem: true } : { what: 'video', text: `${p.file} is not in Drive yet` };
  }
  const problems = videoProblems(file, Boolean(p.instagram));
  if (problems.length) return { what: 'video', text: `${p.file} ${problems.join('; ')}`, problem: true };
  const v = file.videoMediaMetadata!;
  const mb = (Number(file.size ?? 0) / 1024 / 1024).toFixed(1);
  return { what: 'video', text: `${p.file}: ${v.width} x ${v.height}, ${(Number(v.durationMillis) / 1000).toFixed(1)} s, ${mb} MB` };
}

export function plan(queue: Queue, files: DriveFile[], now: Date): PostPlan[] {
  return queue.posts.map((p) => {
    let when: Date;
    try {
      when = londonToUtc(p.at);
    } catch (error) {
      return { id: p.id, label: p.at, steps: [{ what: 'time', text: (error as Error).message, problem: true }] };
    }
    const steps = [p.facebook && facebookStep(p, when, now), p.instagram && instagramStep(p, when, now)].filter((s) => !!s);
    if (p.file) steps.unshift(videoStep(p, files, steps.some((s) => s.now)));
    return { id: p.id, label: ukLabel(when), steps: steps.map(({ what, text, problem }) => ({ what, text, ...(problem && { problem }) })) };
  });
}
