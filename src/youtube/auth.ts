// Exchanges the stored refresh token for a short-lived access token.
// The token is returned to the caller and never logged: on failure only
// Google's error code is printed, never the request or the response body.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: required('YOUTUBE_CLIENT_ID'),
    client_secret: required('YOUTUBE_CLIENT_SECRET'),
    refresh_token: required('YOUTUBE_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });
  const response = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    // `invalid_grant` means the refresh token was revoked or has expired.
    throw new Error(`token refresh failed: HTTP ${response.status} ${json.error ?? ''}`.trim());
  }
  return json.access_token;
}
