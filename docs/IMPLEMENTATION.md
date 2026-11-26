# MaloneX implementation checklist

Every command that exists in the reference bot was implemented as an original MaloneX command with its own code, replies and providers. This file records the mapping and the honest status of each capability. The full generated command list (261 registrations including aliases) is in [COMMANDS.md](../COMMANDS.md).

Legend: DONE = implemented, tested offline, no external dependency. DONE (API) = implemented, depends on a listed service. HONEST GAP = intentionally not faked; the command explains how to enable it.

## General
- [x] DONE — .ping (measured latency, quick-reply button) — reference: ping
- [x] DONE — .uptime — reference: uptime
- [x] DONE — .menu / .menus / .list with permission-aware listings — reference: menu, menus, list
- [x] DONE (API) — .repo via GitHub API — reference: repo
- [x] DONE (API) — .chjid channel lookup via Baileys newsletterMetadata — reference: chjid
- [x] DONE — .owner contact card — reference: owner
- [x] DONE — .report forwards to the owner chat — reference: report
- [x] DONE — .met group metadata panel — reference: met

## Owner
- [x] DONE — .vv / .vv2 view-once reveal (self / current chat) — reference: vv, vv2
- [x] DONE — .save (text and all media types) — reference: save
- [x] DONE — .forward to a number or JID — reference: forward
- [x] DONE — .tostatus — reference: tostatus
- [x] DONE — .jid, .cachedmeta, .cmd (send plugin source), .mygroups — reference equivalents
- [x] DONE — .pp / .fullpp (IQ picture node) / .getpp / .whois — reference equivalents
- [x] DONE — .block / .unblock / .blocklist — reference equivalents
- [x] DONE — .setsudo / .delsudo / .getsudo / .resetsudo (per-session storage) — reference: sudo DB
- [x] DONE — $ shell and > eval (owner only, documented removal path) — reference: $, >
- [x] DONE (API) — .update commit check via GitHub API — reference: update
- [x] DONE — .resetdb session data reset — reference: resetdb

## Settings
- [x] DONE — .settings full panel, .setsetting / .getsetting / .resetsetting / .resetallsettings
- [x] DONE — generated .set* shortcut for every global schema key (setbotname, setfooter, setautodelete, ...)
- [x] DONE — .groupsettings / .setgroupsetting / .resetgroup per-group storage on both backends
- [x] DONE — .badwords add/remove/list/clear/default with per-group lists — reference: badwords DB
- [x] DONE — .setmode / .setprefix / .settimezone runtime overrides

## Automation (original MaloneX, kept and integrated)
- [x] DONE — .autoview, .autolike [emoji], .vvmode, .settings (automation view)

## Group
- [x] DONE — .mute / .unmute, .promote / .demote / .kick / .add (privacy fallback), target resolution by mention, quote or number
- [x] DONE — .link / .resetlink, .newgroup / .killgc / .left
- [x] DONE — .accept / .reject / .acceptall / .rejectall / .listrequests join-request management
- [x] DONE — .online presence probe (10 second window; depends on clients sharing presence)
- [x] DONE — .groupname / .gcdesc, .disapp, .del, .getgcpp, .getlid
- [x] DONE — .tagall / .tagadmins / .everyone / .hidetag
- [x] DONE — .antilink (+warn limit), .antibad (+warn limit), .antigroupmention (+warn limit)
- [x] DONE — .antipromote / .antidemote with event-driven undo
- [x] DONE — .setwelcome / .setgoodbye / .welcomemessage / .goodbyemessage / .setgroupevents with templates
- [x] HONEST GAP — .togroupstatus from the reference uses a fork-specific protocol extension (group status). Not available through the standard Baileys library, so MaloneX ships .tostatus instead. Documented, not faked.

## Utility
- [x] DONE — .onwa registration check via Baileys onWhatsApp
- [x] DONE — .vcf contact export

## Downloader
- [x] DONE (API) — .play / .video: yt-search metadata + Cobalt-compatible provider for media
- [x] DONE — .sendaudio / .sendvideo direct URL downloads (no provider)
- [x] DONE (API) — .fb / .tiktok / .twitter / .ig / .snack through the media provider
- [x] DONE — .gitclone (GitHub zipball), .pastebin (raw fetch), .mediafire (page scrape), .gdrive (public confirm flow)
- [x] DONE (API) — .spotify: Deezer catalogue search + preview audio; full tracks need a provider
- [x] DONE — .apk / .apkmirror / .happymod: site search with honest failure notes (scrapes)

## Search
- [x] DONE (API) — .yts (yt-search), .google (DuckDuckGo instant answers), .npm, .weather (Open-Meteo)
- [x] DONE (API) — .ggleimage / .unsplash / .wallpapers (Openverse), .lyrics (lyrics.ovh), .spotifysearch (Deezer)
- [x] DONE (API) — .define (dictionaryapi.dev), .bible (bible-api.com)
- [x] DONE (API) — .stickersearch (Tenor, requires TENOR_API_KEY)
- [x] DONE — .wattpad / .apkmirror / .happymod site searches (scrape, honest failures)
- [x] HONEST GAP — .shazam music recognition requires account-specific ACRCloud credentials; MaloneX explains this in the reply instead of pretending to listen.

## Tools
- [x] DONE — .fetch (text or file), .ssweb / .ssphone / .sstab / .sspc (thum.io widths), .createqr, .readqr (jsqr)
- [x] DONE — .ttp text stickers (sharp SVG rendering), .fancy (local font maps), .emojimix (community Emoji Kitchen service)
- [x] DONE — .rename, .createpdf (own minimal PDF writer), .domaincheck (RDAP), .web2zip (page + same-origin assets)
- [x] DONE — .monospace, .ebase / .dbase / .ebinary / .debinary
- [x] DONE — 6 keyless URL shorteners (.tinyurl, .cleanuri, .vgd, .isgd, .adfoc) plus .shorteners list
- [x] DONE (API) — .remini / .photoeditor through a configurable image provider
- [x] DONE — 10 local text logos (.neon, .fire, .silver, .gold, .glitch, .ice, .matrix, .sunset, .ocean, .royal) + .logolist

## Converter
- [x] DONE — .sticker (image/video/sticker, crop flag), .toimg, .toaudio, .toptt, .tovideo (all FFmpeg)

## Uploader
- [x] DONE — .tourl / .catbox (keyless), .imgbb (IMGBB_KEY), .pixhost (keyless)
- [x] HONEST GAP — the reference's private CDN endpoints (GiftedCDN, GitHub CDN) belong to the original developer's infrastructure and are intentionally not used.

## Games
- [x] DONE — TicTacToe: two players or AI, 1-9 replies, win/draw detection, .tttend / .tttboard / .tttai
- [x] DONE — Word Chain: multiplayer, .wcg / .wcgjoin / .wcgbegin / .wcgend / .wcgscores / .wcgai, chain rules with dictionary validation (Datamuse, cached, offline fallback)
- [x] DONE — Dice: .dice / .dicejoin / .roll / .diceend / .diceai with best-of-N rounds
- [x] DONE — bare-message handling: join, roll, move numbers and chain words inside any chat with an active game

## Notes
- [x] DONE — .notes / .addnote / .getnote / .getnotes / .updatenote / .delnote / .delallnotes per sender
- [x] DONE — .allnotesadmin / .adminclearnotes owner variants

## Temp Mail
- [x] DONE (API) — .tempmail / .tempinbox / .readmail / .delmail via mail.tm, one mailbox per sender, persisted per session

## Sports
- [x] DONE (API) — .livescore / .standings / .upcomingmatches / .gamehistory (TheSportsDB free tier default, configurable)
- [x] DONE (API) — .sportnews via Google News RSS
- [x] HONEST GAP — .topscorers and .surebet need paid provider tiers; the commands say exactly how to enable them.

## AI
- [x] DONE (API) — .maloneai / .chatai / .gpt / .gpt4 / .gpt4o / .gpt4o-mini / .openai / .gemini / .venice through any OpenAI-compatible endpoint, per-chat memory, .clearai
- [x] DONE (API) — chatbot hook (text or audio replies) with inbox/groups/allchats scope

## Protections and automation (non-command features)
- [x] DONE — anti-delete (text + media, in-chat or owner DM), anti-edit, anti-call, anti-view-once
- [x] DONE — PM permit, auto block by country code, presence simulation, auto bio
- [x] DONE — auto react, auto read messages, auto view / like / reply status
- [x] DONE — newsletter follow and auto-react for the configured channel

## Deliberate differences from the reference
1. No emojis in menus or replies. Reactions are functional (command acknowledgements, auto-react, status likes) and game glyphs are textual.
2. No third-party developer numbers, private CDN endpoints or hardcoded API keys from the reference; every credential is user-configurable per session.
3. Session handling, storage and pairing are MaloneX's own architecture (generation-based reconnect, file + Postgres stores, web pairing page).
4. Fake features are never shipped: anything requiring credentials explains how to enable itself.
