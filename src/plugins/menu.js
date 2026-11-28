import { commandReference } from '../commands/format.js';

export default {
  name: 'menu',
  aliases: ['commands', 'help'],
  description: 'List every command you are allowed to use',
  category: 'general',
  access: 'public',
  async run(ctx) {
    await ctx.reply(commandReference(ctx.registry));
  }
};
