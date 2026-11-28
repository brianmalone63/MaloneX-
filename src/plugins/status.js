export default {
  name: 'status',
  description: 'Health summary: availability, reconnects, failures, counts',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const h = ctx.session.health;
    await ctx.reply(panel('Health', [
      { label: 'State', value: ctx.session.status },
      { label: 'Availability', value: `${ctx.session.availability().toFixed(2)}%` },
      { label: 'Messages seen', value: String(h.messages) },
      { label: 'Commands handled', value: String(h.commands) },
      { label: 'Disconnects', value: String(h.disconnects) },
      { label: 'Reconnects', value: String(h.reconnects) },
      { label: 'Consecutive failures', value: String(h.consecutiveFailures) },
      { label: 'Errors', value: String(h.errors) }
    ]));
  }
};

import { panel } from '../commands/format.js';
