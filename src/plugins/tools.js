import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchBuffer, fetchJson, tempFile, renderSvg, makeSticker, fancyLocal, formatBytes, isTextMime, getMimeFromUrl, USER_AGENT } from '../core/media.js';
import AdmZip from 'adm-zip';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimal standards-compliant single-file PDF writer for text content.
// Produces a real PDF 1.4 document with Helvetica text, one page per chunk.
export function buildTextPdf(title, lines) {
  const escape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const perPage = 46;
  const pages = [];
  for (let i = 0; i < Math.max(1, Math.ceil(lines.length / perPage)); i++) {
    pages.push(lines.slice(i * perPage, (i + 1) * perPage));
  }
  const objects = [];
  const pageIds = [];
  const contentIds = [];
  // 1 catalog, 2 pages tree, 3 font; pages start at 4.
  pages.forEach((_, index) => {
    pageIds.push(4 + index * 2);
    contentIds.push(5 + index * 2);
  });
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pages.forEach((pageLines, index) => {
    const stream = [
      'BT',
      '/F1 11 Tf',
      '14 TL',
      '48 800 Td',
      escape(title).slice(0, 80),
      '/F1 10 Tf',
      ...pageLines.map((line) => `(${escape(line)}) Tj T*`),
      'ET'
    ].join('\n');
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index]] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) continue;
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  const maxId = objects.length;
  pdf += `xref\n0 ${maxId}\n0000000000 65535 f \n`;
  for (let id = 1; id < maxId; id++) {
    pdf += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

async function quotedImageBuffer(ctx) {
  if (ctx.mediaType !== 'imageMessage' || !ctx.quoted) return null;
  const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
  return buffer && buffer.length ? buffer : null;
}

function screenshotUrl(url, variant) {
  const widths = { desktop: 1280, pc: 1280, mobile: 420, tablet: 800 };
  const width = widths[variant] || 1280;
  return `https://image.thum.io/get/width/${width}/crop/900/${url}`;
}

export default [
  {
    name: 'fetch',
    aliases: ['get'],
    description: 'Fetch a URL and show its content or send the file',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim() || ctx.quotedText?.match(/https?:\/\/[^\s]+/i)?.[0];
      if (!url || !/^https?:\/\//i.test(url)) {
        await ctx.reply(usage(`${ctx.prefix}fetch https://example.com`));
        return;
      }
      try {
        await ctx.reply(notice('Fetching...'));
        const buffer = await fetchBuffer(url, { maxBytes: 50 * 1024 * 1024 });
        const contentType = getMimeFromUrl(url);
        if (isTextMime(contentType)) {
          const text = buffer.toString('utf8');
          if (text.length > 3800) {
            await ctx.sock.sendMessage(ctx.jid, { document: buffer, fileName: url.split('/').pop() || 'content', mimetype: 'text/plain' }, { quoted: ctx.msg });
          } else {
            await ctx.reply(panel(`Content of ${url.slice(0, 60)}`, [text]));
          }
        } else {
          const filename = url.split('/').pop()?.split('?')[0] || 'file';
          await ctx.sock.sendMessage(ctx.jid, { document: buffer, fileName: filename, mimetype: contentType }, { quoted: ctx.msg });
          await ctx.reply(panel('Fetched', [{ label: 'Size', value: formatBytes(buffer.length) }]));
        }
      } catch (err) {
        await ctx.reply(errorPanel(`The URL could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'ssweb',
    aliases: ['fullssweb'],
    description: 'Screenshot a website (desktop width)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await screenshot(ctx, 'desktop');
    }
  },
  {
    name: 'ssphone',
    aliases: ['ssmobile'],
    description: 'Screenshot a website (mobile width)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await screenshot(ctx, 'mobile');
    }
  },
  {
    name: 'sstab',
    aliases: ['sstablet'],
    description: 'Screenshot a website (tablet width)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await screenshot(ctx, 'tablet');
    }
  },
  {
    name: 'sspc',
    aliases: ['pcss'],
    description: 'Screenshot a website (PC width)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await screenshot(ctx, 'pc');
    }
  },
  {
    name: 'createqr',
    aliases: ['toqr'],
    description: 'Generate a QR code from text or a link',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}createqr your text or link`));
        return;
      }
      if (text.length > 1000) {
        await ctx.reply(errorPanel('QR content is limited to 1000 characters.'));
        return;
      }
      const buffer = await QRCode.toBuffer(text, { width: 512, margin: 2 });
      await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: `QR code for ${text.slice(0, 60)}` }, { quoted: ctx.msg });
    }
  },
  {
    name: 'readqr',
    aliases: ['decodeqr'],
    description: 'Decode a QR code from a quoted image',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const buffer = await quotedImageBuffer(ctx);
      if (!buffer) {
        await ctx.reply(usage(`Reply to a QR image with ${ctx.prefix}readqr.`));
        return;
      }
      try {
        const png = (await import('sharp')).default;
        const { data, info } = await png(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
        if (!result?.data) {
          await ctx.reply(notice('No QR code was detected in that image.'));
          return;
        }
        await ctx.reply(panel('QR decoded', [result.data.slice(0, 600)], `Format: ${result.result.binary ? 'binary' : 'text'}`));
      } catch (err) {
        await ctx.reply(errorPanel(`The QR could not be decoded: ${err.message}`));
      }
    }
  },
  {
    name: 'ttp',
    aliases: ['textpic'],
    description: 'Render text into a sticker',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim().slice(0, 60);
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}ttp your text`));
        return;
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="64" fill="#101418"/>
        <text x="256" y="256" font-family="sans-serif" font-size="${text.length > 16 ? 34 : 52}" fill="#f5f7fa" text-anchor="middle" dominant-baseline="middle" font-weight="700">${escapeHtml(text)}</text>
      </svg>`;
      try {
        const png = await renderSvg(svg);
        const sticker = await makeSticker(png, { pack: ctx.packName, author: ctx.packAuthor });
        await ctx.sock.sendMessage(ctx.jid, { sticker }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`The sticker could not be rendered: ${err.message}`));
      }
    }
  },
  {
    name: 'fancy',
    aliases: ['fancytext'],
    description: 'Convert text into several styled fonts',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}fancy your text`));
        return;
      }
      const rows = fancyLocal(text).map((v) => ({ label: v.name, value: v.result }));
      await ctx.reply(panel('Fancy text', rows));
    }
  },
  {
    name: 'emojimix',
    aliases: ['emomix'],
    description: 'Mix two emojis into one (community Emoji Kitchen service)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const parts = ctx.argText.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await ctx.reply(usage(`${ctx.prefix}emojimix first-emoji second-emoji`));
        return;
      }
      const [e1, e2] = parts;
      try {
        const url = `https://emojik.vercel.app/api/emojimix?e1=${encodeURIComponent(e1)}&e2=${encodeURIComponent(e2)}`;
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 100) throw new Error('that pair has no mixed emoji');
        const sticker = await makeSticker(buffer, { pack: ctx.packName, author: ctx.packAuthor });
        await ctx.sock.sendMessage(ctx.jid, { sticker }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`That emoji pair cannot be mixed (${err.message}).`));
      }
    }
  },
  {
    name: 'rename',
    aliases: ['newname'],
    description: 'Re-send a quoted document with a new file name',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const newName = ctx.argText.trim();
      if (!ctx.quoted || ctx.mediaType !== 'documentMessage' || !newName) {
        await ctx.reply(usage(`Reply to a document, then ${ctx.prefix}rename new-file-name.ext`));
        return;
      }
      try {
        const doc = ctx.quotedInner.documentMessage || {};
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const mimetype = doc.mimetype || getMimeFromUrl(newName);
        await ctx.sock.sendMessage(ctx.jid, { document: buffer, fileName: newName, mimetype }, { quoted: ctx.msg });
        await ctx.reply(panel('Renamed', [{ label: 'New name', value: newName }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The file could not be renamed: ${err.message}`));
      }
    }
  },
  {
    name: 'createpdf',
    aliases: ['topdf'],
    description: 'Create a PDF from text (one page per 46 lines)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}createpdf line one | line two | line three`));
        return;
      }
      const lines = text.split(/\s*\|\s*|\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
      const pdf = buildTextPdf('MaloneX PDF', lines);
      await ctx.sock.sendMessage(ctx.jid, {
        document: pdf,
        fileName: `malonex-${Date.now()}.pdf`,
        mimetype: 'application/pdf'
      }, { quoted: ctx.msg });
      await ctx.reply(panel('PDF created', [{ label: 'Lines', value: String(lines.length) }, { label: 'Pages', value: String(Math.ceil(lines.length / 46) || 1) }]));
    }
  },
  {
    name: 'domaincheck',
    aliases: ['domainstatus'],
    description: 'WHOIS-style domain data via the RDAP protocol',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const domain = ctx.argText.trim().replace(/^https?:\/\//, '').split('/')[0];
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) {
        await ctx.reply(usage(`${ctx.prefix}domaincheck example.com`));
        return;
      }
      try {
        const data = await fetchJson(`https://rdap.org/domain/${domain}`, { timeoutMs: 20000 });
        const events = Object.fromEntries((data.events || []).map((e) => [e.eventAction, e.date]));
        const registrar = (data.entities || []).find((e) => (e.roles || []).includes('registrar'));
        const registrarName = registrar?.vcardArray?.[1]?.find((f) => f[0] === 'fn')?.[3] || 'unknown';
        const statuses = (data.status || []).slice(0, 4).join(', ') || 'none';
        await ctx.reply(panel(`Domain: ${domain}`, [
          { label: 'Registrar', value: registrarName },
          { label: 'Registered', value: events.registration || 'unknown' },
          { label: 'Changed', value: events['last changed'] || 'unknown' },
          { label: 'Expires', value: events.expiration || 'unknown' },
          { label: 'Status', value: statuses }
        ], 'Data: RDAP'));
      } catch (err) {
        if (/404/.test(err.message)) {
          await ctx.reply(notice('That domain has no registration record (it may be unregistered).'));
          return;
        }
        await ctx.reply(errorPanel(`The domain lookup failed: ${err.message}`));
      }
    }
  },
  {
    name: 'web2zip',
    aliases: ['webtozip'],
    description: 'Download a web page with its assets as a zip archive',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const url = ctx.argText.trim();
      if (!/^https?:\/\//i.test(url)) {
        await ctx.reply(usage(`${ctx.prefix}web2zip https://example.com`));
        return;
      }
      try {
        await ctx.reply(notice('Archiving the page...'));
        const origin = new URL(url).origin;
        const html = (await fetchBuffer(url, { maxBytes: 10 * 1024 * 1024 })).toString('utf8');
        const zip = new AdmZip();
        zip.addFile('index.html', Buffer.from(html, 'utf8'));
        const assetUrls = [...new Set([
          ...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:css|js|png|jpe?g|gif|svg|ico|webp))"/gi)
        ].map((m) => `${origin}${m[1]}`))].slice(0, 40);
        let saved = 0;
        for (const asset of assetUrls) {
          try {
            const buffer = await fetchBuffer(asset, { maxBytes: 5 * 1024 * 1024 });
            zip.addFile(asset.replace(origin, '').slice(1), buffer);
            saved += 1;
          } catch {}
        }
        const host = new URL(url).hostname.replace(/\W+/g, '-');
        await ctx.sock.sendMessage(ctx.jid, {
          document: zip.toBuffer(),
          fileName: `${host}.zip`,
          mimetype: 'application/zip'
        }, { quoted: ctx.msg });
        await ctx.reply(panel('Page archive', [
          { label: 'Page', value: host },
          { label: 'Assets saved', value: `${saved} of ${assetUrls.length}` },
          { label: 'Note', value: 'Same-origin assets only; dynamic content is not captured.' }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The page could not be archived: ${err.message}`));
      }
    }
  },
  {
    name: 'define',
    aliases: ['meaning'],
    description: 'Look up the definition of a word (dictionaryapi.dev)',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      const word = ctx.argText.trim().replace(/[^A-Za-z'-]/g, '');
      if (!word) {
        await ctx.reply(usage(`${ctx.prefix}define serendipity`));
        return;
      }
      try {
        const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, { timeoutMs: 20000 });
        const entry = Array.isArray(data) ? data[0] : null;
        if (!entry) {
          await ctx.reply(notice(`No dictionary entry was found for "${word}".`));
          return;
        }
        const rows = [];
        for (const phonetic of entry.phonetics || []) {
          if (phonetic.text) {
            rows.push({ label: 'Phonetic', value: phonetic.text });
            break;
          }
        }
        for (const meaning of (entry.meanings || []).slice(0, 3)) {
          for (const definition of (meaning.definitions || []).slice(0, 2)) {
            rows.push({ label: `${meaning.partOfSpeech || 'meaning'}`, value: definition.definition.slice(0, 200) });
            if (definition.example) rows.push({ label: 'Example', value: definition.example.slice(0, 160) });
          }
        }
        if (rows.length === 0) {
          await ctx.reply(notice(`No definitions were returned for "${word}".`));
          return;
        }
        await ctx.reply(panel(`Define: ${entry.word || word}`, rows, 'Source: dictionaryapi.dev'));
      } catch (err) {
        if (/404/.test(err.message)) {
          await ctx.reply(notice(`"${word}" is not in the dictionary.`));
          return;
        }
        await ctx.reply(errorPanel(`The dictionary lookup failed: ${err.message}`));
      }
    }
  },
  {
    name: 'remini',
    aliases: ['enhance'],
    description: 'Enhance a quoted photo through your configured image provider',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await imageProviderCommand(ctx, 'enhance');
    }
  },
  {
    name: 'photoeditor',
    aliases: ['photoedit'],
    description: 'Edit a quoted photo with a prompt through your image provider',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      await imageProviderCommand(ctx, 'edit', ctx.argText.trim());
    }
  }
];

async function screenshot(ctx, variant) {
  const url = ctx.argText.trim();
  if (!/^https?:\/\//i.test(url) && !/^[\w-]+(\.[\w-]+)+/.test(url)) {
    await ctx.reply(usage(`${ctx.prefix}${ctx.command} example.com`));
    return;
  }
  const target = url.startsWith('http') ? url : `https://${url}`;
  try {
    await ctx.reply(notice('Capturing the screenshot...'));
    const buffer = await fetchBuffer(screenshotUrl(target, variant), { maxBytes: 20 * 1024 * 1024 });
    await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: `${target} (${variant} view)` }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply(errorPanel(`The screenshot failed: ${err.message}`));
  }
}

async function imageProviderCommand(ctx, mode, prompt = '') {
  const provider = ctx.settings.IMG_API_URL;
  if (!provider) {
    await ctx.reply(notice([
      'AI image tools need a configured provider.',
      `${ctx.prefix}setsetting IMG_API_URL https://your-image-api`,
      `${ctx.prefix}setsetting IMG_API_KEY your-key`,
      '',
      'The provider must accept POST {image_base64, prompt} and reply {image_base64}.'
    ].join('\n')));
    return;
  }
  const buffer = await quotedImageBuffer(ctx);
  if (!buffer) {
    await ctx.reply(usage(`Reply to a photo with ${ctx.prefix}${ctx.command}${prompt ? ' your prompt' : ''}.`));
    return;
  }
  try {
    await ctx.reply(notice('Processing the image...'));
    const res = await fetch(`${provider.replace(/\/+$/, '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ctx.settings.IMG_API_KEY ? { Authorization: `Bearer ${ctx.settings.IMG_API_KEY}` } : {}) },
      body: JSON.stringify({ image_base64: buffer.toString('base64'), prompt, mode })
    });
    const data = await res.json().catch(() => null);
    const out = data?.image_base64;
    if (!res.ok || !out) throw new Error(data?.error || `HTTP ${res.status}`);
    await ctx.sock.sendMessage(ctx.jid, { image: Buffer.from(out, 'base64'), caption: `${mode} via ${ctx.botName}` }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply(errorPanel(`The image provider failed: ${err.message}`));
  }
}
