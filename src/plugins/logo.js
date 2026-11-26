import { panel, usage, error as errorPanel } from '../core/format.js';
import { renderSvg, makeSticker } from '../core/media.js';

// Original MaloneX text logos, rendered locally with vector graphics. No
// external logo service is involved, so these always work.
function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fontSize(text) {
  const len = String(text).length;
  if (len <= 6) return 110;
  if (len <= 12) return 72;
  if (len <= 20) return 48;
  return 34;
}

const LOGO_STYLES = {
  neon: {
    description: 'Neon glow text on dark background',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect width="512" height="512" rx="40" fill="#0b0f14"/>
      <text x="256" y="256" filter="url(#glow)" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="#38e8ff" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  fire: {
    description: 'Warm gradient text on an ember background',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9d3f"/><stop offset="1" stop-color="#e6252c"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#14090a"/>
      <text x="256" y="256" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="url(#g)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  silver: {
    description: 'Polished silver metal text',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.5" stop-color="#9aa5af"/><stop offset="1" stop-color="#dfe6ec"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#1a1f24"/>
      <text x="256" y="256" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="url(#s)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  gold: {
    description: 'Gold foil text',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9d976"/><stop offset="0.5" stop-color="#c69b3c"/><stop offset="1" stop-color="#f7e7a1"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#141005"/>
      <text x="256" y="256" font-family="serif" font-weight="700" font-size="${fontSize(text)}" fill="url(#g)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  glitch: {
    description: 'Glitch effect with chromatic offsets',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="40" fill="#0a0d12"/>
      <text x="252" y="256" font-family="monospace" font-weight="700" font-size="${fontSize(text)}" fill="#ff2f6d" text-anchor="middle" dominant-baseline="middle" opacity="0.75">${escapeText(text)}</text>
      <text x="260" y="256" font-family="monospace" font-weight="700" font-size="${fontSize(text)}" fill="#2fd8ff" text-anchor="middle" dominant-baseline="middle" opacity="0.75">${escapeText(text)}</text>
      <text x="256" y="256" font-family="monospace" font-weight="700" font-size="${fontSize(text)}" fill="#eef2f6" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  ice: {
    description: 'Frozen glass text',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe9ff"/><stop offset="1" stop-color="#4aa8d8"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#0d1b26"/>
      <circle cx="90" cy="420" r="26" fill="#bfe9ff" opacity="0.12"/><circle cx="430" cy="90" r="34" fill="#bfe9ff" opacity="0.12"/>
      <text x="256" y="256" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="url(#i)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  matrix: {
    description: 'Terminal green code style',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="40" fill="#02120a"/>
      <text x="256" y="256" font-family="monospace" font-weight="700" font-size="${fontSize(text)}" fill="#39ff88" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  sunset: {
    description: 'Pastel sunset gradient text',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9a8b"/><stop offset="0.5" stop-color="#ff6a88"/><stop offset="1" stop-color="#ff99ac"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#221423"/>
      <text x="256" y="256" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="url(#s)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  ocean: {
    description: 'Deep ocean gradient text',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43cea2"/><stop offset="1" stop-color="#185a9d"/></linearGradient></defs>
      <rect width="512" height="512" rx="40" fill="#07141d"/>
      <text x="256" y="256" font-family="sans-serif" font-weight="800" font-size="${fontSize(text)}" fill="url(#o)" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  },
  royal: {
    description: 'Crowned serif monogram',
    render: (text) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="40" fill="#120a1f"/>
      <text x="256" y="110" font-family="serif" font-size="72" fill="#b990ff" text-anchor="middle">CROWN</text>
      <text x="256" y="286" font-family="serif" font-weight="700" font-size="${fontSize(text)}" fill="#e6d3ff" text-anchor="middle" dominant-baseline="middle">${escapeText(text)}</text>
    </svg>`
  }
};

const commands = [
  {
    name: 'logolist',
    aliases: ['logos'],
    description: 'List every local text-logo style',
    category: 'Logo',
    access: 'public',
    async run(ctx) {
      const rows = Object.entries(LOGO_STYLES).map(([name, style]) => ({ label: `${ctx.prefix}${name} your text`, value: style.description }));
      await ctx.reply(panel('MaloneX text logos', rows, 'All logos are rendered locally; no external service is used.'));
    }
  }
];

for (const [name, style] of Object.entries(LOGO_STYLES)) {
  commands.push({
    name,
    aliases: [`${name}logo`],
    description: `Create a ${style.description.toLowerCase()}`,
    category: 'Logo',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim().slice(0, 24);
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}${name} your text`));
        return;
      }
      try {
        const svg = style.render(text);
        const png = await renderSvg(svg);
        const sticker = await makeSticker(png, { pack: ctx.packName, author: ctx.packAuthor });
        await ctx.sock.sendMessage(ctx.jid, { sticker }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`The logo could not be rendered: ${err.message}`));
      }
    }
  });
}

export default commands;
