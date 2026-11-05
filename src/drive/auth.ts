// Signs in as the Drive service account with its JSON key: a JWT signed with
// the key's private key, swapped for a short-lived access token. Read-only
// scope. Neither the key nor the token is ever printed.

import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

export async function driveToken(): Promise<string> {
  const raw = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GDRIVE_SERVICE_ACCOUNT_KEY is not set');
  let key: { client_email?: string; private_key?: string };
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error('GDRIVE_SERVICE_ACCOUNT_KEY is not JSON: paste the whole key file');
  }
  if (!key.client_email || !key.private_key) throw new Error('GDRIVE_SERVICE_ACCOUNT_KEY has no client_email or private_key');

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 600 }),
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${base64url(signature)}`,
  });
  const response = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(`service account sign-in failed: HTTP ${response.status} ${json.error ?? ''}`.trim());
  }
  return json.access_token;
}

export function serviceAccountEmail(): string {
  try {
    return JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_KEY ?? '{}').client_email ?? '?';
  } catch {
    return '?';
  }
}
