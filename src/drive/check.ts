// Read-only: lists what the Drive service account can see. With
// GDRIVE_FOLDER_ID unset, it lists the folders shared with it, so the ID can be
// read off the log; with it set, it lists that folder's files and fails if the
// folder can't be read. Downloads nothing.

import { driveToken, serviceAccountEmail } from './auth.ts';
import { folderFiles, listDrive } from './files.ts';

const token = await driveToken();
console.log(`signed in as ${serviceAccountEmail()}`);

const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) {
  const folders = await listDrive("mimeType = 'application/vnd.google-apps.folder' and trashed = false", token);
  if (folders.length === 0) {
    console.error('FAIL: no folder is shared with this service account yet');
    process.exit(1);
  }
  for (const f of folders) console.log(`folder: ${f.name} (${f.id})`);
  console.log('ok: set GDRIVE_FOLDER_ID in the workflow to the folder above');
} else {
  const files = await folderFiles(folderId);
  for (const f of files) {
    const mb = f.size ? ` ${(Number(f.size) / 1_000_000).toFixed(1)} MB` : '';
    console.log(`file: ${f.name}${mb}`);
  }
  console.log(`ok: ${files.length} file(s) readable in the folder`);
}
