# social-media-poster

Posts scheduled content from a Markdown queue to **YouTube, Facebook, Instagram and LinkedIn** through each platform's API.

**Status: not built yet.** The plan and the platform research are tracked in a private repository; this repository holds the code once it is written.

## How it will work

1. **A queue is the source.** Each post has a platform, a time (UK), a media file and a caption. The queue lives in a separate repository and is read with a read-only token, so nothing about a particular brand's posts is in this code.
2. **Each platform's own scheduler is used where it has one.** YouTube (`publishAt`) and Facebook (`scheduled_publish_time`) are handed posts days ahead. Platforms without API scheduling are posted at the time.
3. **Every post is recorded** (platform id, URL, time), so a re-run never posts twice.
4. **Dry-run first:** each platform prints what it would post before it posts anything.

## Rules

- **No media files in git.** They come from storage the job can read. `.gitignore` refuses the usual video and image formats.
- **No secrets in the tree or in logs.** Tokens are GitHub Actions secrets. No workflow runs code from a fork with secrets (no `pull_request_target`), and no raw API request or response carrying a token is logged.
- **Check each platform's current API docs before building against it.** APIs, scopes and limits change.

## Licence

[MIT](LICENSE)
