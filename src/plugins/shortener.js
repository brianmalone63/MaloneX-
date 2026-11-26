import { panel, notice, usage, error as errorPanel } from '../core/format.js';

// Keyless URL shorteners with documented public endpoints.
const SERVICES = {
  tinyurl: {
    name: 'TinyURL',
    aliases: ['tiny'],
    shorten: async (url) => {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
  },
  cleanuri: {
    name: 'CleanURI',
    aliases: ['cleanurl'],
    shorten: async (url) => {
      const res = await fetch('https://cleanuri.com/api/v1/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!data.result_url) throw new Error(data.error || 'no result');
      return data.result_url;
    }
  },
  vgd: {
    name: 'v.gd',
    aliases: ['vgdurl'],
    shorten: async (url) => {
      const res = await fetch(`https://v.gd/create.php?url=${encodeURIComponent(url)}&format=simple`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
  },
  isgd: {
    name: 'is.gd',
    aliases: ['isgdurl'],
    shorten: async (url) => {
      const res = await fetch(`https://is.gd/create.php?url=${encodeURIComponent(url)}&format=simple`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
  },
  adfoc: {
    name: 'AdFoc.us',
    aliases: ['adfocus'],
    shorten: async (url) => {
      const res = await fetch(`https://adfoc.us/serve/?api=1&url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
  }
};

function normalize(url) {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+/.test(url)) return `https://${url}`;
  return null;
}

const commands = [
  {
    name: 'shorteners',
    aliases: [],
    description: 'List the available URL shorteners',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const rows = Object.entries(SERVICES).map(([name, svc]) => ({ label: `${ctx.prefix}${name}`, value: svc.name }));
      await ctx.reply(panel('URL shorteners', rows, `Usage: ${ctx.prefix}tinyurl https://example.com`));
    }
  }
];

for (const [name, svc] of Object.entries(SERVICES)) {
  commands.push({
    name,
    aliases: svc.aliases,
    description: `Shorten a URL using ${svc.name}`,
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const raw = ctx.argText.trim();
      const url = normalize(raw);
      if (!url) {
        await ctx.reply(usage(`${ctx.prefix}${name} https://example.com`));
        return;
      }
      try {
        const short = String(await svc.shorten(url)).trim();
        if (!short || !/^https?:\/\//i.test(short)) throw new Error('empty response');
        await ctx.reply(panel(`${svc.name} shortener`, [
          { label: 'Original', value: url.slice(0, 90) },
          { label: 'Shortened', value: short }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The URL could not be shortened: ${err.message}`));
      }
    }
  });
}

export default commands;
