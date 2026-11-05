# Meta setup (Facebook and Instagram)

How the poster gets permission to publish to a Facebook page and the Instagram account linked to it: a Meta developer app, published (Live), and one Page access token stored as a GitHub secret. First done on **4–5 November 2026** for the Tuppin page and @tuppinuk, mostly on a phone; the token steps need a computer.

Meta renames these screens often. The steps below are as they looked on those days.

## What you end up with

| | Where | What it is |
|---|---|---|
| `META_PAGE_TOKEN` | GitHub secret | A Page access token that **never expires**, for one page and its Instagram account |
| `META_PAGE_ID` | `.github/workflows/meta-check.yml` | The Facebook page's id (not secret) |
| `INSTAGRAM_ACCOUNT_ID` | the same file | The Instagram business account's id (not secret) |

The **Meta check** workflow (Actions tab, run by hand) proves the token reaches that page and that Instagram account, and that Instagram permits API publishing. It posts nothing.

**The token is a powerful credential.** It includes `business_management`, which Meta lists as required for Instagram through Facebook login. That lets it manage the whole business portfolio, short of deleting it. It lives only as the GitHub secret: never in a file, an issue, a chat or a screenshot.

## Before you start

- **Use the personal Facebook account that is admin of the page.** Accounts Center → your account shows it under "Pages you manage".
- **The Instagram account must be a professional account linked to the page.** The API reaches it through the page, not through Accounts Center, where it may not appear at all.

## 1. Developer account

1. Go to [developers.facebook.com](https://developers.facebook.com), press **Get Started** and log in.
2. **Phone verification:** if Meta says the number must be added "through Accounts Center first", add it there under Contact info, then come back.
   - On 4 November the web page kept answering "temporary error sending your confirmation text". Adding the number **in the Facebook app** (Settings → Accounts Center → Personal details → Contact info) worked.
   - Don't retry the web page repeatedly: each attempt seems to lengthen the block.
3. Accept the terms and pick a role (any; it changes nothing), then **Complete Registration**.

## 2. Create the app

1. **My Apps → Create app.** App name: ours is `Tuppin Publisher`; it may not contain "Facebook", "Meta" or "Insta". Contact email.
2. **Use cases** (the filter **Content management** narrows the list). Tick both:
   - **Manage everything on your Page**
   - **Manage messaging & content on Instagram**
3. **Business portfolio:** choose the page's business (ours shows "Tuppin, Unverified business"). An unverified portfolio is fine here.
4. **Requirements:** Meta showed "No requirements identified". **Overview → Create app.**
5. **Ignore "Become a Tech Provider"** on the dashboard. That's for apps acting for other businesses, and it brings App Review.

## 3. Permissions

1. **Dashboard → Customize the Manage everything on your Page use case.** These should be **Ready for testing**: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, plus `business_management` and `public_profile`, which Meta adds itself. Leave everything else on **+ Add**.
2. **Customize the Manage messaging & content on Instagram use case.**
   - It opens on **"API setup with Unified login"**. **Don't use it.** It needs a system-user token, with business verification and App Review, and asks for ads and messaging permissions we don't need. "API setup with Instagram login" is no longer offered to new apps.
   - Choose **"API setup with Facebook login"** in the left menu. Meta labels it **legacy**: it "still works", but new features go to Unified login only. We chose it anyway (see below).
   - Press **Add required content permissions** (`instagram_basic`, `instagram_content_publish`, and the three Page ones). **Not** "Add required messaging permissions".

## 4. Settings and publishing

1. **App settings → Basic** (the gear icon; on a phone the side menu shows icons only):
   - Privacy policy URL, Terms of Service URL, and **User data deletion → Data deletion instructions URL** (ours: the privacy policy);
   - **App domains** (ours: `tuppin.uk`) and **Category** (Business and pages);
   - leave the App icon and the **Data Protection Officer** section empty: whatever goes there is shown publicly;
   - **Save Changes**. Don't touch the App secret.
2. **Publish** (the arrow out of a tray). Once it says "All required app settings are complete", press **Publish** at the bottom right. The badge turns **Published**.
   - **This step matters.** While an app is in Development mode, its posts are visible only to people with a role on the app.
   - Publishing doesn't change the access level. **Standard Access** covers an app used only by people with a role on it, for their own page and Instagram account, with no App Review.

## 5. The Page token (on a computer)

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer): **Meta App** = the app, **User or Page** = **Get User Access Token**. Under **Add a Permission**:
   - **Events Groups Pages:** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`;
   - **Other:** `instagram_basic`, `instagram_content_publish`.
2. **Generate Access Token.** In the dialog choose **"Opt in to current Pages only"** (not "all current and future Pages"), and the same for businesses and Instagram accounts. Tick only the page, its business and its Instagram account. The review screen should read "1 Business, 1 Instagram account, 1 Page". **Save**.
3. **From here, don't share screenshots: every screen shows a token.**
4. [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken): paste the token, **Debug**, then **Extend Access Token** at the bottom. The new token says it expires in about 60 days. That's expected: it's only used for the next step.
5. Back in the Explorer, put the **extended** token in the Access Token box. Request:
   ```
   me/accounts?fields=name,id,access_token,instagram_business_account
   ```
   The page's entry has its `id`, its `access_token` (the **Page token**) and `instagram_business_account.id`. If `instagram_business_account` is missing, the Instagram account isn't linked to the page: fix that in Meta Business Suite first.
6. Debug the **Page token**: it should say **Type: Page** and **Expires: Never**.
7. This repository → **Settings → Secrets and variables → Actions → New repository secret**: name `META_PAGE_TOKEN`, value the Page token. Put the two ids in `.github/workflows/meta-check.yml`.
8. **Actions → Meta check → Run workflow.** Expect:
   ```
   page: Tuppin (1415216855004334)
   instagram: @tuppinuk (17841460482864126)
   instagram publishing: 0 of 100 API posts used in the last 24 hours
   ok: the token reaches the expected page and Instagram account
   ```

## When it breaks

| Symptom | Meaning | Fix |
|---|---|---|
| `OAuthException 190` | The token is invalid: revoked, the password changed, the app removed, or the admin lost their role on the page | Repeat step 5 and replace `META_PAGE_TOKEN` |
| `the token belongs to page …, expected …` | The token is another page's | Repeat step 5, ticking only the right page |
| `the page is linked to Instagram nothing` | The Instagram account was unlinked from the page | Relink it in Meta Business Suite |
| The publishing-limit call fails with a permission error | `instagram_content_publish` wasn't granted | Repeat step 5 with all six permissions |
| Posts publish but nobody else sees them | The app slipped back to Development mode | Publish it again (step 4) |

**To revoke access:** Facebook → Settings → **Business integrations**, remove the app. Every token it issued stops working. Then repeat step 5.

## Decisions (5 November 2026)

- **Facebook login, not Unified login, for Instagram.** Unified login is Meta's recommended route and the only one getting new features. But it needs system users, business verification and App Review, which is weeks of waiting. Facebook login works today, with no review, and shares one token with Facebook. If Meta retires it, expect notice in the Graph API changelog; moving means a new token, not a new poster.
- **API version v27.0**, the Explorer's current version on 5 November 2026. Pinned in `src/meta/graph.ts`.
- **Only the current page, business and account** are granted, never "all current and future".
