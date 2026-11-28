# MaloneX

A WhatsApp bot that runs from a single session string. You get the session from your pairing site, paste it into one variable, deploy, and it stays connected: automatic reconnection, health monitoring and plain-language diagnostics are built in.

## Get your session

1. Open [https://brian.pairsite.space](https://brian.pairsite.space) and pair your phone number.
2. Copy the session string the site gives you.
3. Paste it into the `SESSION` variable of your deployment and start the bot.

A session string is a **password for the whole WhatsApp account**. Never share it, never paste it into a chat, never commit it to Git. If it ever leaks, open WhatsApp on your phone, go to Settings, Linked devices, and unlink the device called MaloneX; then get a fresh session and replace the variable.

## Deploy on Heroku

Click the button, log in, name the app, press Deploy app:

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/brianmalone63/MaloneX-)

After the build finishes, open Settings, Reveal Config Vars, and add `SESSION` with your session string. The app restarts, connects, and `https://your-app-name.herokuapp.com` shows its state. Heroku needs a verified payment method; the smallest setup (basic dyno plus the Postgres addon) costs about 5 to 7 USD per month. Postgres is provisioned automatically by the button and `DATABASE_URL` is picked up on its own.

## Deploy on a panel server (Pterodactyl style)

1. Upload the project files and set the startup command to `npm start` (or `node index.js`).
2. The panel assigns a port through `SERVER_PORT`; the bot binds it automatically.
3. Add the environment variables in the panel (at minimum `SESSION`).
4. Session data is stored in `./data`; keep that folder inside the panel's persistent storage.

## Deploy on Render

1. New, Blueprint, and point it at the repository; `render.yaml` defines the service, a persistent disk for `./data`, and an auto-generated `ACCESS_KEY`.
2. Add the `SESSION` environment variable in the dashboard and deploy.

## Deploy on Railway

1. New Project, Deploy from GitHub repo; `railway.json` sets the build and start commands.
2. Add the `SESSION` variable in the service Variables and redeploy.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION` | yes (or pair on the web page) | Session string from the pairing site. A password for the whole account: never share it. |
| `OWNER_PHONE` | no | Extra owner number, digits only with country code. The linked account is always the first owner. |
| `ACCESS_KEY` | recommended | Unlocks the built-in pairing page (`/api/pair`) and the admin overview (`/api/admin/overview`). Without it, both are disabled. |
| `PREFIX` | no | Command prefix, default `.` |
| `MODE` | no | `private` (default): strangers get no reply. `public`: strangers may use public commands. |
| `PAIRING_SITE_URL` | no | Shown as the button on the start page. Default: the pairing site above. |
| `SERVER_PORT` | no | Web port. Panel servers inject it; Heroku uses `PORT`. Default 3000. |
| `SESSION_PREFIX` | no | Force the expected prefix of the session string, for example `MaloneX` for `MaloneX~eyJ...`. |
| `PAIR_NUMBER` | no | Console pairing fallback: a phone number to pair at boot; the code is printed once to the server console. |
| `DATABASE_URL` | no | Postgres connection string (added by the Heroku button). Without it, sessions are stored in `./data`. |
| `DATA_DIR` | no | File storage folder, default `./data`. |
| `TRUST_PROXY` | no | Trust `X-Forwarded-For` for rate limiting. Default: on for Heroku, off elsewhere. |

## Commands

| Command | Who | What it does |
| --- | --- | --- |
| `.menu` (or `.commands`, `.help`) | everyone | Lists every command you are allowed to use |
| `.ping` | everyone | Liveness check with message age and uptime |
| `.uptime` | everyone | How long the bot has been running and its availability |
| `.status` | owner | Health summary: availability, reconnects, failures, counters |
| `.diagnose` | owner | Full diagnostics in plain language, with advice for the last disconnect |
| `.restart` | owner | Clean disconnect and reconnect |
| `.settings` | owner | Show all settings; `.settings <key> <value>` changes one |
| `.autoview` | owner | Turn automatic status reading on or off |
| `.autolike` | owner | Turn automatic status reactions on or off |
| `.vv` | owner | Reply to a view-once photo, video or voice note to receive it |

## Automation safety

Auto-view and auto-like are **off by default** and must be switched on deliberately with `.autoview on` or `.autolike on`. Automation on statuses carries a real ban risk: WhatsApp watches for robotic patterns, so the bot adds a random delay before every read (1 to 4 seconds) and every reaction (3 to 8 seconds), reacts with a single configurable emoji, never touches your own statuses, and never reacts more than 60 times per hour. Keep the defaults unless you accept that risk.

## Session security

- The session string and the stored credentials are equivalent to full access to the WhatsApp account. Treat them like a password.
- The bot never prints the session value, never includes it in errors, and masks every phone number in logs and replies (`+254****678`).
- The `SESSION` fingerprint is stored on first import; later boots always use the stored copy in `./data` or Postgres, because WhatsApp updates keys continually. Change the `SESSION` variable only when you want to re-import.
- If a session leaks: WhatsApp, Settings, Linked devices, unlink MaloneX. Then pair again and replace the variable. Anyone holding the old string is locked out the moment you unlink.

## Troubleshooting

**"no encryption" or SSL error from Postgres.** Heroku requires TLS on Postgres. This bot already sets `ssl: { rejectUnauthorized: false }` on every non-local connection. If you see this error, you are usually pointing `DATABASE_URL` at a proxy or a wrapper that strips TLS; use the real Heroku credentials.

**The bot says the Node version is wrong.** The project pins Node 22 (`engines.node` is `22.x`). Heroku honors that pin. On a panel server, select Node 22 in the startup image; very old images (Node 16 or 18) fail with engine warnings and may crash on modern syntax.

**"This session is running somewhere else" (disconnect 440).** The same session string is in use by two deployments. Stop the duplicate (another dyno, container or panel server), then restart this one. Credentials are kept, so nothing needs re-pairing.

**"logged out" (disconnect 401).** WhatsApp invalidated the session (phone renumbered, account re-registered, or the device was unlinked). The bot wipes the stored credentials and stops. Get a fresh session from the pairing site and update `SESSION`.

**The bot starts but says "No session yet".** No `SESSION` variable and no stored session. The web page shows exactly what to do, or set `ACCESS_KEY` and pair directly on the page, or set `PAIR_NUMBER` and read the code from the server console.

## Adding a command

Create `src/plugins/<name>.js`:

```js
export default {
  name: 'hello',
  aliases: ['hi'],
  description: 'Say hello',
  category: 'general',
  access: 'public',
  async run(ctx) {
    await ctx.reply(`Hello. Uptime: ${ctx.session.uptimeSeconds()}s.`);
  }
};
```

`access` is `public` or `owner`; `ctx.reply` sends text or a media object back to the current chat; `ctx.args` holds the words after the command. Duplicate names or aliases fail loudly at boot, so conflicts cannot hide. Plugins may also export `hook: 'message'` plus `runHook(ctx)` to observe every message, including statuses.

## Tests

```bash
npm test
```

The suite (100 tests) covers formatting, phone masking, disconnect classification and backoff, health maths, command permissions, web security (access key, rate limits, spoofed proxy headers, body limits), settings persistence in both storage backends, hooks, automation limits, view-once handling, every session-string format, and a fake-Baileys state machine that walks the bot through pairing, restarts, 401 wipes, duplicate 440 stops, three consecutive failures and shutdown. No test needs network access or a real account.
