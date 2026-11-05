// Read-only: checks that the stored Page token belongs to the expected Facebook
// page, that the page is linked to the expected Instagram account, and that
// Instagram will accept API publishing for it. Posts nothing, changes nothing.

import { graphGet } from './graph.ts';

const pageId = process.env.META_PAGE_ID;
const instagramId = process.env.INSTAGRAM_ACCOUNT_ID;
if (!pageId || !instagramId) throw new Error('META_PAGE_ID and INSTAGRAM_ACCOUNT_ID must be set');

let failed = false;
const fail = (message: string) => {
  console.error(`FAIL: ${message}`);
  failed = true;
};

// With a Page token, "me" is the page itself.
const me = await graphGet<{ id: string; name: string }>('me?fields=id,name');
console.log(`page: ${me.name} (${me.id})`);
if (me.id !== pageId) fail(`the token belongs to page ${me.id}, expected ${pageId}`);

const page = await graphGet<{ instagram_business_account?: { id: string } }>(
  `${pageId}?fields=instagram_business_account`,
);
const linked = page.instagram_business_account?.id;
if (linked !== instagramId) fail(`the page is linked to Instagram ${linked ?? 'nothing'}, expected ${instagramId}`);

const ig = await graphGet<{ id: string; username: string }>(`${instagramId}?fields=id,username`);
console.log(`instagram: @${ig.username} (${ig.id})`);

// Needs instagram_content_publish: proves publishing is permitted, without publishing.
const limit = await graphGet<{ data: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
  `${instagramId}/content_publishing_limit?fields=quota_usage,config`,
);
const usage = limit.data[0];
console.log(`instagram publishing: ${usage?.quota_usage ?? '?'} of ${usage?.config?.quota_total ?? '?'} API posts used in the last 24 hours`);

if (failed) process.exit(1);
console.log('ok: the token reaches the expected page and Instagram account');
