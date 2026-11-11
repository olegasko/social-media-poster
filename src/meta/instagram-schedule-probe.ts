// Does Instagram's API take a time to publish at? Meta's content publishing
// docs (read 11 November 2026) show none: a container is created, then
// media_publish posts it at once. Reading cannot prove a field is absent, and
// Graph often ignores a parameter it does not know, so this asks Instagram.
//
// It creates Reel containers and NEVER calls media_publish: nothing is posted,
// no video is uploaded, and Meta expires an unpublished container after 24
// hours. Three containers, each told something different:
//   control      no extra parameter
//   nonsense     a parameter that cannot exist, to see how an unknown one is treated
//   scheduled    scheduled_publish_time, tomorrow
// Then each is read back for the fields a scheduled container would carry.
// If scheduled_publish_time is treated exactly as the nonsense one is, and no
// container holds a time, Instagram has no API scheduling.
//
// Prints ids' last digits, Meta's errors and field names: no caption is sent.

import { graphGet, graphPost } from './graph.ts';

const igId = process.env.INSTAGRAM_ACCOUNT_ID;
if (!igId || !/^\d+$/.test(igId)) throw new Error('INSTAGRAM_ACCOUNT_ID is not set to an account id');

const tail = (id: string) => `…${id.slice(-6)}`;
const tomorrow = Math.floor(Date.now() / 1000) + 86_400;
const base = { media_type: 'REELS', upload_type: 'resumable' };

const cases: { name: string; extra: Record<string, unknown> }[] = [
  { name: 'control', extra: {} },
  { name: 'nonsense', extra: { tuppin_probe_no_such_field: tomorrow } },
  { name: 'scheduled', extra: { scheduled_publish_time: tomorrow } },
];

async function attempt<T>(what: () => Promise<T>): Promise<{ ok: T } | { error: string }> {
  try {
    return { ok: await what() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

console.log(`instagram schedule probe as at ${new Date().toISOString()}: creates containers, publishes nothing\n`);
const created: { name: string; id: string }[] = [];
for (const c of cases) {
  const r = await attempt(() => graphPost<{ id: string }>(`${igId}/media`, { ...base, ...c.extra }));
  if ('error' in r) console.log(`create ${c.name}: refused: ${r.error}`);
  else {
    console.log(`create ${c.name}: container ${tail(r.ok.id)}`);
    created.push({ name: c.name, id: r.ok.id });
  }
}
console.log('');

// A known field first, as the control for reading: a probe that cannot pass cannot fail.
for (const field of ['status_code', 'scheduled_publish_time', 'publish_time', 'is_published']) {
  for (const { name, id } of created) {
    const r = await attempt(() => graphGet<Record<string, unknown>>(`${id}?fields=id,${field}`));
    const said = 'error' in r ? `refused: ${r.error.replace(/GET \S+ failed: /, '')}` : `${JSON.stringify(r.ok[field] ?? null)}`;
    console.log(`read ${field} on ${name}: ${said}`);
  }
}
console.log('\nnothing was published; unpublished containers expire after 24 hours');
