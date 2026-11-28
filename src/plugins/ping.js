import { panel } from '../commands/format.js';

export default {
  name: 'ping',
  description: 'Check that the bot is alive and measure message age',
  category: 'general',
  access: 'public',
  async run(ctx) {
    const ts = Number(ctx.msg.messageTimestamp) * 1000;
    const age = Number.isFinite(ts) && ts > 0 ? Math.max(0, Math.round((Date.now() - ts) / 100) / 10) : null;
    const rows = [
      { label: 'Status', value: 'alive' },
      { label: 'Uptime', value: `${ctx.session.uptimeSeconds()}s` }
    ];
    if (age !== null) rows.push({ label: 'Message age', value: `${age}s` });
    await ctx.reply(panel('Pong', rows));
  }
};
