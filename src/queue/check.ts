// Read-only: reads the queue from sole-accounts and lists every post with its
// platforms, then checks each video the queue names is in the Drive folder.
// Fails only when the queue or the folder can't be read; a missing video is
// reported, because uploading them is a step of its own. Posts nothing.

import { readQueue } from './read.ts';
import { folderFiles } from '../drive/files.ts';

const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) throw new Error('GDRIVE_FOLDER_ID is not set');

const queue = await readQueue();
const files = new Set((await folderFiles(folderId)).map((f) => f.name));

let missing = 0;
for (const p of queue.posts) {
  const platforms = (['facebook', 'instagram'] as const).filter((name) => p[name]).map((name) => `${name} ${p[name]!.type}`);
  const video = p.file ? (files.has(p.file) ? `video ok` : `VIDEO MISSING: ${p.file}`) : 'no video';
  if (p.file && !files.has(p.file)) missing += 1;
  console.log(`${p.id}  ${p.at} UK  ${platforms.join(', ')}  ${video}`);
}
console.log(`ok: read ${queue.posts.length} post(s) from the queue; ${missing} video(s) not yet in Drive`);
