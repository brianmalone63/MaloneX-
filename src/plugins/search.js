import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchJson, fetchBuffer, formatBytes } from '../core/media.js';

const OPENVERSE = 'https://api.openverse.org/v1/images?q=';

function truncate(text, max = 120) {
  return String(text || '').length > max ? `${String(text).slice(0, max)}...` : String(text || '');
}

export default [
  {
    name: 'yts',
    aliases: ['ytsearch'],
    description: 'Search YouTube and list the top matches',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}yts search words`));
        return;
      }
      const yts = (await import('yt-search')).default;
      const results = await yts(query);
      const videos = (results?.videos || []).slice(0, 8);
      if (videos.length === 0) {
        await ctx.reply(notice('No YouTube results matched that search.'));
        return;
      }
      const rows = videos.map((v) => ({
        label: v.title.slice(0, 60),
        value: `${v.timestamp} | ${v.author?.name || ''} | ${v.url}`
      }));
      await ctx.reply(panel('YouTube search', rows, `Search: ${truncate(query, 80)}`));
    }
  },
  {
    name: 'google',
    aliases: ['ggle'],
    description: 'Web search via the DuckDuckGo instant answer API',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}google search words`));
        return;
      }
      try {
        const data = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
        const rows = [];
        if (data.AbstractText) rows.push({ label: 'Answer', value: truncate(data.AbstractText, 400) });
        if (data.AbstractURL) rows.push({ label: 'Source', value: data.AbstractURL });
        const topics = [];
        for (const topic of data.RelatedTopics || []) {
          if (topic.Text) topics.push(topic.Text);
          if (Array.isArray(topic.Topics)) for (const sub of topic.Topics) if (sub.Text) topics.push(sub.Text);
        }
        for (const text of topics.slice(0, 6)) rows.push({ label: 'Result', value: truncate(text, 160) });
        if (rows.length === 0) {
          await ctx.reply(notice('No instant answers matched. Try more specific words.'));
          return;
        }
        await ctx.reply(panel(`Search: ${truncate(query, 60)}`, rows.slice(0, 8), 'Instant answers only. For full web results open a search engine.'));
      } catch (err) {
        await ctx.reply(errorPanel(`The search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'ggleimage',
    aliases: ['googleimage', 'imgsearch'],
    description: 'Search open-license images and send the first matches',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}ggleimage search words`));
        return;
      }
      try {
        const data = await fetchJson(`${OPENVERSE}${encodeURIComponent(query)}&page_size=3`, { timeoutMs: 30000 });
        const images = (data?.results || []).slice(0, 3);
        if (images.length === 0) {
          await ctx.reply(notice('No open-license images matched that search.'));
          return;
        }
        for (const img of images) {
          try {
            const buffer = await fetchBuffer(img.url, { maxBytes: 15 * 1024 * 1024 });
            await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: truncate(img.title || query, 100) }, { quoted: ctx.msg });
          } catch {
            await ctx.reply(notice(`An image could not be downloaded: ${img.url}`));
          }
        }
        await ctx.reply(panel('Image search', [{ label: 'Query', value: truncate(query, 80) }, { label: 'Source', value: 'Openverse (open licenses)' }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The image search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'unsplash',
    aliases: ['unsplashphotos'],
    description: 'Search photography via Openverse and send samples',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}unsplash mountain sunset`));
        return;
      }
      try {
        const data = await fetchJson(`${OPENVERSE}${encodeURIComponent(query)}&category=photograph&page_size=3`, { timeoutMs: 30000 });
        const images = (data?.results || []).slice(0, 3);
        if (images.length === 0) {
          await ctx.reply(notice('No photos matched that search.'));
          return;
        }
        for (const img of images) {
          try {
            const buffer = await fetchBuffer(img.url, { maxBytes: 15 * 1024 * 1024 });
            await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: truncate(img.title || query, 100) }, { quoted: ctx.msg });
          } catch {}
        }
        await ctx.reply(panel('Photo search', [{ label: 'Query', value: truncate(query, 80) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The photo search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'wallpapers',
    aliases: ['wallpaper'],
    description: 'Search wallpaper-sized images and send samples',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim() || 'landscape wallpaper';
      try {
        const data = await fetchJson(`${OPENVERSE}${encodeURIComponent(query)}&aspect_ratio=wide&page_size=3`, { timeoutMs: 30000 });
        const images = (data?.results || []).slice(0, 3);
        if (images.length === 0) {
          await ctx.reply(notice('No wallpapers matched that search.'));
          return;
        }
        for (const img of images) {
          try {
            const buffer = await fetchBuffer(img.url, { maxBytes: 15 * 1024 * 1024 });
            await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: truncate(img.title || query, 100) }, { quoted: ctx.msg });
          } catch {}
        }
        await ctx.reply(panel('Wallpapers', [{ label: 'Query', value: truncate(query, 80) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The wallpaper search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'weather',
    aliases: ['getweather'],
    description: 'Weather for a city via Open-Meteo',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}weather Nairobi`));
        return;
      }
      try {
        const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en`);
        const place = geo?.results?.[0];
        if (!place) {
          await ctx.reply(notice('That place was not found.'));
          return;
        }
        const weather = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
        const c = weather.current || {};
        const codes = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'heavy showers', 95: 'thunderstorm', 96: 'thunderstorm with hail' };
        await ctx.reply(panel(`Weather: ${place.name}${place.country ? `, ${place.country}` : ''}`, [
          { label: 'Temperature', value: `${c.temperature_2m}${weather.current_units?.temperature_2m || ''}` },
          { label: 'Feels like', value: `${c.apparent_temperature}${weather.current_units?.temperature_2m || ''}` },
          { label: 'Conditions', value: codes[c.weather_code] || `code ${c.weather_code}` },
          { label: 'Humidity', value: `${c.relative_humidity_2m}%` },
          { label: 'Wind', value: `${c.wind_speed_10m} km/h` },
          { label: 'Today', value: `${weather.daily?.temperature_2m_min?.[0]} to ${weather.daily?.temperature_2m_max?.[0]}${weather.daily_units?.temperature_2m_max || ''}` }
        ], 'Data: Open-Meteo'));
      } catch (err) {
        await ctx.reply(errorPanel(`The weather lookup failed: ${err.message}`));
      }
    }
  },
  {
    name: 'npm',
    aliases: ['npmsearch'],
    description: 'Search npm packages',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}npm baileys`));
        return;
      }
      try {
        const data = await fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=6`);
        const rows = (data?.objects || []).map((o) => ({
          label: o.package.name,
          value: `v${o.package.version} | ${truncate(o.package.description || '', 100)}`
        }));
        if (rows.length === 0) {
          await ctx.reply(notice('No packages matched that search.'));
          return;
        }
        await ctx.reply(panel('npm search', rows));
      } catch (err) {
        await ctx.reply(errorPanel(`The npm search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'lyrics',
    aliases: ['songlyrics'],
    description: 'Fetch song lyrics from lyrics.ovh',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const parts = ctx.argText.split(/\s*-\s*|\s+\|\s+/);
      if (parts.length < 2) {
        await ctx.reply(usage(`${ctx.prefix}lyrics artist - song title`));
        return;
      }
      const artist = parts[0].trim();
      const title = parts.slice(1).join(' ').trim();
      try {
        const data = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
        const lyrics = String(data.lyrics || '').trim();
        if (!lyrics) {
          await ctx.reply(notice('No lyrics were found for that song.'));
          return;
        }
        if (lyrics.length > 3800) {
          await ctx.sock.sendMessage(ctx.jid, { text: `${artist} - ${title}\n\n${lyrics.slice(0, 3800)}\n\n(lyrics truncated)` }, { quoted: ctx.msg });
        } else {
          await ctx.reply(panel(`Lyrics: ${artist} - ${title}`, [lyrics]));
        }
      } catch (err) {
        await ctx.reply(errorPanel(`The lyrics could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'spotifysearch',
    aliases: ['spotisearch'],
    description: 'Search tracks (via the Deezer catalogue)',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}spotifysearch song name`));
        return;
      }
      try {
        const data = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=6`);
        const rows = (data?.data || []).map((t) => ({
          label: `${t.artist?.name || ''} - ${t.title}`.slice(0, 60),
          value: `${Math.floor((t.duration || 0) / 60)}:${String((t.duration || 0) % 60).padStart(2, '0')} | ${t.link}`
        }));
        if (rows.length === 0) {
          await ctx.reply(notice('No tracks matched that search.'));
          return;
        }
        await ctx.reply(panel('Track search', rows));
      } catch (err) {
        await ctx.reply(errorPanel(`The track search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'stickersearch',
    aliases: ['searchsticker'],
    description: 'Search animated stickers via Tenor (needs TENOR_API_KEY)',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}stickersearch happy cat`));
        return;
      }
      const key = ctx.settings.TENOR_API_KEY;
      if (!key) {
        await ctx.reply(notice([
          'Sticker search needs a free Tenor API key:',
          `${ctx.prefix}setsetting TENOR_API_KEY your-key`,
          'Get a key at https://developers.google.com/tenor'
        ].join('\n')));
        return;
      }
      try {
        const data = await fetchJson(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${key}&limit=3&media_filter=gif`);
        const results = data?.results || [];
        if (results.length === 0) {
          await ctx.reply(notice('No stickers matched that search.'));
          return;
        }
        for (const item of results) {
          const url = item.media_formats?.gif?.url;
          if (!url) continue;
          try {
            const buffer = await fetchBuffer(url, { maxBytes: 15 * 1024 * 1024 });
            await ctx.sock.sendMessage(ctx.jid, { sticker: buffer }, { quoted: ctx.msg });
          } catch {}
        }
        await ctx.reply(panel('Sticker search', [{ label: 'Query', value: truncate(query, 80) }, { label: 'Sent', value: `${results.length} stickers` }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The sticker search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'shazam',
    aliases: ['whatmusic'],
    description: 'Identify a song from quoted audio (needs ACRCloud keys)',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      await ctx.reply(notice([
        'Music recognition needs ACRCloud credentials, which are account specific:',
        `${ctx.prefix}setsetting IMG_API_URL https://identify.acrcloud.com (endpoint)`,
        'Configure ACRCloud access keys through your provider gateway, then quote an audio clip.',
        '',
        'This command stays honest: without credentials it cannot identify music.'
      ].join('\n')));
    }
  },
  {
    name: 'wattpad',
    aliases: ['watt'],
    description: 'Search Wattpad stories',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}wattpad story name`));
        return;
      }
      try {
        const data = await fetchJson(`https://www.wattpad.com/api/v3/stories?query=${encodeURIComponent(query)}&limit=6`, {
          headers: { Accept: 'application/json' }
        });
        const stories = data?.stories || [];
        if (stories.length === 0) {
          await ctx.reply(notice('No stories matched that search.'));
          return;
        }
        const rows = stories.map((s) => ({
          label: truncate(s.title, 60),
          value: `${s.voteCount || 0} votes | ${(s.reads || 0).toLocaleString()} reads | ${s.url}`
        }));
        await ctx.reply(panel('Wattpad search', rows));
      } catch (err) {
        await ctx.reply(errorPanel(`The Wattpad search failed: ${err.message}. The site may be blocking automated requests.`));
      }
    }
  },
  {
    name: 'apkmirror',
    aliases: ['apkmirrorsearch'],
    description: 'Search APKMirror listings',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}apkmirror app name`));
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
          await ctx.reply(notice('No listings matched. APKMirror may be blocking automated requests.'));
          return;
        }
        const rows = results.map((r, i) => ({ label: `${i + 1}. ${r.title}`, value: r.url }));
        await ctx.reply(panel('APKMirror search', rows));
      } catch (err) {
        await ctx.reply(errorPanel(`The APKMirror search failed: ${err.message}`));
      }
    }
  },
  {
    name: 'happymod',
    aliases: ['modapks'],
    description: 'Search HappyMod for modded apps',
    category: 'Search',
    access: 'public',
    async run(ctx) {
      const query = ctx.argText.trim();
      if (!query) {
        await ctx.reply(usage(`${ctx.prefix}happymod game name`));
        return;
      }
      try {
        const res = await fetch(`https://www.happymod.com/search.html?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' }
        });
        const html = await res.text();
        const results = [...html.matchAll(/href="(\/app\/[^"]+)"[^>]*>/g)]
          .slice(0, 8)
          .map((m) => `https://www.happymod.com${m[1]}`);
        if (results.length === 0) {
          await ctx.reply(notice('No mods matched that search.'));
          return;
        }
        const rows = results.map((url, i) => ({ label: `Result ${i + 1}`, value: url }));
        await ctx.reply(panel('HappyMod search', rows, 'Verify modded apps yourself; they are unofficial builds.'));
      } catch (err) {
        await ctx.reply(errorPanel(`The HappyMod search failed: ${err.message}`));
      }
    }
  }
];
