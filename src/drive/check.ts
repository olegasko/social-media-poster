// Read-only: lists what the Drive service account can see. With
// GDRIVE_FOLDER_ID unset, it lists the folders shared with it, so the ID can be
// read off the log; with it set, it lists that folder's files and fails if the
// folder can't be read. Downloads nothing.

import { driveToken, serviceAccountEmail } from './auth.ts';

type File = { id: string; name: string; mimeType: string; size?: string };

const token = await driveToken();
console.log(`signed in as ${serviceAccountEmail()}`);

async function list(q: string): Promise<File[]> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,size)');
  url.searchParams.set('pageSize', '200');
  url.searchParams.set('orderBy', 'name');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await response.json()) as { files?: File[]; error?: { code?: number; message?: string } };
  if (!response.ok) {
    // 403 with "has not been used in project" means the Drive API isn't enabled.
    throw new Error(`files.list failed: HTTP ${response.status} ${json.error?.message ?? ''}`.trim());
  }
  return json.files ?? [];
}

const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) {
  const folders = await list("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  if (folders.length === 0) {
    console.error('FAIL: no folder is shared with this service account yet');
    process.exit(1);
  }
  for (const f of folders) console.log(`folder: ${f.name} (${f.id})`);
  console.log('ok: set GDRIVE_FOLDER_ID in the workflow to the folder above');
} else {
  const files = await list(`'${folderId}' in parents and trashed = false`);
  for (const f of files) {
    const mb = f.size ? ` ${(Number(f.size) / 1_000_000).toFixed(1)} MB` : '';
    console.log(`file: ${f.name}${mb}`);
  }
  console.log(`ok: ${files.length} file(s) readable in the folder`);
}
