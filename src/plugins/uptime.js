import { panel } from '../commands/format.js';
import { formatDuration } from '../session/health.js';

export default {
  name: 'uptime',
  aliases: ['up'],
  description: 'Show how long the bot has been running and its availability',
  category: 'general',
  access: 'public',
  async run(ctx) {
    await ctx.reply(panel('Uptime', [
      { label: 'Running for', value: formatDuration(ctx.session.uptimeSeconds()) },
      { label: 'Availability', value: `${ctx.session.availability().toFixed(2)}%` },
      { label: 'Started at', value: ctx.session.health.startedAt }
    ]));
  }
};
