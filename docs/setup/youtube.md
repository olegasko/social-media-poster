# YouTube setup

How the poster gets permission to upload to a YouTube channel: a Google Cloud project, an OAuth client, and one refresh token stored as a GitHub secret. First done on **4 November 2026** for the Tuppin brand channel, in about an hour, mostly on a phone. It needs no billing and no tools installed.

Google renames these screens often. The steps below are as they looked on that day.

## What you end up with

| Secret | What it is |
|---|---|
| `YOUTUBE_CLIENT_ID` | The OAuth client's ID |
| `YOUTUBE_CLIENT_SECRET` | The OAuth client's secret |
| `YOUTUBE_REFRESH_TOKEN` | A long-lived token for one channel, swapped for a short-lived access token on every run |

The **YouTube check** workflow (Actions tab, run by hand) proves the three work and belong to the expected channel. It uploads nothing.

## Before you start

- **Sign in with the Google account that manages the channel.** For a brand channel, that's the personal account it's managed from. Check the profile picture in the top right before each step.
- **Use a computer for step 4 if you can.** Steps 1–3 work on a phone; the OAuth Playground in step 4 is fiddly on one.
- **Ignore a "free trial is over" banner and don't press Upgrade.** The YouTube Data API needs no billing account.

## 1. Project and API

1. [console.cloud.google.com](https://console.cloud.google.com): open the project picker and choose **New project**. Choose a name (ours is `tuppin-social-poster`) and set the location to **No organisation**. Create it, then **select it**: the picker must show its name before you go on. Don't reuse an old default project like "My First Project".
2. Search for **YouTube Data API v3**, open the result marked API (not Analytics or Reporting), and press **Enable**. The status then reads "Enabled".
3. **Don't press "Create credentials"** on that page. That wizard steers towards an API key, which can't upload.

## 2. Consent screen ("Google Auth Platform")

1. Search for **Google Auth Platform** and press **Get started**. Fill in the app name (ours is `Tuppin Publisher`), a support email, Audience **External** and a contact email, then press **Create**.
2. **Branding**: fill in the home page, privacy policy and terms of service links, add the site's domain under **Authorised domains**, and fill in the developer contact. **Leave the logo empty**: a logo makes Google ask for brand verification.
   - Without these, **Publish app** stays greyed out ("you must complete your configuration on the Branding page").
3. **Audience → Publish app → Confirm.** The status must read **In production**.
   - **This is the step that matters.** An app left in "Testing" gets refresh tokens that **expire after 7 days**, and the job would then stop with no warning.
   - The dialog says the app is "available to any user with a Google Account" and that sensitive scopes need verification. Both are fine. Nobody else has a reason to sign in, and if they did they could only reach their own channel. Verification is optional under 100 users.
4. **Data Access → Add or remove scopes.** Ignore the list. Under **Manually add scopes**, paste both scopes, then press **Add to table → Update → Save**:
   ```
   https://www.googleapis.com/auth/youtube.upload
   https://www.googleapis.com/auth/youtube
   ```
   Leave every other scope unticked. Both rows show a lock and a red ⚠ ("Approval required").
5. Google then shows **"Verification required"**. Press **Continue**. Leave the demo-video link and the justification empty, and **don't submit for verification**. The cost of not doing so is the "Google hasn't verified this app" screen, once, when the token is made in step 4, and a lifetime cap of 100 users.

## 3. OAuth client

1. **Clients → Create client**, type **Web application**, any name (ours is `poster`).
2. **Authorised redirect URIs → Add URI:** `https://developers.google.com/oauthplayground`, exactly that, with no trailing slash. Leave JavaScript origins empty, and leave **"Use this client for an AI-powered agent" unticked**.
3. Press **Create**, then **Download JSON** before closing the dialog. **The secret is shown only once.** Keep the file outside any repository.
   - Google notes that settings can take 5 minutes to a few hours to apply. A `redirect_uri_mismatch` in step 4 straight after this means wait, not redo.

## 4. Refresh token (OAuth Playground)

1. Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground). Click the **gear icon**, tick **Use your own OAuth credentials**, and paste the client ID and secret. Leave the flow as Server-side and access type as Offline.
   - Without your own credentials, the Playground revokes the refresh token after 24 hours.
2. Under **Input your own scopes**, paste both scope URLs separated by a space, then press **Authorize APIs**.
3. **Two account screens follow.** The first asks for a Google **account**: choose the one that manages the channel. The second asks for a **channel or brand account**: choose the brand channel, **not** the personal one.
   - The next screen names the chosen account under its heading. For us it said "Tuppin".
   - If the second screen never appears, stop: the token would belong to whichever channel is the default.
4. **"Google hasn't verified this app"** is expected. Choose **Advanced → Go to (app name)**, tick **Select all** so both YouTube permissions are granted, then press **Continue**.
5. Back in the Playground, press **Exchange authorization code for tokens**. Copy the **Refresh token**.
   - **Don't share screenshots from here on.** The Playground prints the access token (`Authorization: Bearer ya29…`) in the request it shows. It expires within an hour, but it's a live credential until then. The refresh token is permanent.
6. **Optional check, in the Playground:** Step 3, GET `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`. The response's `title`, `customUrl` and `id` should be the brand channel's, with `totalResults: 1`.

## 5. Secrets and the check

1. This repository → **Settings → Secrets and variables → Actions → New repository secret**, once for each of the three secrets above. Never put the values in a file, an issue or a chat.
2. Close the Playground tab and delete the downloaded JSON. Google can issue a new secret if one is ever needed.
3. **Actions → YouTube check → Run workflow.** Expect:
   ```
   channel: Tuppin @tuppinuk (UCM5CkEQSp4ZGycOq7d_MScw)
   ok: the token belongs to the expected channel
   ```
   The expected channel ID is set in `.github/workflows/youtube-check.yml`.

## When it breaks

| Symptom | Meaning | Fix |
|---|---|---|
| `token refresh failed: HTTP 400 invalid_grant` | The refresh token was revoked, or the app was in Testing and it expired | Check Audience says In production, then repeat step 4 and replace `YOUTUBE_REFRESH_TOKEN` |
| `HTTP 401 invalid_client` | The client ID or secret is wrong, or the client was deleted | Check both secrets; create a new client (step 3) if needed |
| `expected exactly one channel` | The token belongs to the wrong channel | Repeat step 4, choosing the brand channel on the second account screen |
| `redirect_uri_mismatch` in the Playground | The redirect URI isn't saved yet, or has a typo or trailing slash | Wait up to a few hours; check the URI in the client |

**To revoke access:** [myaccount.google.com/permissions](https://myaccount.google.com/permissions), signed in to the account that manages the channel, then remove the app. Every token it issued stops working. Then repeat step 4.

## What we checked against (4 November 2026)

- **Unverified API projects are no longer limited to private uploads.** That rule had applied since 28 July 2020 and was reversed on 2 November 2026 ([revision history](https://developers.google.com/youtube/v3/revision_history)), so no audit is needed at the default quota.
- **Shorts thumbnails can be set through `thumbnails.set` since 3 November 2026**, but only after processing finishes (same page).
- **Default quota:** 100 `videos.insert` calls a day in their own bucket, plus 10,000 units for everything else ([quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)).
- **Service accounts can't upload to a channel** ([moving to OAuth](https://developers.google.com/youtube/v3/guides/moving_to_oauth)).
- **A "Testing" app's refresh tokens expire after 7 days** ([OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)).
- **`publishAt` needs `privacyStatus: private`** on a video never published, and an upload with no privacy status set **defaults to public** ([videos resource](https://developers.google.com/youtube/v3/docs/videos)).
