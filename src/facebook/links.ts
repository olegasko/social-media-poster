// Which of the queue's Facebook link posts to schedule now. Pure, so the
// rule that stops a second post can be tested without a network.
//
// FACEBOOK IS THE RECORD. A post is already done when the Page has a scheduled
// post for the same minute, or one carrying the same link: the first covers a
// re-run of this job, the second a post somebody scheduled by hand at another
// time. Nothing is stored here that could drift from what Facebook holds.

import type { Queue } from '../queue/read.ts';
import { facebookWindow, linkOf } from '../plan/plan.ts';
import { londonToUtc } from '../time/london.ts';

/** A post on the Page's scheduled_posts edge, as Graph returns it. */
export type Scheduled = { id: string; message?: string; scheduled_publish_time?: number | string };

export type LinkAction =
  | { id: string; when: Date; kind: 'schedule'; message: string; link: string }
  | { id: string; when: Date; kind: 'already'; postId: string; why: 'same time' | 'same link' }
  | { id: string; when: Date; kind: 'wait'; opens: Date }
  | { id: string; kind: 'problem'; why: string };

/** Graph gives scheduled_publish_time in seconds, as a number or a numeric string. */
export function scheduledMs(s: Scheduled): number | null {
  const v = s.scheduled_publish_time;
  if (v === undefined || v === null || v === '') return null;
  const seconds = Number(v);
  return Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(v)) || null;
}

export function linkActions(queue: Queue, scheduled: Scheduled[], now: Date): LinkAction[] {
  return queue.posts
    .filter((p) => p.facebook?.type === 'link')
    .map((p): LinkAction => {
      let when: Date;
      try {
        when = londonToUtc(p.at);
      } catch (error) {
        return { id: p.id, kind: 'problem', why: (error as Error).message };
      }
      const message = p.facebook!.caption.trimEnd();
      const link = linkOf(message);
      if (!link) return { id: p.id, kind: 'problem', why: 'the caption does not end with the link it posts' };
      const sameTime = scheduled.find((s) => Math.abs((scheduledMs(s) ?? -Infinity) - when.getTime()) < 60_000);
      if (sameTime) return { id: p.id, when, kind: 'already', postId: sameTime.id, why: 'same time' };
      const sameLink = scheduled.find((s) => s.message?.includes(link));
      if (sameLink) return { id: p.id, when, kind: 'already', postId: sameLink.id, why: 'same link' };
      const window = facebookWindow('link', when, now);
      if (window === 'too-late') return { id: p.id, kind: 'problem', why: 'too late to schedule: due within 10 minutes or past' };
      if (window !== 'open') return { id: p.id, when, kind: 'wait', opens: window };
      return { id: p.id, when, kind: 'schedule', message, link };
    });
}
