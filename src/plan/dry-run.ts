// Read-only: reads the queue and the Drive folder and prints what the poster
// would do now with each post. Posts nothing and calls no Meta API.
//
// Captions are not printed: this repository is public, so its Actions logs
// are too, and a post is not public until it goes out. Lengths are printed.
//
// DRY_RUN_NOW (an ISO time, optional) asks "what would it do at that moment".
// Fails if any post has a problem: a missed time, a missing or unsuitable
// video when it's needed, or a caption over a limit.

import { readQueue } from '../queue/read.ts';
import { folderFiles } from '../drive/files.ts';
import { plan } from './plan.ts';
import { ukLabel } from '../time/london.ts';

const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) throw new Error('GDRIVE_FOLDER_ID is not set');
const asOf = process.env.DRY_RUN_NOW?.trim();
const now = asOf ? new Date(asOf) : new Date();
if (Number.isNaN(now.getTime())) throw new Error('DRY_RUN_NOW is not a time');

const [queue, files] = await Promise.all([readQueue(), folderFiles(folderId)]);
const plans = plan(queue, files, now);

console.log(`dry run as at ${ukLabel(now)}${asOf ? ' (DRY_RUN_NOW)' : ''}: nothing is posted\n`);
let problems = 0;
for (const p of plans) {
  console.log(`${p.id}  ${p.label}`);
  for (const s of p.steps) {
    if (s.problem) problems += 1;
    console.log(`  ${s.problem ? 'PROBLEM ' : ''}${s.what}: ${s.text}`);
  }
}
console.log('\nnot checked yet: whether a post is already scheduled or posted. The record that prevents a second post comes with the live step.');
console.log(problems ? `\nfailed: ${problems} problem(s)` : `\nok: ${plans.length} post(s), no problems`);
if (problems) process.exitCode = 1;
