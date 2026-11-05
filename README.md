# social-media-poster

Posts scheduled content from a Markdown queue to **YouTube, Facebook, Instagram and LinkedIn** through each platform's API.

**Status: dry run.** The poster reads its queue and its videos and prints what it would do with each post; it posts nothing yet. The plan and the platform research are tracked in a private repository.

## Running it

All workflows are run by hand from the Actions tab and post nothing.

| Workflow | What it proves |
|---|---|
| YouTube check | The refresh token belongs to the expected channel |
| Meta check | The Page token reaches the expected page and Instagram account |
| Drive check | The service account can read the video folder |
| Queue check | The queue can be read, and which videos are in Drive |
| **Dry run** | For every post: whether its window is open, whether its video suits the platforms, and what would be sent. **as_of** asks what it would do at another time |

`npm test` runs the planner's tests locally; they need no secrets.

## How it will work

1. **A queue is the source.** Each post has a platform, a time (UK), a media file and a caption. The queue lives in a separate repository and is read with a read-only token, so nothing about a particular brand's posts is in this code.
2. **Each platform's own scheduler is used where it has one.** YouTube (`publishAt`) and Facebook (`scheduled_publish_time`) are handed posts days ahead. Platforms without API scheduling are posted at the time.
3. **Every post is recorded** (platform id, URL, time), so a re-run never posts twice.
4. **Dry-run first:** each platform prints what it would post before it posts anything.

## Rules

- **No media files in git.** They come from storage the job can read. `.gitignore` refuses the usual video and image formats.
- **No secrets in the tree or in logs.** Tokens are GitHub Actions secrets. No workflow runs code from a fork with secrets (no `pull_request_target`), and no raw API request or response carrying a token is logged.
- **Check each platform's current API docs before building against it.** APIs, scopes and limits change.

## Setup

- [YouTube](docs/setup/youtube.md): Google Cloud project, OAuth client, refresh token, and the check that proves them.
- [Facebook and Instagram](docs/setup/meta.md): Meta developer app, published, and a Page token that never expires.

## Licence

[MIT](LICENSE)
