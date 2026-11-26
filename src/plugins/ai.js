import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { chatComplete, aiConfigured, aiNotConfiguredMessage } from '../core/ai.js';

const MODELS = {
  maloneai: { model: 'gpt-4o-mini', brand: 'MaloneX assistant', aliases: ['ai'] },
  chatai: { model: 'gpt-4o-mini', brand: 'General assistant' },
  gpt: { model: 'gpt-4o-mini', brand: 'GPT chat' },
  gpt4: { model: 'gpt-4', brand: 'GPT-4 chat' },
  gpt4o: { model: 'gpt-4o', brand: 'GPT-4o chat' },
  'gpt4o-mini': { model: 'gpt-4o-mini', brand: 'GPT-4o mini chat' },
  openai: { model: 'gpt-4o-mini', brand: 'OpenAI chat' },
  gemini: { model: 'gemini-1.5-flash', brand: 'Gemini chat' },
  venice: { model: 'venice-uncensored', brand: 'Venice chat' }
};

const conversationMemory = new Map(); // jid -> [{role, content}]
const MAX_HISTORY = 10;

function historyFor(jid, prompt) {
  const history = conversationMemory.get(jid) || [];
  history.push({ role: 'user', content: prompt });
  const trimmed = history.slice(-MAX_HISTORY);
  conversationMemory.set(jid, trimmed);
  return trimmed;
}

function rememberAnswer(jid, answer) {
  const history = conversationMemory.get(jid) || [];
  history.push({ role: 'assistant', content: answer });
  conversationMemory.set(jid, history.slice(-MAX_HISTORY));
}

function makeAiCommand(name, aliases, brand, model) {
  return {
    name,
    aliases: aliases || [],
    description: `Chat with ${brand} (AI_API_URL and AI_API_KEY required)`,
    category: 'AI',
    access: 'public',
    async run(ctx) {
      const prompt = ctx.argText.trim();
      if (!prompt) {
        await ctx.reply(usage(`${ctx.prefix}${name} your question or prompt`));
        return;
      }
      const settings = { ...ctx.settings, AI_MODEL: model || ctx.settings.AI_MODEL };
      if (!aiConfigured(settings)) {
        await ctx.reply(notice(aiNotConfiguredMessage(ctx.prefix)));
        return;
      }
      try {
        await ctx.sock.sendPresenceUpdate?.('composing', ctx.jid).catch(() => {});
        const answer = await chatComplete(settings, prompt, { history: historyFor(ctx.jid, prompt).slice(0, -1) });
        rememberAnswer(ctx.jid, answer);
        const text = answer.length > 3800 ? `${answer.slice(0, 3800)}\n\n(truncated)` : answer;
        await ctx.sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The AI provider failed: ${err.message}`));
      }
    }
  };
}

export default [
  ...Object.entries(MODELS).map(([cmd, cfg]) => makeAiCommand(cmd, cfg.aliases, cfg.brand, cfg.model)),
  {
    name: 'clearai',
    aliases: ['resetchat'],
    description: 'Forget the AI conversation memory of this chat',
    category: 'AI',
    access: 'public',
    async run(ctx) {
      conversationMemory.delete(ctx.jid);
      await ctx.reply(notice('The conversation memory of this chat was cleared.'));
    }
  }
];
