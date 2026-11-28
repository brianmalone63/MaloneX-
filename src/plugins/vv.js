import { panel, errorPanel } from '../commands/format.js';
import { deliverViewOnce } from '../features/vv.js';

const MAX_BYTES = 16 * 1024 * 1024;

export default {
  name: 'vv',
  description: 'Reply to a view-once photo, video or voice note to receive it',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      await ctx.reply(errorPanel('Reply to a view-once photo, video or voice note with this command.'));
      return;
    }
    const result = await deliverViewOnce({
      quoted,
      sock: ctx.sock,
      ownerJid: ctx.session.ownJid,
      sourceJid: ctx.jid,
      destination: ctx.session.settings.vv_destination || 'self',
      download: ctx.downloadMediaMessage,
      maxBytes: MAX_BYTES
    });
    if (!result.ok) {
      await ctx.reply(errorPanel(result.error));
      return;
    }
    await ctx.reply(panel('View once', [{ label: 'Delivered', value: result.where }]));
  }
};
