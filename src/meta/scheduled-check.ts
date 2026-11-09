// Read-only: where, if anywhere, does the Graph API show a Reel scheduled by
// hand in Meta's Planner? The Facebook Reels job's duplicate check read
// /{page}/video_reels and saw none of the five scheduled there (9 November
// 2026), so this asks each edge that might hold them and prints, for every
// item, only its id's last digits, its state and its time. No caption,
// description or message is printed: this repository's logs are public.
//
// An edge that refuses is printed and the rest still run: a refusal is part
// of the answer.

import { graphGet } from './graph.ts';
import { ukLabel } from '../time/london.ts';

const pageId = process.env.META_PAGE_ID;
if (!pageId || !/^\d+$/.test(pageId)) throw new Error('META_PAGE_ID is not set to a page id');

type Item = Record<string, unknown> & { id: string };
type Row = { id: string; state: string; at: number | null };

const tail = (id: string) => `…${id.slice(-6)}`;
const seconds = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  const parsed = Date.parse(String(v));
  return Number.isNaN(parsed) ? null : parsed;
};
const pick = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);

async function all(path: string): Promise<Item[]> {
  const out: Item[] = [];
  let after = '';
  for (let page = 0; page < 5; page += 1) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
    const r = await graphGet<{ data: Item[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${path}&limit=100${cursor}`);
    out.push(...r.data);
    if (!r.paging?.next || !r.paging.cursors?.after) break;
    after = r.paging.cursors.after;
  }
  return out;
}

const edges: { name: string; path: string; row: (i: Item) => Row }[] = [
  {
    name: 'video_reels',
    path: `${pageId}/video_reels?fields=id,status`,
    row: (i) => ({
      id: i.id,
      state: `video ${pick(i, 'status', 'video_status') ?? '?'}, publish ${pick(i, 'status', 'publishing_phase', 'publish_status') ?? '?'}`,
      at: seconds(pick(i, 'status', 'publishing_phase', 'publish_time')),
    }),
  },
  {
    name: 'videos',
    path: `${pageId}/videos?fields=id,published,scheduled_publish_time,created_time,status`,
    row: (i) => ({
      id: i.id,
      state: `published ${String(i.published ?? '?')}, publish ${pick(i, 'status', 'publishing_phase', 'publish_status') ?? '?'}`,
      at: seconds(i.scheduled_publish_time) ?? seconds(pick(i, 'status', 'publishing_phase', 'publish_time')),
    }),
  },
  {
    name: 'videos (type=uploaded)',
    path: `${pageId}/videos?type=uploaded&fields=id,published,scheduled_publish_time,status`,
    row: (i) => ({
      id: i.id,
      state: `published ${String(i.published ?? '?')}, publish ${pick(i, 'status', 'publishing_phase', 'publish_status') ?? '?'}`,
      at: seconds(i.scheduled_publish_time) ?? seconds(pick(i, 'status', 'publishing_phase', 'publish_time')),
    }),
  },
  {
    name: 'scheduled_posts',
    path: `${pageId}/scheduled_posts?fields=id,scheduled_publish_time,attachments{media_type,type}`,
    row: (i) => ({
      id: i.id,
      state: `attachment ${pick(i, 'attachments', 'data', '0', 'media_type') ?? pick(i, 'attachments', 'data', '0', 'type') ?? 'none'}`,
      at: seconds(i.scheduled_publish_time),
    }),
  },
  {
    name: 'promotable_posts (is_published=false)',
    path: `${pageId}/promotable_posts?is_published=false&fields=id,scheduled_publish_time,is_published`,
    row: (i) => ({ id: i.id, state: `is_published ${String(i.is_published ?? '?')}`, at: seconds(i.scheduled_publish_time) }),
  },
];

const now = Date.now();
console.log(`scheduled check as at ${ukLabel(new Date(now))}: reads only, prints no captions\n`);
for (const e of edges) {
  try {
    const rows = (await all(e.path)).map(e.row);
    const future = rows.filter((r) => r.at !== null && r.at > now).length;
    console.log(`${e.name}: ${rows.length} item(s), ${future} with a time still to come`);
    for (const r of rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 25)) {
      console.log(`  ${tail(r.id)}  ${r.at ? ukLabel(new Date(r.at)) : 'no time'}${r.at && r.at > now ? ' (future)' : ''}  ${r.state}`);
    }
  } catch (error) {
    console.log(`${e.name}: refused: ${(error as Error).message.replace(/^GET \S+ failed: /, '')}`);
  }
  console.log('');
}
