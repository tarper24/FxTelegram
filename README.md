# FxTelegram

**Fix Telegram link embeds for Discord, Slack, iMessage, and anywhere OpenGraph is used.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Replace `t.me` with `fx-t.me` in any Telegram link and get a rich embed instead of a bare URL preview.

```
https://t.me/channelname/123
        ↓
https://fx-t.me/channelname/123
```

---

## Domains

| Domain | Notes |
|---|---|
| [fxtelegram.org](https://fxtelegram.org) | Primary |
| [fx-t.me](https://fx-t.me) | Short form — swap `t.me` for `fx-t.me` |
| [fxtelegram.me](https://fxtelegram.me) | Alternate |
| [fixupt.me](https://fixupt.me) | Alternate |
| [txlegram.me](https://txlegram.me) | Discord `s/telegram/txlegram` |
| [txlegram.org](https://txlegram.org) | Discord `s/telegram/txlegram` |

---

## What you get

- **Images** — full-resolution preview with correct dimensions
- **Videos** — inline playback directly in Discord (no clicking through)
- **Text posts** — full post text with channel name and author
- **Files** — filename, size, and type for public posts
- **Private channels** — opt-in support: add `@FxTelegramBot` to your channel to enable embeds for your members' shared links

---

## Discord tips

**Quick swap — `fx-t.me`:**  
Change `t.me` to `fx-t.me`. Same length, one letter different, works inline.

```
https://t.me/channelname/123  →  https://fx-t.me/channelname/123
```

**Fix someone else's link — `s/telegram/txlegram`:**  
If a link uses `telegram.me` or `telegram.org`, reply with the Discord edit shorthand and it rewrites the link automatically.

```
s/telegram/txlegram
```

`telegram.me/channelname/123` → `txlegram.me/channelname/123`  
`telegram.org/channelname/123` → `txlegram.org/channelname/123`

---

## How it works

FxTelegram acts as a lightweight proxy between the platform (Discord, Slack, etc.) and Telegram:

1. Platform bot hits `fx-t.me/channelname/123`
2. Worker fetches content from Telegram, extracts media and metadata
3. Returns enriched OpenGraph tags — image, video, title, description
4. Platform renders a rich embed; regular users are sent straight to `t.me`

Built on Cloudflare Workers for fast, globally distributed responses.

---

## Supported link types

| Link | Support |
|---|---|
| `t.me/channelname/123` | Public channel post |

---

## Setup Prerequisites

Before the GitHub Actions workflow can deploy the worker, complete the following one-time steps.

### 1. Create KV namespaces

You need two namespaces: one for production and one for the dev environment.

```bash
# Production namespace
npx wrangler kv namespace create KV

# Dev namespace (must include --env dev so wrangler scopes it correctly)
npx wrangler kv namespace create KV --env dev

# Preview bindings (used by `wrangler dev` — run once for each environment)
npx wrangler kv namespace create KV --preview
npx wrangler kv namespace create KV --env dev --preview
```

Each command prints a block like:

```
{ binding = "KV", id = "abc123..." }
```

### 2. Update `wrangler.toml`

Copy the IDs into `worker/wrangler.toml`, replacing the placeholders:

| Placeholder | Replace with |
|---|---|
| `REPLACE_WITH_KV_ID` | prod `id` from `wrangler kv namespace create KV` |
| `REPLACE_WITH_KV_PREVIEW_ID` | prod `id` from `wrangler kv namespace create KV --preview` |
| `REPLACE_WITH_DEV_KV_ID` | dev `id` from `wrangler kv namespace create KV --env dev` |
| `REPLACE_WITH_DEV_KV_PREVIEW_ID` | dev `id` from `wrangler kv namespace create KV --env dev --preview` |

`wrangler deploy` will fail until real IDs are in place — the placeholders are intentional guards.

### 3. Add GitHub Actions secrets

In your repository go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | An API token with the *Edit Cloudflare Workers* permission template |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (found in the Workers dashboard URL) |

---

## Branch Protection (recommended)

To ensure the CI pipeline is a hard gate before anything lands on `main`:

1. Go to **Settings → Branches → Add rule** for `main`.
2. Enable **Require status checks to pass before merging** and add the `Test & Type-check` check.
3. Enable **Require at least 1 approving review** before merging.
4. Enable **Restrict who can push directly to this branch** (no direct pushes to `main` — everything goes through a PR).

---

## Contributing

Issues and PRs welcome. See the project board for planned work.

---

## License

[MIT](LICENSE)
