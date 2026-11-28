export default {
  name: 'diagnose',
  description: 'Plain-language diagnostics with advice for the last disconnect',
  category: 'owner',
  access: 'owner',
  async run(ctx) {
    const rows = ctx.session.diagnostics();
    await ctx.reply(panel('Diagnostics', rows));
  }
};

import { panel } from '../commands/format.js';
