// Which of the queue's Facebook Reels to schedule now. Pure, so the rules that
// stop a second Reel can be tested without a network.
//
// FACEBOOK IS THE RECORD, as for link posts (links.ts). A Reel is already done
// when the Page holds a scheduled Reel for the same minute, or a scheduled or
// published Reel whose description starts with the same line: the first
// covers a re-run of this job, the second a Reel somebody scheduled by hand
// in the Planner at another time.

import type { Queue } from '../queue/read.ts';
import type { DriveFile } from '../drive/files.ts';
import { facebookWindow, videoProblems } from '../plan/plan.ts';
import { londonToUtc } from '../time/london.ts';

/** A Reel on the Page's video_reels edge, as Graph returns it with fields=id,description,status. */
export type PageReel = {
  id: string;
  description?: string;
  status?: {
    video_status?: string;
    processing_phase?: { status?: string };
    publishing_phase?: { publish_status?: string; publish_time?: number | string };
  };
};

export type ReelAction =
  | { id: string; when: Date; kind: 'schedule'; description: string; file: DriveFile }
  | { id: string; when: Date; kind: 'already'; reelId: string; why: 'same time' | 'same first line' }
  | { id: string; when: Date; kind: 'wait'; opens: Date }
  | { id: string; kind: 'problem'; why: string };

/** Graph gives publish_time as Unix seconds, a number or a numeric string. */
export function publishMs(r: PageReel): number | null {
  const v = r.status?.publishing_phase?.publish_time;
  if (v === undefined || v === null || v === '') return null;
  const seconds = Number(v);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export const publishStatus = (r: PageReel) => r.status?.publishing_phase?.publish_status;

const firstLine = (text: string) => text.trim().split('\n')[0]!.trim();

export function reelActions(queue: Queue, reels: PageReel[], files: DriveFile[], now: Date): ReelAction[] {
  const scheduled = reels.filter((r) => publishStatus(r) === 'scheduled');
  const live = reels.filter((r) => publishStatus(r) === 'scheduled' || publishStatus(r) === 'published');
  return queue.posts
    .filter((p) => p.facebook?.type === 'reel')
    .map((p): ReelAction => {
      let when: Date;
      try {
        when = londonToUtc(p.at);
      } catch (error) {
        return { id: p.id, kind: 'problem', why: (error as Error).message };
      }
      const description = p.facebook!.caption.trimEnd();
      if (!description.trim()) return { id: p.id, kind: 'problem', why: 'the Reel has no caption' };
      const sameTime = scheduled.find((r) => Math.abs((publishMs(r) ?? -Infinity) - when.getTime()) < 60_000);
      if (sameTime) return { id: p.id, when, kind: 'already', reelId: sameTime.id, why: 'same time' };
      const line = firstLine(description);
      const sameLine = live.find((r) => r.description && firstLine(r.description) === line);
      if (sameLine) return { id: p.id, when, kind: 'already', reelId: sameLine.id, why: 'same first line' };
      const window = facebookWindow('reel', when, now);
      if (window === 'too-late') return { id: p.id, kind: 'problem', why: 'too late to schedule: due within 10 minutes or past' };
      if (window !== 'open') return { id: p.id, when, kind: 'wait', opens: window };
      if (!p.file) return { id: p.id, kind: 'problem', why: 'the Reel names no video file' };
      const file = files.find((f) => f.name === p.file);
      if (!file) return { id: p.id, kind: 'problem', why: `${p.file} is not in Drive` };
      const problems = videoProblems(file, Boolean(p.instagram));
      if (problems.length) return { id: p.id, kind: 'problem', why: `${p.file} ${problems.join('; ')}` };
      return { id: p.id, when, kind: 'schedule', description, file };
    });
}
