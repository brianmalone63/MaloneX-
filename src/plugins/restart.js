export default {
  name: 'restart',
  description: 'Disconnect and reconnect the WhatsApp session cleanly',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    await ctx.reply(panel('Restart', [{ label: 'State', value: 'reconnecting now' }]));
    setTimeout(() => {
      ctx.session.restart().catch((err) => ctx.session.logError(`restart failed: ${err.message}`));
    }, 500);
  }
};

import { panel } from '../commands/format.js';
