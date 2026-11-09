// GET and POST against Meta's Graph API with the Page token. The token travels in the
// Authorization header, never in the URL, so it can't end up in a logged URL;
// on failure only Meta's error code and message are printed.

export const GRAPH_VERSION = 'v27.0';

export function pageToken(): string {
  const value = process.env.META_PAGE_TOKEN;
  if (!value) throw new Error('META_PAGE_TOKEN is not set');
  return value;
}

export function graphGet<T>(path: string): Promise<T> {
  return graph<T>('GET', path);
}

/** A POST with a JSON body. Only Meta's error is printed, never the body. */
export function graphPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return graph<T>('POST', path, body);
}

async function graph<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${pageToken()}`, ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as T & { error?: { code?: number; type?: string; message?: string } };
  if (!response.ok || json.error) {
    const e = json.error ?? {};
    // Code 190 is an invalid or expired token: make a new Page token (docs/setup/meta.md).
    throw new Error(`${method} ${path.split('?')[0]} failed: HTTP ${response.status} ${e.type ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.trim());
  }
  return json;
}

/**
 * Sends a video's bytes to the upload URL Meta returned from the start phase.
 * The token goes only to rupload.facebook.com: any other host is refused
 * before a request is made.
 */
export async function reelUpload(uploadUrl: string, bytes: Uint8Array): Promise<void> {
  const url = new URL(uploadUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'rupload.facebook.com') {
    throw new Error(`refusing to upload to ${url.hostname}: not rupload.facebook.com`);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${pageToken()}`, offset: '0', file_size: String(bytes.length) },
    body: bytes,
  });
  const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { code?: number; type?: string; message?: string } };
  if (!response.ok || json.error || json.success !== true) {
    const e = json.error ?? {};
    throw new Error(`video upload failed: HTTP ${response.status} ${e.type ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.trim());
  }
}
