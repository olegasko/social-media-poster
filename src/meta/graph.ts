// A GET against Meta's Graph API with the Page token. The token travels in the
// Authorization header, never in the URL, so it can't end up in a logged URL;
// on failure only Meta's error code and message are printed.

export const GRAPH_VERSION = 'v27.0';

export function pageToken(): string {
  const value = process.env.META_PAGE_TOKEN;
  if (!value) throw new Error('META_PAGE_TOKEN is not set');
  return value;
}

export async function graphGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    headers: { Authorization: `Bearer ${pageToken()}` },
  });
  const json = (await response.json()) as T & { error?: { code?: number; type?: string; message?: string } };
  if (!response.ok || json.error) {
    const e = json.error ?? {};
    // Code 190 is an invalid or expired token: make a new Page token (docs/setup/meta.md).
    throw new Error(`GET ${path.split('?')[0]} failed: HTTP ${response.status} ${e.type ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.trim());
  }
  return json;
}
