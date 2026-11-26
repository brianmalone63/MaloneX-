# MaloneX command list

Generated from the running registry. Owner commands are visible only to the owner and sudo numbers; admin commands only to group admins. Alias entries start with a dot.

## AI

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .chatai | - | public | Chat with General assistant (AI_API_URL and AI_API_KEY required) |
| .clearai | .resetchat | public | Forget the AI conversation memory of this chat |
| .gemini | - | public | Chat with Gemini chat (AI_API_URL and AI_API_KEY required) |
| .gpt | - | public | Chat with GPT chat (AI_API_URL and AI_API_KEY required) |
| .gpt4 | - | public | Chat with GPT-4 chat (AI_API_URL and AI_API_KEY required) |
| .gpt4o | - | public | Chat with GPT-4o chat (AI_API_URL and AI_API_KEY required) |
| .gpt4o-mini | - | public | Chat with GPT-4o mini chat (AI_API_URL and AI_API_KEY required) |
| .maloneai | .ai | public | Chat with MaloneX assistant (AI_API_URL and AI_API_KEY required) |
| .openai | - | public | Chat with OpenAI chat (AI_API_URL and AI_API_KEY required) |
| .venice | - | public | Chat with Venice chat (AI_API_URL and AI_API_KEY required) |

## Automation

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .autolike | - | owner | Turn automatic status reactions on or off, optionally with an emoji |
| .autoview | - | owner | Turn automatic viewing of statuses on or off |
| .vv | .viewonce | owner | Retrieve a view-once photo, video or audio (reply to the message) |
| .vvmode | - | owner | Choose where retrieved view-once media is delivered: self or chat |

## Converter

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .sticker | .st, .take | public | Convert a quoted image, video or sticker into a sticker (add crop for a square cut) |
| .toaudio | .tomp3 | public | Extract the audio of a quoted video as MP3 |
| .toimg | .s2img | public | Convert a quoted sticker into an image |
| .toptt | .tovoice, .tovn | public | Convert a quoted audio into a voice note |
| .tovideo | .tomp4, .blackscreen | public | Turn a quoted audio into a video with a black frame |

## Downloader

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .apk | .app | public | Search APKMirror and return the best app links |
| .fb | .fbdl, .facebookdl | public | Download a Facebook video |
| .gdrive | .googledrive | public | Download a shared Google Drive file |
| .gitclone | .gitdl | public | Download a GitHub repository as a zip file |
| .ig | .insta, .instadl | public | Download an Instagram reel or post |
| .mediafire | .mfire | public | Download a MediaFire file |
| .pastebin | .getpaste | public | Fetch the raw content of a Pastebin paste |
| .play | .ytmp3, .yta, .song | public | Search YouTube and download the audio of the first match |
| .sendaudio | .sendmp3 | public | Download any direct audio or video URL as audio |
| .sendvideo | .sendmp4 | public | Download any direct video URL and send it here |
| .snack | .snackdl | public | Download a Snack Video clip (provider dependent) |
| .spotify | .spotifydl | public | Search Spotify tracks via Deezer and download audio when a provider is set |
| .tiktok | .tiktokdl, .ttdl | public | Download a TikTok video or its audio |
| .twitter | .twitterdl, .xdl | public | Download a Twitter/X video |
| .video | .ytmp4, .ytv, .mp4 | public | Search YouTube and download the video of the first match |

## Games

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .dice | .dicestart | public | Open a best-of-3 dice match in this chat |
| .diceai | .dicebot | public | Play a dice match against the bot |
| .diceend | .enddice | public | Cancel the dice match |
| .dicejoin | .joindice | public | Join the waiting dice match |
| .games | .game | public | Show how every MaloneX game works |
| .roll | .diceroll | public | Roll the dice in an active match |
| .tictactoe | .ttt | public | Start TicTacToe in this chat (add ai for a bot opponent) |
| .tttai | .tttbot | public | Start TicTacToe against the bot |
| .tttboard | .board | public | Show the current TicTacToe board |
| .tttend | .endttt | public | End the current TicTacToe game |
| .tttjoin | .jointtt | public | Join a waiting TicTacToe game |
| .wcg | .wordchain | public | Open a Word Chain game in this chat |
| .wcgai | .wcgbot | public | Play Word Chain against the bot |
| .wcgbegin | .startwcg | public | Start the Word Chain game (host only) |
| .wcgend | .endwcg | public | End the Word Chain game and show the final scores |
| .wcgjoin | .joinwcg | public | Join the waiting Word Chain game |
| .wcgscores | .wcgscore | public | Show the current Word Chain scores |

## General

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .chjid | .channelinfo, .channeljid | public | Look up a WhatsApp channel JID from its invite link |
| .list | .listmenu | public | Show all commands with their descriptions as a numbered list |
| .menu | .help, .commands | public | Show every command you are allowed to use |
| .menus | .mainmenu, .stats | public | Show bot stats, categories and session diagnostics |
| .owner | .contact | public | Show the account owner contact card |
| .ping | .p | public | Measure the bot response time |
| .repo | .script, .source | public | Show the MaloneX repository information |
| .report | .request | owner | Send a bug report or feature request to the owner chat |
| .uptime | .up | public | Show how long the session has been running |

## Group

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .accept | .approve | admin | Approve one pending join request by number |
| .acceptall | .approveall | admin | Approve every pending join request |
| .add | .invite | admin | Add a number to the group |
| .antibad | .setantibad | admin | Protect against bad words: warn/delete/kick/off |
| .antibadwarn | .badwarncount | admin | Set the anti-badwords warning limit (1-50) |
| .antidemote | - | admin | Undo unauthorized demotions: on/off |
| .antigroupmention | - | admin | Protect against group mentions in statuses: warn/delete/kick/off |
| .antilink | .setantilink | admin | Protect against links: warn/delete/kick/off |
| .antilinkwarn | .setwarncount | admin | Set the antilink warning limit (1-50) |
| .antipromote | - | admin | Undo unauthorized promotions: on/off |
| .badwords | .setbadwords | admin | Manage the bad-words list: add/remove/list/clear/default |
| .del | .delete | admin | Delete a quoted message sent by the bot or by you |
| .demote | - | admin | Demote a group admin |
| .disapp | .disappearing | admin | Toggle disappearing messages: off/1/7/90 days |
| .everyone | .tag | admin | Mention everyone with a custom message |
| .gcdesc | .gcdescription | admin | Change the group description |
| .getgcpp | .stealgcpp | public | Download the group profile picture |
| .getlid | .lid | admin | Resolve a LID to the real phone JID via group data |
| .goodbyemessage | .setgoodbyemsg | admin | Set a custom goodbye text with {user} and {group} placeholders |
| .groupname | .gcname | admin | Change the group name |
| .groupsettings | .gcsettings | admin | Show every setting of the current group |
| .hidetag | .htag | admin | Send a message that silently mentions everyone |
| .kick | .remove | admin | Remove a user from the group |
| .killgc | .destroygc | owner | Remove all members and leave the group |
| .left | .leave | owner | Make the bot leave this group |
| .link | .gclink, .grouplink | admin | Show the group invite link |
| .listrequests | .joinrequests | admin | List pending join requests |
| .met | .gmetadata | public | Show the full metadata of the current group |
| .mute | .close, .gcclose | admin | Close the group so only admins can write |
| .newgroup | .creategroup | owner | Create a new group with the sender as first member |
| .online | .listonline | admin | Probe which members are currently online (about 10 seconds) |
| .promote | .toadmin | admin | Promote a user to group admin |
| .reject | .decline | admin | Reject one pending join request by number |
| .rejectall | .declineall | admin | Reject every pending join request |
| .resetgroup | .resetgroupsettings | admin | Reset every setting of the current group |
| .resetlink | .revokelink | admin | Revoke and regenerate the group invite link |
| .setantigcmentionwarnlimit | - | admin | Set the anti group-mention warning limit (1-50) |
| .setgoodbye | .goodbye | admin | Toggle goodbye messages: on/off |
| .setgroupevents | .groupevents | admin | Announce promote and demote events: on/off |
| .setgroupsetting | .setgcsetting | admin | Set one group setting: KEY VALUE |
| .setwelcome | .welcome | admin | Toggle welcome messages: on/off |
| .tagadmins | - | admin | Mention only the group admins with an optional message |
| .tagall | .mentionall | admin | Mention every member with an optional message |
| .unmute | .open, .gcopen | admin | Open the group so every member can write |
| .welcomemessage | .setwelcomemsg | admin | Set a custom welcome text with {user}, {group} and {count} placeholders |

## Logo

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .fire | .firelogo | public | Create a warm gradient text on an ember background |
| .glitch | .glitchlogo | public | Create a glitch effect with chromatic offsets |
| .gold | .goldlogo | public | Create a gold foil text |
| .ice | .icelogo | public | Create a frozen glass text |
| .logolist | .logos | public | List every local text-logo style |
| .matrix | .matrixlogo | public | Create a terminal green code style |
| .neon | .neonlogo | public | Create a neon glow text on dark background |
| .ocean | .oceanlogo | public | Create a deep ocean gradient text |
| .royal | .royallogo | public | Create a crowned serif monogram |
| .silver | .silverlogo | public | Create a polished silver metal text |
| .sunset | .sunsetlogo | public | Create a pastel sunset gradient text |

## Notes

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .addnote | .newnote | public | Save a new note |
| .delallnotes | .deleteallnotes | public | Delete every one of your notes |
| .delnote | .deletenote | public | Delete one note by number |
| .getnote | .listnote | public | Show one note by number |
| .getnotes | .allnotes | public | Show all your notes in full |
| .notes | .mynotes | public | List your saved notes |
| .updatenote | .editnote | public | Replace the text of a note: NUMBER new text |

## Owner

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .> | .eval | owner | Evaluate a JavaScript expression (owner only) |
| .$ | .shell | owner | Run a shell command on the host (owner only) |
| .adminclearnotes | .clearusernotes | owner | Delete all notes of one user (owner) |
| .allnotesadmin | .viewnotes | owner | List every user that stores notes (owner) |
| .block | .blockuser | owner | Block a number. Mention, quote or type the number |
| .blocklist | .blocked | owner | List every blocked number |
| .cachedmeta | .cachedmetadata | owner | Show the cached metadata of a group |
| .cmd | .getcmd | owner | Send the source file of a command as a document |
| .delsudo | .removesudo | owner | Revoke owner-level access from a number |
| .forward | .fwd | owner | Forward a quoted message to a number or group JID |
| .fullpp | .setfullpp | owner | Set a full-size profile picture without cropping |
| .getpp | .stealpp | owner | Download the profile picture of a user or this group |
| .getsudo | .sudolist | owner | List numbers with owner-level access |
| .jid | .chatid | owner | Show the JID of this chat or of a quoted user |
| .join | .joingc | owner | Join a group from an invite link |
| .logout | - | owner | Log out and clear pairing; settings are kept |
| .mygroups | .listgroups | owner | List every group this session has joined |
| .pp | .setpp | owner | Set the profile picture from a quoted image |
| .resetdb | .resetdata | owner | Reset per-session data: settings, sudo, notes and games (keeps pairing) |
| .resetsudo | .clearsudo | owner | Remove every sudo number set through commands |
| .restart | - | owner | Restart this WhatsApp session connection |
| .save | .sv | owner | Save a quoted message into your own chat |
| .setsudo | .addsudo | owner | Grant owner-level access to a number |
| .status | .health, .diag | owner | Show session diagnostics: state, uptime and counters |
| .tostatus | .tomystatus | owner | Post a quoted message to your WhatsApp status |
| .unblock | .unblockuser | owner | Unblock a number. Mention, quote or type the number |
| .update | .checkupdate | owner | Check the MaloneX repository for newer commits |
| .vv2 | .reveal | owner | Reveal view-once media and send it into the current chat |
| .whois | .profile | owner | Show profile details of a quoted or mentioned user |

## Religion

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .bible | .verse | public | Look up a Bible passage (bible-api.com) |

## Search

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .apkmirror | .apkmirrorsearch | public | Search APKMirror listings |
| .ggleimage | .googleimage, .imgsearch | public | Search open-license images and send the first matches |
| .google | .ggle | public | Web search via the DuckDuckGo instant answer API |
| .happymod | .modapks | public | Search HappyMod for modded apps |
| .lyrics | .songlyrics | public | Fetch song lyrics from lyrics.ovh |
| .npm | .npmsearch | public | Search npm packages |
| .shazam | .whatmusic | public | Identify a song from quoted audio (needs ACRCloud keys) |
| .spotifysearch | .spotisearch | public | Search tracks (via the Deezer catalogue) |
| .stickersearch | .searchsticker | public | Search animated stickers via Tenor (needs TENOR_API_KEY) |
| .unsplash | .unsplashphotos | public | Search photography via Openverse and send samples |
| .wallpapers | .wallpaper | public | Search wallpaper-sized images and send samples |
| .wattpad | .watt | public | Search Wattpad stories |
| .weather | .getweather | public | Weather for a city via Open-Meteo |
| .yts | .ytsearch | public | Search YouTube and list the top matches |

## Settings

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .getsetting | .getconfig | owner | Show one global setting: KEY |
| .resetallsettings | .resetsettings | owner | Reset every global setting to its default |
| .resetsetting | .resetconfig | owner | Reset one global setting to its default |
| .setaiapikey | .ai_api_key | owner | Set AI_API_KEY: API key for the AI provider |
| .setaiapiurl | .ai_api_url | owner | Set AI_API_URL: OpenAI-compatible chat completions base URL |
| .setaimodel | .ai_model | owner | Set AI_MODEL: Model name for AI commands |
| .setanticall | .anticall | owner | Set ANTICALL: Reject incoming calls |
| .setantidelete | .antidelete | owner | Set ANTIDELETE: Resend deleted messages |
| .setantiedit | .anti_edit | owner | Set ANTI_EDIT: Report edited messages |
| .setantiviewonce | .antiviewonce | owner | Set ANTIVIEWONCE: Auto-reveal view-once media |
| .setautobio | .auto_bio | owner | Set AUTO_BIO: Keep a time-aware profile status |
| .setautoblock | .auto_block | owner | Set AUTO_BLOCK: Country codes to auto-block, comma separated |
| .setautolike | - | owner | Set autolike: Automatically react to incoming statuses |
| .setautolikeemoji | .autolike_emoji | owner | Set autolike_emoji: Reaction used by auto like |
| .setautoreact | .auto_react | owner | Set AUTO_REACT: Automatic emoji reactions |
| .setautoreadmessages | .auto_read_messages | owner | Set AUTO_READ_MESSAGES: Mark messages as read |
| .setautoreplystatus | .auto_reply_status | owner | Set AUTO_REPLY_STATUS: Reply to statuses when auto view is on |
| .setautoview | - | owner | Set autoview: Automatically view incoming statuses |
| .setbotname | .bot_name | owner | Set BOT_NAME: Bot display name |
| .setbotpic | .bot_pic | owner | Set BOT_PIC: Image URL shown with menus |
| .setcaption | .caption | owner | Set CAPTION: Caption appended to delivered media |
| .setchatbot | .chatbot | owner | Set CHATBOT: AI chatbot replies for non-command messages |
| .setchatbotmode | .chatbot_mode | owner | Set CHATBOT_MODE: Where the chatbot answers |
| .setdmpresence | .dm_presence | owner | Set DM_PRESENCE: Presence shown in private chats |
| .setfooter | .footer | owner | Set FOOTER: Footer line used in bot replies |
| .setgcpresence | .gc_presence | owner | Set GC_PRESENCE: Presence shown in groups |
| .setimgapikey | .img_api_key | owner | Set IMG_API_KEY: API key for the image provider |
| .setimgapiurl | .img_api_url | owner | Set IMG_API_URL: Image generation or enhancement provider base URL |
| .setimgbbkey | .imgbb_key | owner | Set IMGBB_KEY: ImgBB API key used by the imgbb uploader |
| .setmediaapikey | .media_api_key | owner | Set MEDIA_API_KEY: API key or token for the media provider |
| .setmediaapiurl | .media_api_url | owner | Set MEDIA_API_URL: Cobalt-compatible media download provider base URL |
| .setmode | .mode | owner | Switch the bot between public and private mode |
| .setnewsletterjid | .newsletter_jid | owner | Set NEWSLETTER_JID: Channel JID auto-followed and auto-reacted |
| .setownername | .owner_name | owner | Set OWNER_NAME: Owner display name |
| .setpackauthor | .pack_author | owner | Set PACK_AUTHOR: Sticker pack author |
| .setpackname | .pack_name | owner | Set PACK_NAME: Sticker pack name |
| .setpmpermit | .pm_permit | owner | Set PM_PERMIT: Only allow owners to write in private chat |
| .setprefix | .prefix | owner | Set the command prefix for this session |
| .setsetting | .setconfig | owner | Set any global setting: KEY VALUE |
| .setsportsapikey | .sports_api_key | owner | Set SPORTS_API_KEY: API key for the football data provider |
| .setsportsapiurl | .sports_api_url | owner | Set SPORTS_API_URL: Football data provider base URL |
| .setstartbanner | .start_banner | owner | Set START_BANNER: Send a summary message after connecting |
| .setstatuslikeemojis | .status_like_emojis | owner | Set STATUS_LIKE_EMOJIS: Emoji pool used when auto like picks a random reaction |
| .setstatusreplytext | .status_reply_text | owner | Set STATUS_REPLY_TEXT: Text used when auto reply status is on |
| .setsudonumbers | .sudo_numbers | owner | Set SUDO_NUMBERS: Comma separated phone numbers with owner-level access |
| .settenorapikey | .tenor_api_key | owner | Set TENOR_API_KEY: Tenor API key used by sticker search |
| .settimezone | .timezone | owner | Set the time zone used in replies |
| .settings | .botsettings, .allsettings | owner | Show every global setting of this session |
| .setvvdestination | .vv_destination | owner | Set vv_destination: Where retrieved view-once media is delivered |

## Sports

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .gamehistory | .matchevents | public | Look up past results of a team by name |
| .livescore | .live | public | Show the latest finished and next scheduled matches for a league |
| .sportnews | .footballnews | public | Latest football news headlines via Google News RSS |
| .standings | .leaguetable | public | Show the current league table (premier, laliga, seriea, bundesliga, ligue1, mls) |
| .surebet | .bettips | public | Sure bets need a live odds provider; explains how to enable one |
| .topscorers | .scorers | public | Top scorers need a paid provider tier; shows league info instead |
| .upcomingmatches | .fixtures | public | Show upcoming fixtures across the major leagues |

## Temp Mail

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .delmail | - | public | Delete your temp mailbox record |
| .readmail | .getmsg | public | Read one temp email by number |
| .tempinbox | .checkinbox | public | Check the inbox of your temp address |
| .tempmail | .tempmailgen, .newmail | public | Generate a temporary email address (mail.tm) |

## Tools

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .adfoc | .adfocus | public | Shorten a URL using AdFoc.us |
| .cleanuri | .cleanurl | public | Shorten a URL using CleanURI |
| .createpdf | .topdf | public | Create a PDF from text (one page per 46 lines) |
| .createqr | .toqr | public | Generate a QR code from text or a link |
| .dbase | .debase | public | Decode Base64 text |
| .debinary | .dbinary | public | Decode binary text |
| .define | .meaning | public | Look up the definition of a word (dictionaryapi.dev) |
| .domaincheck | .domainstatus | public | WHOIS-style domain data via the RDAP protocol |
| .ebase | .tobase64 | public | Encode text to Base64 |
| .ebinary | .tobinary | public | Encode text to binary |
| .emojimix | .emomix | public | Mix two emojis into one (community Emoji Kitchen service) |
| .fancy | .fancytext | public | Convert text into several styled fonts |
| .fetch | .get | public | Fetch a URL and show its content or send the file |
| .isgd | .isgdurl | public | Shorten a URL using is.gd |
| .monospace | .mono | public | Convert text to a monospace style font |
| .photoeditor | .photoedit | public | Edit a quoted photo with a prompt through your image provider |
| .readqr | .decodeqr | public | Decode a QR code from a quoted image |
| .remini | .enhance | public | Enhance a quoted photo through your configured image provider |
| .rename | .newname | public | Re-send a quoted document with a new file name |
| .shorteners | - | public | List the available URL shorteners |
| .sspc | .pcss | public | Screenshot a website (PC width) |
| .ssphone | .ssmobile | public | Screenshot a website (mobile width) |
| .sstab | .sstablet | public | Screenshot a website (tablet width) |
| .ssweb | .fullssweb | public | Screenshot a website (desktop width) |
| .tinyurl | .tiny | public | Shorten a URL using TinyURL |
| .ttp | .textpic | public | Render text into a sticker |
| .vgd | .vgdurl | public | Shorten a URL using v.gd |
| .web2zip | .webtozip | public | Download a web page with its assets as a zip archive |

## Uploader

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .catbox | - | public | Upload quoted media to Catbox (permanent link) |
| .imgbb | - | public | Upload a quoted image to ImgBB (needs IMGBB_KEY) |
| .pixhost | - | public | Upload a quoted image to Pixhost (keyless image host) |
| .tourl | .url | public | Upload a quoted image, video, audio or document and get a link |

## Utility

| Command | Aliases | Access | Description |
| --- | --- | --- | --- |
| .onwa | .onwhatsapp | public | Check whether a number is registered on WhatsApp |
| .vcf | .contacts, .savecontacts | public | Export the group members as a VCF contact file |

