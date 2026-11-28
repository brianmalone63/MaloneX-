import { panel } from '../commands/format.js';
import { settingsList } from '../session/session.js';

export default {
  name: 'settings',
  description: 'Show all settings, or change one: .settings <key> <value>',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const [key, ...rest] = ctx.args;
    if (!key) {
      const rows = settingsList().map((spec) => ({
        label: `${spec.key} (${ctx.session.settings[spec.key]})`,
        value: spec.description
      }));
      await ctx.reply(panel('Settings', rows));
      return;
    }
    const value = rest.join(' ');
    if (!value) {
      await ctx.reply(panel('Settings', { label: key, value: String(ctx.session.settings[key] ?? 'not set') }));
      return;
    }
    const result = await ctx.session.setSetting(key, value);
    if (!result.ok) {
      await ctx.reply(panel('Settings', [{ label: key, value: result.error }]));
      return;
    }
    await ctx.reply(panel('Settings', [{ label: key, value: `${result.value} (saved)` }]));
  }
};
