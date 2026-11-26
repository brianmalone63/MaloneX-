import { panel, notice } from '../core/format.js';

export default [
  {
    name: 'status',
    aliases: ['health', 'diag'],
    description: 'Show session diagnostics: state, uptime and counters',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      await ctx.reply(panel('Session diagnostics', ctx.session.diagnostics()));
    }
  },
  {
    name: 'restart',
    description: 'Restart this WhatsApp session connection',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      await ctx.reply(notice('Restarting the session connection now.'));
      await ctx.session.restart();
    }
  },
  {
    name: 'logout',
    description: 'Log out and clear pairing; settings are kept',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      await ctx.reply(notice('Logging out and clearing credentials. Settings are kept for the next pairing.'));
      await ctx.session.logout();
    }
  }
];
