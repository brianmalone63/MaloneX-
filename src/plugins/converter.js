import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { makeSticker, stickerToImage, toAudio, toPtt, toVideo } from '../core/media.js';

export default [
  {
    name: 'sticker',
    aliases: ['st', 'take'],
    description: 'Convert a quoted image, video or sticker into a sticker (add crop for a square cut)',
    category: 'Converter',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted) {
        await ctx.reply(usage(`Reply to an image, video or sticker with ${ctx.prefix}sticker.`));
        return;
      }
      const mediaType = ['imageMessage', 'videoMessage', 'stickerMessage']
        .find((k) => ctx.quotedInner?.[k]);
      if (!mediaType) {
        await ctx.reply(errorPanel('The quoted message is not an image, video or sticker.'));
        return;
      }
      try {
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        if (!buffer?.length) throw new Error('download failed');
        const sticker = await makeSticker(buffer, {
          pack: ctx.packName,
          author: ctx.packAuthor,
          crop: /crop|-c/i.test(ctx.argText) && mediaType === 'imageMessage'
        });
        await ctx.sock.sendMessage(ctx.jid, { sticker }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The sticker could not be created: ${err.message}`));
      }
    }
  },
  {
    name: 'toimg',
    aliases: ['s2img'],
    description: 'Convert a quoted sticker into an image',
    category: 'Converter',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted || !ctx.quotedInner?.stickerMessage) {
        await ctx.reply(usage(`Reply to a sticker with ${ctx.prefix}toimg.`));
        return;
      }
      try {
        const webp = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const image = await stickerToImage(webp);
        await ctx.sock.sendMessage(ctx.jid, { image, caption: `Sticker converted via ${ctx.botName}` }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The sticker could not be converted: ${err.message}`));
      }
    }
  },
  {
    name: 'toaudio',
    aliases: ['tomp3'],
    description: 'Extract the audio of a quoted video as MP3',
    category: 'Converter',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted || !ctx.quotedInner?.videoMessage) {
        await ctx.reply(usage(`Reply to a video with ${ctx.prefix}toaudio.`));
        return;
      }
      try {
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const audio = await toAudio(buffer);
        await ctx.sock.sendMessage(ctx.jid, { audio, mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        const reason = /no audio/i.test(err.message) ? 'This video has no audio track.' : err.message;
        await ctx.reply(errorPanel(`The conversion failed: ${reason}`));
      }
    }
  },
  {
    name: 'toptt',
    aliases: ['tovoice', 'tovn'],
    description: 'Convert a quoted audio into a voice note',
    category: 'Converter',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted || !ctx.quotedInner?.audioMessage) {
        await ctx.reply(usage(`Reply to an audio message with ${ctx.prefix}toptt.`));
        return;
      }
      try {
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const ogg = await toPtt(buffer);
        await ctx.sock.sendMessage(ctx.jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The voice note could not be created: ${err.message}`));
      }
    }
  },
  {
    name: 'tovideo',
    aliases: ['tomp4', 'blackscreen'],
    description: 'Turn a quoted audio into a video with a black frame',
    category: 'Converter',
    access: 'public',
    async run(ctx) {
      if (!ctx.quoted || !ctx.quotedInner?.audioMessage) {
        await ctx.reply(usage(`Reply to an audio message with ${ctx.prefix}tovideo.`));
        return;
      }
      try {
        const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted });
        const mp4 = await toVideo(buffer);
        await ctx.sock.sendMessage(ctx.jid, { video: mp4, mimetype: 'video/mp4' }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The video could not be created: ${err.message}`));
      }
    }
  }
];
