import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchBuffer, fetchJson, formatBytes, getMimeFromUrl, toAudio } from '../core/media.js';

const DEFAULT_MEDIA_PROVIDER = 'https://api.cobalt.tools';
const MAX_SEND_BYTES = 80 * 1024 * 1024;

function mediaProvider(settings) {
  return String(settings.MEDIA_API_URL || DEFAULT_MEDIA_PROVIDER).replace(/\/+$/, '');
}

async function providerRequest(settings, targetUrl, { downloadMode = 'auto', videoQuality = '720', filename = null } = {}) {
  const base = mediaProvider(settings);
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (settings.MEDIA_API_KEY) headers.Authorization = `Bearer ${settings.MEDIA_API_KEY}`;
  const body = {
    url: targetUrl,
    downloadMode,
    videoQuality,
    youtubeVideoCodec: 'h264',
    tiktokAudioFormat: 'mp3',
    filenameStyle: 'basic'
  };
  if (filename) body.filename = filename;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${base}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const text = typeof data?.error?.code === 'string' ? data.error.code : `HTTP ${res.status}`;
      const err = new Error(text);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve a cobalt-style response to a direct media URL.
function pickMediaUrl(result) {
  if (!result) return null;
  if (result.status === 'tunnel' || result.status === 'redirect') return result.url;
  if (result.status === 'picker' && Array.isArray(result.picker) && result.picker.length > 0) {
    return result.picker[0].url;
  }
  return null;
}

async function sendMediaResult(ctx, url, { asDocument = false, caption = '', kind = 'video' } = {}) {
  const buffer = await fetchBuffer(url, { maxBytes: 500 * 1024 * 1024 });
  const mime = kind === 'audio' ? 'audio/mpeg' : (getMimeFromUrl(url) || 'video/mp4');
  const filename = kind === 'audio' ? 'malonex-audio.mp3' : 'malonex-video.mp4';
  if (buffer.length > MAX_SEND_BYTES || asDocument) {
    await ctx.sock.sendMessage(ctx.jid, {
      document: buffer,
      fileName: filename,
      mimetype: mime,
      caption: caption || undefined
    }, { quoted: ctx.msg });
    return;
  }
  const payload = kind === 'audio'
    ? { audio: buffer, mimetype: 'audio/mpeg' }
    : { video: buffer, mimetype: mime, caption: caption || undefined };
  await ctx.sock.sendMessage(ctx.jid, payload, { quoted: ctx.msg });
}

function providerNotConfigured(ctx) {
  return notice([
    'No media download provider is configured.',
    '',
    'MaloneX uses any Cobalt-compatible API for social media downloads:',
    `${ctx.prefix}setsetting MEDIA_API_URL https://your-cobalt-instance`,
    '',
    'Direct downloads (sendaudio, sendvideo, gitclone, pastebin, mediafire) work without a provider.'
  ].join('\n'));
}

async function socialDownload(ctx, { kind = 'video', quality = '720' } = {}) {
  const url = ctx.argText.trim();
  if (!url) {
    await ctx.reply(usage(`${ctx.prefix}${ctx.command} <link>`));
    return;
  }
  await ctx.reply(notice('Resolving the media...'));
  try {
    const result = await providerRequest(ctx.settings, url, { downloadMode: kind === 'audio' ? 'audio' : 'auto', videoQuality: quality });
    const mediaUrl = pickMediaUrl(result);
    if (!mediaUrl) {
      await ctx.reply(errorPanel('The provider could not extract media from that link.'));
      return;
    }
    await sendMediaResult(ctx, mediaUrl, { kind, caption: `Downloaded via ${ctx.botName}` });
  } catch (err) {
    if (err.status === 401 || /missing auth/i.test(err.message)) {
      await ctx.reply(providerNotConfigured(ctx));
      return;
    }
    await ctx.reply(errorPanel(`The download failed: ${err.message}`));
  }
}

export default [
  {
    name: 'play',
    aliases: ['ytmp3', 'yta', 'song'],
    description: 'Search YouTube and download the audio of the first match',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}play artist - song title`));
        return;
      }
      const yts = (await import('yt-search')).default;
      const results = await yts(query);
      const video = results?.videos?.[0];
      if (!video) {
        await ctx.reply(notice('No YouTube result matched that search.'));
        return;
      }
      await ctx.reply(notice(`Found: ${video.title} (${video.timestamp}). Fetching audio...`));
      try {
        const result = await providerRequest(ctx.settings, video.url, { downloadMode: 'audio' });
        const mediaUrl = pickMediaUrl(result);
        if (!mediaUrl) throw new Error('no audio url');
        await sendMediaResult(ctx, mediaUrl, { kind: 'audio', caption: `${video.title}\n${video.author?.name || ''}` });
      } catch (err) {
        if (err.status === 401 || /missing auth|provider/i.test(err.message)) {
          await ctx.reply(providerNotConfigured(ctx));
          return;
        }
        await ctx.reply(errorPanel(`The audio could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'video',
    aliases: ['ytmp4', 'ytv', 'mp4'],
    description: 'Search YouTube and download the video of the first match',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}video search words`));
        return;
      }
      const yts = (await import('yt-search')).default;
      const results = await yts(query);
      const video = results?.videos?.[0];
      if (!video) {
        await ctx.reply(notice('No YouTube result matched that search.'));
        return;
      }
      await ctx.reply(notice(`Found: ${video.title} (${video.timestamp}). Fetching video...`));
      try {
        const result = await providerRequest(ctx.settings, video.url, { downloadMode: 'auto', videoQuality: '720' });
        const mediaUrl = pickMediaUrl(result);
        if (!mediaUrl) throw new Error('no video url');
        await sendMediaResult(ctx, mediaUrl, { kind: 'video', caption: `${video.title}\n${video.author?.name || ''}` });
      } catch (err) {
        if (err.status === 401 || /missing auth|provider/i.test(err.message)) {
          await ctx.reply(providerNotConfigured(ctx));
          return;
        }
        await ctx.reply(errorPanel(`The video could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'sendaudio',
    aliases: ['sendmp3'],
    description: 'Download any direct audio or video URL as audio',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      if (!/^https?:\/\//i.test(url)) {
        await ctx.reply(usage(`${ctx.prefix}sendaudio https://example.com/file.mp3`));
        return;
      }
      try {
        await ctx.reply(notice('Downloading...'));
        const buffer = await fetchBuffer(url, { maxBytes: 300 * 1024 * 1024 });
        let audio = buffer;
        const mime = getMimeFromUrl(url);
        if (!mime.startsWith('audio/')) {
          audio = await toAudio(buffer);
        }
        await ctx.sock.sendMessage(ctx.jid, { audio, mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`The download failed: ${err.message}`));
      }
    }
  },
  {
    name: 'sendvideo',
    aliases: ['sendmp4'],
    description: 'Download any direct video URL and send it here',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      if (!/^https?:\/\//i.test(url)) {
        await ctx.reply(usage(`${ctx.prefix}sendvideo https://example.com/file.mp4`));
        return;
      }
      try {
        await ctx.reply(notice('Downloading...'));
        await sendMediaResult(ctx, url, { kind: 'video' });
      } catch (err) {
        await ctx.reply(errorPanel(`The download failed: ${err.message}`));
      }
    }
  },
  {
    name: 'fb',
    aliases: ['fbdl', 'facebookdl'],
    description: 'Download a Facebook video',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      await socialDownload(ctx, { kind: 'video', quality: '720' });
    }
  },
  {
    name: 'tiktok',
    aliases: ['tiktokdl', 'ttdl'],
    description: 'Download a TikTok video or its audio',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      await socialDownload(ctx, { kind: 'video' });
    }
  },
  {
    name: 'twitter',
    aliases: ['twitterdl', 'xdl'],
    description: 'Download a Twitter/X video',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      await socialDownload(ctx, { kind: 'video' });
    }
  },
  {
    name: 'ig',
    aliases: ['insta', 'instadl'],
    description: 'Download an Instagram reel or post',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      await socialDownload(ctx, { kind: 'video' });
    }
  },
  {
    name: 'snack',
    aliases: ['snackdl'],
    description: 'Download a Snack Video clip (provider dependent)',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      await socialDownload(ctx, { kind: 'video' });
    }
  },
  {
    name: 'gdrive',
    aliases: ['googledrive'],
    description: 'Download a shared Google Drive file',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      const idMatch = url.match(/\/d\/([A-Za-z0-9_-]{10,})|id=([A-Za-z0-9_-]{10,})/);
      if (!idMatch) {
        await ctx.reply(usage(`${ctx.prefix}gdrive https://drive.google.com/file/d/FILE_ID/view`));
        return;
      }
      const fileId = idMatch[1] || idMatch[2];
      try {
        await ctx.reply(notice('Fetching the Drive file...'));
        let res = await fetch(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`, { redirect: 'follow' });
        const html = await res.text();
        // Large files return an HTML confirm page with a uuid parameter.
        const confirm = html.match(/name="confirm" value="([^"]+)"/);
        const uuid = html.match(/name="uuid" value="([^"]+)"/);
        if (confirm) {
          const params = new URLSearchParams({ id: fileId, export: 'download', confirm: confirm[1] });
          if (uuid) params.set('uuid', uuid[1]);
          res = await fetch(`https://drive.usercontent.google.com/download?${params.toString()}`, { redirect: 'follow' });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) throw new Error('The file is not publicly shared.');
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_SEND_BYTES) {
          await ctx.sock.sendMessage(ctx.jid, { document: buffer, fileName: `gdrive_${fileId}`, mimetype: contentType || 'application/octet-stream' }, { quoted: ctx.msg });
        } else {
          await ctx.sock.sendMessage(ctx.jid, { document: buffer, fileName: `gdrive_${fileId}`, mimetype: contentType || 'application/octet-stream' }, { quoted: ctx.msg });
        }
        await ctx.reply(panel('Google Drive', [{ label: 'Size', value: formatBytes(buffer.length) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The Drive download failed: ${err.message}`));
      }
    }
  },
  {
    name: 'mediafire',
    aliases: ['mfire'],
    description: 'Download a MediaFire file',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      if (!/mediafire\.com/i.test(url)) {
        await ctx.reply(usage(`${ctx.prefix}mediafire https://www.mediafire.com/file/xxx/file`));
        return;
      }
      try {
        await ctx.reply(notice('Fetching the MediaFire page...'));
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } });
        const html = await res.text();
        const match = html.match(/href="(https:\/\/download[^"]+mediafire\.com[^"]+)"/i) || html.match(/href="(https:\/\/[a-z0-9-]+\.mediafire\.com\/[^"]+\/[^"]+)"/i);
        if (!match) throw new Error('no direct link found');
        const direct = match[1].replace(/&amp;/g, '&');
        const fileName = decodeURIComponent(direct.split('/').pop() || 'mediafire_file');
        const buffer = await fetchBuffer(direct, { maxBytes: 300 * 1024 * 1024 });
        await ctx.sock.sendMessage(ctx.jid, {
          document: buffer,
          fileName,
          mimetype: getMimeFromUrl(fileName)
        }, { quoted: ctx.msg });
        await ctx.reply(panel('MediaFire', [{ label: 'File', value: fileName }, { label: 'Size', value: formatBytes(buffer.length) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The MediaFire download failed: ${err.message}`));
      }
    }
  },
  {
    name: 'apk',
    aliases: ['app'],
    description: 'Search APKMirror and return the best app links',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}apk whatsapp messenger`));
        return;
      }
      try {
        const res = await fetch(`https://www.apkmirror.com/?s=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' }
        });
        const html = await res.text();
        const results = [...html.matchAll(/<a[^>]+href="(\/apk\/[^"]+)"[^>]*>([^<]{3,80})<\/a>/g)]
          .slice(0, 8)
          .map((m) => ({ url: `https://www.apkmirror.com${m[1]}`, title: m[2].trim() }));
        if (results.length === 0) {
          await ctx.reply(notice('No APK listings matched that search. APKMirror may also be blocking automated requests.'));
          return;
        }
        const rows = results.map((r, i) => ({ label: `${i + 1}. ${r.title}`, value: r.url }));
        await ctx.reply(panel('APK search', rows, 'APK sites require a browser step for the final file; open a link to download.'));
      } catch (err) {
        await ctx.reply(errorPanel(`The APK search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'pastebin',
    aliases: ['getpaste'],
    description: 'Fetch the raw content of a Pastebin paste',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      const match = url.match(/pastebin\.com\/(?:raw\/)?([A-Za-z0-9]+)/i);
      if (!match) {
        await ctx.reply(usage(`${ctx.prefix}pastebin https://pastebin.com/xxxxxx`));
        return;
      }
      try {
        const res = await fetch(`https://pastebin.com/raw/${match[1]}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 4000) {
          await ctx.sock.sendMessage(ctx.jid, { document: Buffer.from(text, 'utf8'), fileName: `pastebin_${match[1]}.txt`, mimetype: 'text/plain' }, { quoted: ctx.msg });
        } else {
          await ctx.reply(panel(`Pastebin ${match[1]}`, [text]));
        }
      } catch (err) {
        await ctx.reply(errorPanel(`The paste could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'gitclone',
    aliases: ['gitdl'],
    description: 'Download a GitHub repository as a zip file',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^\s/#]+)/i);
      if (!match) {
        await ctx.reply(usage(`${ctx.prefix}gitclone https://github.com/user/repo`));
        return;
      }
      const [, user, repoRaw] = match;
      const repo = repoRaw.replace(/\.git$/, '');
      try {
        await ctx.reply(notice(`Fetching ${user}/${repo}...`));
        const meta = await fetchJson(`https://api.github.com/repos/${user}/${repo}`, { timeoutMs: 20000 });
        const branch = meta.default_branch || 'main';
        const zipBuffer = await fetchBuffer(`https://api.github.com/repos/${user}/${repo}/zipball/${branch}`, { maxBytes: 200 * 1024 * 1024 });
        await ctx.sock.sendMessage(ctx.jid, {
          document: zipBuffer,
          fileName: `${user}-${repo}-${branch}.zip`,
          mimetype: 'application/zip'
        }, { quoted: ctx.msg });
        await ctx.reply(panel('Repository', [
          { label: 'Repo', value: `${user}/${repo}` },
          { label: 'Branch', value: branch },
          { label: 'Size', value: formatBytes(zipBuffer.length) }
        ]));
      } catch (err) {
        const reason = /404|Not Found/i.test(err.message) ? 'The repository was not found or is private.' : err.message;
        await ctx.reply(errorPanel(`The repository could not be fetched: ${reason}`));
      }
    }
  },
  {
    name: 'spotify',
    aliases: ['spotifydl'],
    description: 'Search Spotify tracks via Deezer and download audio when a provider is set',
    category: 'Downloader',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}spotify artist - song`));
        return;
      }
      try {
        const data = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`);
        const tracks = (data?.data || []).map((t) => ({
          title: `${t.artist?.name || 'Unknown'} - ${t.title}`,
          duration: `${Math.floor((t.duration || 0) / 60)}:${String((t.duration || 0) % 60).padStart(2, '0')}`,
          url: t.link,
          preview: t.preview
        }));
        if (tracks.length === 0) {
          await ctx.reply(notice('No tracks matched that search.'));
          return;
        }
        const first = tracks[0];
        await ctx.buttons({
          title: 'Track match',
          text: [
            `Title: ${first.title}`,
            `Duration: ${first.duration}`,
            `Link: ${first.url}`,
            '',
            'Send audio uses the 30 second preview; use a configured media provider for full tracks.'
          ].join('\n'),
          footer: ctx.footer,
          buttons: [
            { text: 'Send preview audio', id: `${ctx.prefix}spotifypreview ${encodeURIComponent(first.preview)}` },
            { text: 'Open track', url: first.url }
          ]
        });
      } catch (err) {
        await ctx.reply(errorPanel(`The Spotify search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'spotifypreview',
    aliases: [],
    description: 'Internal: send a Deezer preview clip as audio',
    category: 'Downloader',
    access: 'public',
    dontList: true,
    async run(ctx) {
      const url = ctx.argText.trim();
      if (!/^https?:\/\/.+\.mp3$/i.test(url)) {
        await ctx.reply(notice('No preview URL was supplied.'));
        return;
      }
      try {
        const buffer = await fetchBuffer(url, { maxBytes: 10 * 1024 * 1024 });
        await ctx.sock.sendMessage(ctx.jid, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`The preview could not be delivered: ${err.message}`));
      }
    }
  }
];
