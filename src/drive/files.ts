// Lists the files in one Drive folder, as the service account sees them.

import { driveToken } from './auth.ts';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  /** Filled once Drive has processed a video; durationMillis is a string. */
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

export async function listDrive(q: string, token?: string): Promise<DriveFile[]> {
  const bearer = token ?? (await driveToken());
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,size,videoMediaMetadata)');
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

/** A file's bytes, checked against the size Drive lists, so a cut-short download is never uploaded. */
export async function downloadFile(file: DriveFile, token?: string): Promise<Uint8Array> {
  if (!/^[\w-]+$/.test(file.id)) throw new Error('not a Drive file id');
  const bearer = token ?? (await driveToken());
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!response.ok) throw new Error(`downloading ${file.name} failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (file.size !== undefined && bytes.length !== Number(file.size)) {
    throw new Error(`downloading ${file.name} gave ${bytes.length} bytes, not the ${file.size} Drive lists`);
  }
  return bytes;
}
