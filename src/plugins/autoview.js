import { panel } from '../commands/format.js';

export default {
  name: 'autoview',
  description: 'Turn automatic status reading on or off: .autoview on|off',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const arg = (ctx.args[0] || '').toLowerCase();
    if (arg !== 'on' && arg !== 'off') {
      await ctx.reply(panel('Auto-view', [
        { label: 'Current', value: ctx.session.settings.autoview ? 'on' : 'off' },
        { label: 'Usage', value: `${ctx.prefix}autoview on|off` }
      ]));
      return;
    }
    const result = await ctx.session.setSetting('autoview', arg);
    if (!result.ok) {
      await ctx.reply(panel('Auto-view', [{ label: 'Problem', value: result.error }]));
      return;
    }
    await ctx.reply(panel('Auto-view', [{ label: 'New state', value: result.value ? 'on' : 'off' }]));
  }
};
