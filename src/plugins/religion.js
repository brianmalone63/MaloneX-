import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchJson } from '../core/media.js';

export default [
  {
    name: 'bible',
    aliases: ['verse'],
    description: 'Look up a Bible passage (bible-api.com)',
    category: 'Religion',
    access: 'public',
    async run(ctx) {
      const passage = ctx.argText.trim();
      if (!passage) {
        await ctx.reply(usage(`${ctx.prefix}bible John 3:16`));
        return;
      }
      try {
        const data = await fetchJson(`https://bible-api.com/${encodeURIComponent(passage)}?translation=kjv`);
        if (!data?.text) {
          await ctx.reply(notice('That passage could not be found.'));
          return;
        }
        const text = String(data.text).trim();
        const shown = text.length > 1500 ? `${text.slice(0, 1500)}\n\n(truncated)` : text;
        await ctx.reply(panel(`Bible: ${data.reference || passage}`, [shown], 'Translation: KJV (bible-api.com)'));
      } catch (err) {
        await ctx.reply(errorPanel(`The passage could not be fetched: ${err.message}`));
      }
    }
  }
];
