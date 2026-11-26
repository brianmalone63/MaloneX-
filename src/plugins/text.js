import { panel, usage } from '../core/format.js';
import { encodeBase64, decodeBase64, encodeBinary, decodeBinary } from '../core/media.js';

export default [
  {
    name: 'ebase',
    aliases: ['tobase64'],
    description: 'Encode text to Base64',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      if (!ctx.argText) {
        await ctx.reply(usage(`${ctx.prefix}ebase your text`));
        return;
      }
      await ctx.reply(panel('Base64 encoded', [encodeBase64(ctx.argText)]));
    }
  },
  {
    name: 'dbase',
    aliases: ['debase'],
    description: 'Decode Base64 text',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      if (!ctx.argText) {
        await ctx.reply(usage(`${ctx.prefix}dbase aGVsbG8=`));
        return;
      }
      try {
        await ctx.reply(panel('Base64 decoded', [decodeBase64(ctx.argText)]));
      } catch (err) {
        await ctx.reply(panel('Base64 decoded', [`Invalid input: ${err.message}`]));
      }
    }
  },
  {
    name: 'ebinary',
    aliases: ['tobinary'],
    description: 'Encode text to binary',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      if (!ctx.argText) {
        await ctx.reply(usage(`${ctx.prefix}ebinary your text`));
        return;
      }
      await ctx.reply(panel('Binary encoded', [encodeBinary(ctx.argText)]));
    }
  },
  {
    name: 'debinary',
    aliases: ['dbinary'],
    description: 'Decode binary text',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      if (!ctx.argText) {
        await ctx.reply(usage(`${ctx.prefix}debinary 01101000 01101001`));
        return;
      }
      try {
        await ctx.reply(panel('Binary decoded', [decodeBinary(ctx.argText)]));
      } catch (err) {
        await ctx.reply(panel('Binary decoded', [`Invalid input: ${err.message}`]));
      }
    }
  }
];
