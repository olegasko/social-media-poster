// Lists the files in one Drive folder, as the service account sees them.

import { driveToken } from './auth.ts';

export type DriveFile = { id: string; name: string; mimeType: string; size?: string };

export async function listDrive(q: string, token?: string): Promise<DriveFile[]> {
  const bearer = token ?? (await driveToken());
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,size)');
  url.searchParams.set('pageSize', '200');
  url.searchParams.set('orderBy', 'name');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  const json = (await response.json()) as { files?: DriveFile[]; error?: { message?: string } };
  if (!response.ok) {
    // 403 with "has not been used in project" means the Drive API isn't enabled.
    throw new Error(`files.list failed: HTTP ${response.status} ${json.error?.message ?? ''}`.trim());
  }
  return json.files ?? [];
}

export function folderFiles(folderId: string): Promise<DriveFile[]> {
  if (!/^[\w-]+$/.test(folderId)) throw new Error('GDRIVE_FOLDER_ID is not a Drive id');
  return listDrive(`'${folderId}' in parents and trashed = false`);
}
