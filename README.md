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

Open `http://localhost:3000` to reach the pairing portal. It supports both real pairing methods that Baileys offers:

- **Pairing code** — enter your number in international format, press **GET PAIR CODE**, and type the 8-character code into WhatsApp (Settings → Linked devices → Link a device → *Pair with phone number instead*).
- **QR code** — switch to the QR tab and scan it with Linked devices.

The portal polls live session state, refreshes the QR automatically whenever WhatsApp rotates it, counts down the pairing-code validity window and shows a clear success state once the connection opens. The linked number becomes the bot owner; additional owners can be listed in `OWNER` or granted at runtime with `.setsudo`.

### How pairing works under the hood

Pairing codes are requested through Baileys' `requestPairingCode` (the WhatsApp `link_code_companion_reg` handshake) only after the socket's noise handshake has completed — the portal waits for the first QR event, which is the earliest point WhatsApp accepts the request. Codes are held in memory for five minutes, never persisted and never written to logs with more than a masked phone. The QR endpoint serves the image only while the session is unpaired; once connected it returns `null` everywhere. Pairing requests are rate limited per IP (5 per 10 minutes), and if `PORTAL_PASSWORD` is set the portal requires it before showing any QR or code.

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
| `PORT` | `3000` | Web pairing server port (panel hosts and Heroku inject it automatically) |
| `PORTAL_SESSION_ID` | `main` | The single session the pairing portal manages |
| `PORTAL_PASSWORD` | empty | Optional key the browser must supply before QR or pairing codes are shown |
| `ADMIN_KEY` | empty | Bearer key for the raw `/api/sessions` management API; empty disables it |
| `LOG_LEVEL` | `info` | Log verbosity |
| `RATE_LIMIT_MS` | `3000` | Per-user command cooldown |

## Testing

```bash
npm test        # node:test suite: 166 tests
find src test -name '*.js' -exec node --check {} \; && node --check index.js
```

The suite covers the command handler, permission gates (owner/admin/public, private mode, PM permit), rate limiting, settings and group settings validation, both storage backends (file in a temp dir, Postgres through a fake pool), all three game engines, message recovery, formatting utilities, button payloads, the invalid-argument paths of real commands, and the pairing portal: phone validation, per-IP rate limits, pairing-code state and expiry, portal password protection, the admin gate on the session management API, and the session pairing lifecycle (already-connected guard, handshake readiness wait, code expiry, connection-open cleanup). No test needs network access or WhatsApp credentials.

## Deployment

### Panel servers (Pterodactyl and similar)

1. Upload the project, run `npm install`, and point `DATA_DIR` at a persistent folder.
2. Start command: `node index.js` (or `npm start`). The server binds `process.env.PORT` when the panel injects one, otherwise `3000`.
3. Open the allocated port in a browser and pair with a pairing code or QR. The session persists in `DATA_DIR` and survives restarts.
4. Optional: set `PORTAL_PASSWORD` so only you can see QR/pairing codes, and `ADMIN_KEY` if you want API access to the session management endpoints.

### Heroku

1. Deploy the repository and add the Heroku Postgres addon (`DATABASE_URL` is picked up automatically).
2. The included `Procfile` runs `web: npm start`; Heroku injects `PORT` dynamically and the server binds it. `app.json` documents every environment variable for one-click deploys.
3. Pair from the app URL (Settings → Reveal config vars → open the web dyno URL). Credentials are ephemeral on Heroku's filesystem, so sessions re-pair after a dyno restart; settings and bot data survive in Postgres.

### Docker

```bash
docker build -t malonex .
docker run -p 3000:3000 -v malonex_data:/app/data malonex
```

The Dockerfile starts `node index.js` and honors any injected `PORT`; the volume keeps Baileys credentials across container restarts.

### Security notes

- Never commit `.env` or your `data/` folder; both are pre-filled in `.gitignore`.
- The pairing portal never returns Baileys credentials — only a status, a QR image or a pairing code, and only while the session is unpaired. QR codes and pairing codes are session credentials until consumed: set `PORTAL_PASSWORD` if the app URL is reachable by other people.
- The raw `/api/sessions` management API (create, stop, delete sessions) requires `ADMIN_KEY` and is disabled entirely when the variable is unset.
- Pairing-code requests are limited to 5 per IP per 10 minutes; status/QR polling to 120 per IP per minute.
- The `$` shell and `>` eval commands are restricted to the account owner and exist for administration; remove them in `src/plugins/owner.js` if you do not want them.
- The bot never logs message contents, only ids and counts; phone numbers are masked in every log line and in every portal response.
- Auto-like is capped at 60 reactions per hour per session and never reacts to your own statuses, to keep automation safe.
