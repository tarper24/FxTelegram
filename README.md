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

---

## What you get

- **Images** — full-resolution preview with correct dimensions
- **Videos** — inline playback directly in Discord (no clicking through)
- **Text posts** — full post text with channel name and author
- **Files** — filename, size, and type for public posts
- **Private channels** — opt-in support: add `@FxTelegramBot` to your channel to enable embeds for your members' shared links

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

## Contributing

Issues and PRs welcome. See the project board for planned work.

---

## License

[MIT](LICENSE)
