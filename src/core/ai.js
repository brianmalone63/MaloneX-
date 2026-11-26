// OpenAI-compatible chat client used by the AI commands and the chatbot.
// The provider base URL, key and model are per-session settings, so every
// session can use its own account or a self-hosted gateway.
import { fetchJson } from './media.js';

export function aiConfigured(settings) {
  return Boolean(settings?.AI_API_URL && settings?.AI_API_KEY);
}

export function aiNotConfiguredMessage(prefix) {
  return [
    'AI chat is not configured for this session.',
    '',
    'Set these settings to enable it:',
    `- ${prefix}setsetting AI_API_URL https://your-provider/v1`,
    `- ${prefix}setsetting AI_API_KEY your-key`,
    `- ${prefix}setsetting AI_MODEL model-name`,
    '',
    'Any OpenAI-compatible chat completions endpoint works, including self-hosted gateways.'
  ].join('\n');
}

export async function chatComplete(settings, prompt, { history = [], maxTokens = 700, timeoutMs = 60000 } = {}) {
  const base = String(settings.AI_API_URL || '').replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const data = await fetchJson(url, {
    method: 'POST',
    timeoutMs,
    headers: { Authorization: `Bearer ${settings.AI_API_KEY}` },
    body: {
      model: settings.AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are MaloneX, a concise WhatsApp assistant built by Brian Malone. Answer in plain text without markdown headings.' },
        ...history,
        { role: 'user', content: String(prompt) }
      ],
      max_tokens: maxTokens
    }
  });
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('The AI provider returned no content.');
  return String(reply).trim();
}
