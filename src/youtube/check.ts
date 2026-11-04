// Read-only: asks YouTube which channel the stored token belongs to, and fails
// unless it is exactly the one expected. Uploads nothing and changes nothing.
// Run before anything that posts, so a token minted for the wrong channel
// (a personal channel rather than the brand one) is caught first.

import { accessToken } from './auth.ts';

const expected = process.env.YOUTUBE_CHANNEL_ID;
if (!expected) throw new Error('YOUTUBE_CHANNEL_ID is not set');

const token = await accessToken();
const response = await fetch(
  'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!response.ok) throw new Error(`channels.list failed: HTTP ${response.status}`);

const json = (await response.json()) as {
  items?: { id: string; snippet: { title: string; customUrl?: string } }[];
};
const channels = json.items ?? [];
for (const c of channels) console.log(`channel: ${c.snippet.title} ${c.snippet.customUrl ?? ''} (${c.id})`);

if (channels.length !== 1 || channels[0].id !== expected) {
  console.error(`expected exactly one channel, ${expected}; got ${channels.length}`);
  process.exit(1);
}
console.log('ok: the token belongs to the expected channel');
