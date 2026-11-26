# MaloneX

MaloneX is a self-hosted WhatsApp bot built by **Brian Malone** on the standard [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) library. It pairs from a web page, runs 250+ commands through a modular plugin system, and keeps every session's settings, group settings and game state on file storage or Postgres.

MaloneX is an original codebase with its own architecture, branding and reply style (clean professional panels, no emoji decoration in menus). It is not a fork or a re-skin of any existing bot project.

## Requirements

- Node.js 20 or newer
- File storage (default, panel servers) or Postgres (Heroku)
- FFmpeg is bundled automatically through `ffmpeg-static` (used for stickers and audio/video conversion)
- Optional service keys only where listed under [External services](#external-services)

## Setup

```bash
npm install
cp .env.example .env   # optional; defaults work out of the box
npm start
```

Open `http://localhost:3000`, create a session and scan the QR code with WhatsApp, Linked devices. The linked number becomes the bot owner; additional owners can be listed in `OWNER` or granted at runtime with `.setsudo`.

### Storage backends

| Backend | Selected when | Sessions | Settings | Group settings, games, notes, sudo, warnings |
| --- | --- | --- | --- | --- |
| File (default) | `STORAGE=file` or no `DATABASE_URL` | `<DATA_DIR>/<session id>/` | `settings.json` | `groups/` and `docs/` folders |
| Postgres | `DATABASE_URL` starts with `postgres://`, or `STORAGE=postgres` | table `wa_sessions` | table `wa_settings` | tables `wa_group_settings`, `wa_docs` |

Both backends support every feature, including runtime settings changes, per-group protections, notes, temp-mail accounts and persistent games.

Baileys credentials always live on disk under `DATA_DIR`. On Heroku the filesystem is ephemeral, so sessions re-pair after a dyno restart; metadata, settings and bot data survive in Postgres.

## Running the bot

- `npm start` starts the pairing web server and all sessions.
- Commands go to any chat the bot can read. Default prefix is `.` (change per session with `.setprefix`).
- The owner is the linked account plus `OWNER` numbers plus `.setsudo` numbers (super users).
- `MODE` (`.setmode`) switches between `public` (everyone can use public commands) and `private` (only super users).
- `.menu` always shows exactly the commands the sender is allowed to run.

## Command categories

| Category | Highlights |
| --- | --- |
| General | menu, stats, command list, ping, uptime, repo, channel JID lookup, owner card, reports |
| Owner | view-once reveal, save/forward/status posting, profile tools, block list, sudo management, shell and eval, update check, data reset |
| Settings | full global settings panel, generated `set*` shortcuts, group settings, bad-words list |
| Automation | auto view status, auto like status, view-once retrieval and delivery mode |
| Group | mute/kick/promote/add, invite links, join requests, tag tools, anti-link, anti-bad-words, anti status-mention, anti-promote/anti-demote, welcome and goodbye, disappearing messages |
| Utility | WhatsApp registration check, VCF contact export |
| Downloader | YouTube play/video, direct URL audio/video, Facebook, TikTok, Twitter/X, Instagram, Google Drive, MediaFire, APK search, Pastebin, GitHub clone, Spotify search |
| Search | YouTube search, DuckDuckGo answers, Openverse images/wallpapers, weather, npm, lyrics, track search, sticker search, Wattpad, APKMirror, HappyMod |
| Tools | URL fetch, screenshots, QR create/read, text-to-sticker, fancy fonts, emoji mix, PDF creation, RDAP domain check, website-to-zip, image AI tools |
| Converter | sticker (with crop), sticker-to-image, video-to-audio, voice note, audio-to-video |
| Uploader | Catbox tourl, ImgBB, Pixhost |
| Games | TicTacToe (with AI), Word Chain (with AI), Dice (with AI) |
| Notes | personal notes CRUD plus owner-level administration |
| Temp Mail | disposable mailboxes via mail.tm: generate, inbox, read, release |
| Sports | fixtures, standings, team history, football news (provider based) |
| AI | chat models through any OpenAI-compatible endpoint with per-chat memory |
| Logo | ten locally rendered text-logo styles (neon, fire, silver, gold, glitch, ice, matrix, sunset, ocean, royal) |
| Religion | Bible passages |

The complete, generated command list with aliases and access levels lives in [COMMANDS.md](COMMANDS.md).

## Built-in automation and protections

All switches live in the settings schema and default to **off**. Configure them with the `set*` commands or `.settings`.

- **Anti-delete** (`inchat`/`indm`): recovers deleted text and media messages, including their captions.
- **Anti-edit** (`inchat`/`indm`): reports edited messages with before/after text.
- **Anti-call** (`on`/`block`): rejects incoming calls, optionally blocks the caller.
- **Anti-view-once** (`indm`/`inchat`): reveals view-once media automatically.
- **PM permit**: one polite notice per unknown private sender, nothing is forwarded.
- **Auto block**: blocks private senders from configured country code prefixes.
- **Group protections**: anti-link, anti-bad-words (custom word lists per group) and anti group-mention, each with `delete`, `warn` (N warnings then kick) or `kick` modes. Group admins and super users are exempt.
- **Anti-promote / anti-demote**: undo unauthorized admin changes made by non-admins.
- **Welcome / goodbye** with `{user}`, `{group}`, `{count}` templates and group-event announcements.
- **Auto react / auto read / presence** (online, typing, recording) per chats or groups.
- **Auto view / auto like status** with a randomized emoji pool and safe delays; auto-reply status.
- **Chatbot**: AI replies (text or voice via Google Translate TTS) scoped to inbox, groups or both.
- **Auto bio**: keeps a time-aware profile status.
- **Games**: the game engine listens for bare `join`, `roll`, move numbers and chain words inside any chat with an active game.

## Rate limiting

Every public and admin command is rate limited per sender and chat (default 3 seconds, configurable through `RATE_LIMIT_MS`). Super users bypass the limiter.

## External services

MaloneX prefers keyless public APIs and does the rest locally. Everything that needs a credential is disabled with a clear explanation until you configure it — no command pretends to work without its dependency.

| Feature | Service | Key needed |
| --- | --- | --- |
| Weather | [Open-Meteo](https://open-meteo.com) | no |
| Definitions | [dictionaryapi.dev](https://dictionaryapi.dev) | no |
| Lyrics | [lyrics.ovh](https://lyrics.ovh) | no |
| Track search | [Deezer public API](https://developers.deezer.com/api) | no |
| Image/photo/wallpaper search | [Openverse](https://api.openverse.org) | no |
| Dictionary | [dictionaryapi.dev](https://dictionaryapi.dev) | no |
| Bible | [bible-api.com](https://bible-api.com) | no |
| Domain check | [RDAP](https://rdap.org) | no |
| npm search | [registry.npmjs.org](https://github.com/npm/registry/blob/main/docs/RESOURCES.md) | no |
| GitHub data and repository zips | GitHub API | no (public repos) |
| Word Chain AI words | [Datamuse](https://www.datamuse.com/api/) | no |
| Temp mail | [mail.tm](https://docs.mail.tm) | no |
| URL shorteners | TinyURL, CleanURI, v.gd, is.gd, AdFoc.us | no |
| Screenshots | [thum.io](https://www.thum.io) | no |
| QR codes | local (`qrcode`, `jsqr`) | no |
| Stickers, audio, video conversion | local FFmpeg (`ffmpeg-static`) | no |
| Text logos | local vector rendering (sharp) | no |
| Media hosting | [Catbox](https://catbox.moe), [Pixhost](https://pixhost.to) | no |
| AI chat commands and chatbot | any OpenAI-compatible endpoint | **yes** — `AI_API_URL`, `AI_API_KEY` |
| YouTube / Facebook / Instagram / TikTok / Twitter downloads | Cobalt-compatible provider (`MEDIA_API_URL`; public instance tried by default) | self-host recommended |
| Spotify full-track download | provider dependent | provider specific |
| Sticker search | [Tenor](https://developers.google.com/tenor) | **yes** — `TENOR_API_KEY` |
| ImgBB uploads | [ImgBB](https://api.imgbb.com) | **yes** — `IMGBB_KEY` |
| Music recognition (.shazam) | ACRCloud-class service | **yes** — account credentials |
| Sports data | TheSportsDB free tier by default, or your provider | optional — `SPORTS_API_URL`, `SPORTS_API_KEY` |
| Image AI tools (.remini, .photoeditor) | your image provider | **yes** — `IMG_API_URL`, `IMG_API_KEY` |

Note: dictionary lookups go through dictionaryapi.dev; if that service is unreachable the command reports the failure plainly.

Scraped searches (Wattpad, APKMirror, HappyMod, MediaFire) depend on those sites' HTML and may break without notice; the commands report failures honestly instead of faking results.

## Configuration

All environment variables are optional; see `.env.example`. Runtime changes through `.setsetting` are stored per session and survive restarts.

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE` | auto | `file` or `postgres` |
| `DATABASE_URL` | empty | Postgres connection string (Heroku) |
| `DATA_DIR` | `./data` | File storage and Baileys credentials |
| `PREFIX` | `.` | Command prefix (per-session override with `.setprefix`) |
| `OWNER` | empty | Comma separated owner numbers, digits only |
| `PUBLIC_MODE` | `false` | Allow non-owners to run public commands |
| `PORT` | `3000` | Web pairing server port |
| `LOG_LEVEL` | `info` | Log verbosity |
| `RATE_LIMIT_MS` | `3000` | Per-user command cooldown |

## Testing

```bash
npm test        # node:test suite: 137 tests
find src test -name '*.js' -exec node --check {} \; && node --check index.js
```

The suite covers the command handler, permission gates (owner/admin/public, private mode, PM permit), rate limiting, settings and group settings validation, both storage backends (file in a temp dir, Postgres through a fake pool), all three game engines, message recovery, formatting utilities, button payloads and the invalid-argument paths of real commands. No test needs network access or WhatsApp credentials.

## Deployment

### Panel servers (Pterodactyl and similar)

1. Upload the project, run `npm install`, set `DATA_DIR` to a persistent folder.
2. Start command: `node index.js`.
3. Pair once from the web page on the allocated port; the session persists in `DATA_DIR`.

### Heroku

1. Deploy the repository and add the Heroku Postgres addon (`DATABASE_URL` is picked up automatically).
2. ` Procfile` is included: `web: npm start`.
3. Pair from the app URL. Credentials are ephemeral on Heroku; settings and bot data live in Postgres.

### Docker

```bash
docker build -t malonex .
docker run -p 3000:3000 -v malonex_data:/app/data malonex
```

### Security notes

- Never commit `.env` or your `data/` folder; both are pre-filled in `.gitignore`.
- The `$` shell and `>` eval commands are restricted to the account owner and exist for administration; remove them in `src/plugins/owner.js` if you do not want them.
- The bot never logs message contents, only ids and counts; phone numbers are masked in every log line.
- Auto-like is capped at 60 reactions per hour per session and never reacts to your own statuses, to keep automation safe.
