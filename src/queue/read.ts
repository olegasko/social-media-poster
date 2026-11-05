// Reads the queue the poster works from: docs/social/facebook-queue.yaml on
// sole-accounts' main branch, through GitHub's API with a read-only token.
// The queue is kept private there (#497); this file never holds a copy.

import { parse } from 'yaml';

export type Entry = { type: 'link' | 'reel'; caption: string };
export type Post = { id: string; at: string; file?: string; facebook?: Entry; instagram?: Entry };
export type Queue = { timezone: string; posts: Post[] };

const SOURCE = 'https://api.github.com/repos/olegasko/sole-accounts/contents/docs/social/facebook-queue.yaml?ref=main';

export async function readQueue(): Promise<Queue> {
  const token = process.env.QUEUE_REPO_TOKEN;
  if (!token) throw new Error('QUEUE_REPO_TOKEN is not set');
  const response = await fetch(SOURCE, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  // 401: the token expired or was revoked. 404: it can't see the repository.
  if (!response.ok) throw new Error(`reading the queue failed: HTTP ${response.status}`);
  const queue = parse(await response.text()) as Queue;
  if (queue?.timezone !== 'Europe/London' || !Array.isArray(queue.posts)) {
    throw new Error('the queue is not in the expected shape');
  }
  return queue;
}
