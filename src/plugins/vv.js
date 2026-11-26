import { downloadMediaMessage, jidNormalizedUser } from '../baileys.js';
import { panel, usage, error as errorPanel, caption } from '../core/format.js';

const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];

// Hard limit for retrieved media.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const MEDIA_TYPES = {
  imageMessage: { sendAs: 'image', label: 'image' },
  videoMessage: { sendAs: 'video', label: 'video' },
  audioMessage: { sendAs: 'audio', label: 'audio' },
  stickerMessage: { sendAs: 'sticker', label: 'sticker' },
  documentMessage: { sendAs: 'document', label: 'document' }
};

// Injectable downloader so tests can substitute a fake download function.
export const internals = { downloadMediaMessage };

// Unwrap viewOnceMessage / viewOnceMessageV2 / viewOnceMessageV2Extension
// containers and return the inner message object. Messages that are not
// wrapped in a view-once container return null so plain media quotes are
// rejected with a clear error.
export function unwrapViewOnce(message) {
  if (!message || typeof message !== 'object') return null;
  let m = message;
  let wrapped = false;
  for (let i = 0; i < 5 && m && typeof m === 'object'; i++) {
    const key = VIEW_ONCE_KEYS.find((k) => m[k] && m[k].message);
    if (!key) break;
    wrapped = true;
    m = m[key].message;
  }
  return wrapped && m && typeof m === 'object' ? m : null;
}

function humanSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default [
  {
    name: 'vv',
    aliases: ['viewonce'],
    description: 'Retrieve a view-once photo, video or audio (reply to the message)',
    category: 'Automation',
    access: 'owner',
    async run(ctx) {
      const { msg, session, settings, config, sock } = ctx;
      const quotedRaw = ctx.quoted;
      if (!quotedRaw) {
        await ctx.reply(usage(`Reply to a view-once message with ${config.prefix}vv to retrieve it.`));
        return;
      }
      const inner = unwrapViewOnce(quotedRaw);
      if (!inner) {
        await ctx.reply(errorPanel('The quoted message is not a view-once message.'));
        return;
      }
      const contentKey = Object.keys(inner).find((k) => MEDIA_TYPES[k]);
      if (!contentKey) {
        await ctx.reply(errorPanel('The quoted view-once message contains no supported media.'));
        return;
      }

      let buffer;
      try {
        buffer = await internals.downloadMediaMessage(
          { key: msg.key, message: quotedRaw },
          'buffer',
          { logger: ctx.logger, reuploadRequest: sock.updateMediaMessage?.bind(sock) }
        );
      } catch (err) {
        session.health.errors += 1;
        session.health.lastError = err.message;
        ctx.logger.warn(`view-once download failed: ${err.message}`);
        await ctx.reply(errorPanel('The media could not be downloaded. It may have expired or been deleted by the sender.'));
        return;
      }
      if (!buffer || !buffer.length) {
        await ctx.reply(errorPanel('The media could not be downloaded. It may have expired or been deleted by the sender.'));
        return;
      }
      if (buffer.length > MAX_MEDIA_BYTES) {
        await ctx.reply(errorPanel('The media is larger than 16 MB and cannot be retrieved.'));
        return;
      }

      const meta = MEDIA_TYPES[contentKey];
      const mediaObject = inner[contentKey] || {};
      const captionText = caption(`${meta.label} · ${humanSize(buffer.length)}`);
      const payload = { [meta.sendAs]: buffer };
      if (meta.sendAs === 'image' || meta.sendAs === 'video') payload.caption = captionText;
      if (mediaObject.mimetype) payload.mimetype = mediaObject.mimetype;
      if (meta.sendAs === 'audio' && mediaObject.ptt) payload.ptt = true;
      if (meta.sendAs === 'document') payload.fileName = mediaObject.fileName || 'view-once-media';

      // Default destination is the owner's own chat (the linked number);
      // vv_destination=chat sends the media back into the source chat.
      const destination = settings.vv_destination === 'chat'
        ? ctx.jid
        : (session.ownJid || ctx.sender || jidNormalizedUser(ctx.jid));

      try {
        await sock.sendMessage(destination, payload);
      } catch (err) {
        session.health.errors += 1;
        session.health.lastError = err.message;
        ctx.logger.warn(`view-once delivery failed: ${err.message}`);
        await ctx.reply(errorPanel('The media was downloaded but could not be delivered.')).catch(() => {});
        return;
      }
      if (destination !== ctx.jid) {
        await ctx.reply(panel('View-once', [
          { label: 'Delivered to', value: 'your own chat' },
          { label: 'Type', value: `${meta.label} · ${humanSize(buffer.length)}` }
        ]));
      }
    }
  },
  {
    name: 'vvmode',
    description: 'Choose where retrieved view-once media is delivered: self or chat',
    category: 'Automation',
    access: 'owner',
    async run(ctx) {
      const mode = (ctx.args[0] || '').toLowerCase();
      if (mode !== 'self' && mode !== 'chat') {
        await ctx.reply(usage(`Use ${ctx.config.prefix}vvmode self|chat. self delivers to your own chat, chat replies in the source chat.`));
        return;
      }
      const result = await ctx.session.setSetting('vv_destination', mode);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('View-once delivery', [
        { label: 'Destination', value: ctx.session.settings.vv_destination }
      ]));
    }
  }
];
