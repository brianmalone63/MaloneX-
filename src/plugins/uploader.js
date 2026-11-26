import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { formatBytes } from '../core/media.js';

export default [
  {
    name: 'tourl',
    aliases: ['url'],
    description: 'Upload a quoted image, video, audio or document and get a link',
    category: 'Uploader',
    access: 'public',
    async run(ctx) {
      const mediaType = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']
        .find((k) => ctx.quotedInner?.[k]);
      if (!ctx.quoted || !mediaType) {
        await ctx.reply(usage(`Reply to any media with ${ctx.prefix}tourl to host it.`));
        return;
      }
      try {
        await ctx.reply(notice('Uploading...'));
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const url = await uploadToCatbox(buffer);
        const meta = ctx.quotedInner[mediaType] || {};
        await ctx.reply(panel('Upload complete', [
          { label: 'URL', value: url },
          { label: 'Size', value: formatBytes(buffer.length) },
          { label: 'Name', value: meta.fileName || mediaType.replace('Message', '') }
        ]));
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The upload failed: ${err.message}`));
      }
    }
  },
  {
    name: 'catbox',
    aliases: [],
    description: 'Upload quoted media to Catbox (permanent link)',
    category: 'Uploader',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted) {
        await ctx.reply(usage(`Reply to media with ${ctx.prefix}catbox.`));
        return;
      }
      try {
        await ctx.reply(notice('Uploading to Catbox...'));
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const url = await uploadToCatbox(buffer);
        await ctx.reply(panel('Catbox', [{ label: 'URL', value: url }, { label: 'Size', value: formatBytes(buffer.length) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The Catbox upload failed: ${err.message}`));
      }
    }
  },
  {
    name: 'imgbb',
    aliases: [],
    description: 'Upload a quoted image to ImgBB (needs IMGBB_KEY)',
    category: 'Uploader',
    access: 'public',
    async run(ctx) {
      const key = ctx.settings.IMGBB_KEY;
      if (!key) {
        await ctx.reply(notice([
          'ImgBB uploads need a free API key:',
          `${ctx.prefix}setsetting IMGBB_KEY your-key`,
          'Get one at https://api.imgbb.com. Use .tourl for keyless uploads.'
        ].join('\n')));
        return;
      }
      if (!ctx.quoted || !['imageMessage', 'stickerMessage'].some((k) => ctx.quotedInner?.[k])) {
        await ctx.reply(usage(`Reply to an image with ${ctx.prefix}imgbb.`));
        return;
      }
      try {
        await ctx.reply(notice('Uploading to ImgBB...'));
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const form = new FormData();
        form.append('image', new Blob([new Uint8Array(buffer)]), 'image.png');
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, { method: 'POST', body: form });
        const data = await res.json();
        if (!data?.data?.url) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        await ctx.reply(panel('ImgBB', [
          { label: 'URL', value: data.data.url },
          { label: 'Delete URL', value: data.data.delete_url || 'n/a' }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The ImgBB upload failed: ${err.message}`));
      }
    }
  },
  {
    name: 'pixhost',
    aliases: [],
    description: 'Upload a quoted image to Pixhost (keyless image host)',
    category: 'Uploader',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted || !['imageMessage', 'stickerMessage'].some((k) => ctx.quotedInner?.[k])) {
        await ctx.reply(usage(`Reply to an image with ${ctx.prefix}pixhost.`));
        return;
      }
      try {
        await ctx.reply(notice('Uploading to Pixhost...'));
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const form = new FormData();
        form.append('img', new Blob([new Uint8Array(buffer)]), 'image.png');
        form.append('content_type', '0');
        const res = await fetch('https://api.pixhost.to/images', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.show_url) throw new Error('no show_url returned');
        await ctx.reply(panel('Pixhost', [
          { label: 'Page', value: data.show_url },
          { label: 'Direct', value: `https://img1.pixhost.to/images/${String(data.id).slice(0, 3)}/${data.id}_${data.name || 'image'}.png` }
        ], 'Open the page link if the direct guess differs.'));
      } catch (err) {
        await ctx.reply(errorPanel(`The Pixhost upload failed: ${err.message}`));
      }
    }
  }
];

async function uploadToCatbox(buffer) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([new Uint8Array(buffer)]), 'malonex-upload');
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const url = (await res.text()).trim();
  if (!/^https?:\/\//.test(url)) throw new Error('catbox returned an unexpected response');
  return url;
}
