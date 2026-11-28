import { panel } from '../commands/format.js';

export default {
  name: 'autolike',
  description: 'Turn automatic status reactions on or off: .autolike on|off',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const arg = (ctx.args[0] || '').toLowerCase();
    if (arg !== 'on' && arg !== 'off') {
      await ctx.reply(panel('Auto-like', [
        { label: 'Current', value: ctx.session.settings.autolike ? 'on' : 'off' },
        { label: 'Reaction', value: ctx.session.settings.autolike_emoji },
        { label: 'Usage', value: `${ctx.prefix}autolike on|off` }
      ]));
      return;
    }
    const result = await ctx.session.setSetting('autolike', arg);
    if (!result.ok) {
      await ctx.reply(panel('Auto-like', [{ label: 'Problem', value: result.error }]));
      return;
    }
    await ctx.reply(panel('Auto-like', [{ label: 'New state', value: result.value ? 'on' : 'off' }]));
  }
};
