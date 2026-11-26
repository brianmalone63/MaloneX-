import { panel, usage, error as errorPanel, onOff } from '../core/format.js';
import { statusHasContent } from '../core/handler.js';

// Injectable timing helpers so tests can override the delay behaviour.
export const internals = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  MIN_DELAY_MS: 1000,
  MAX_DELAY_MS: 4000
};

export async function runAutoviewHook(ctx) {
  const { session, sock, msg, settings } = ctx;
  if (!ctx.isStatus) return;
  if (ctx.isFromMe) return;
  if (!settings || settings.autoview !== true) return;
  // Protocol and other control statuses carry no media or text; skip them.
  if (!statusHasContent(msg.message)) return;

  const gen = session.generation;
  await internals.sleep(internals.randomInt(internals.MIN_DELAY_MS, internals.MAX_DELAY_MS));
  // Drop stale runs after a reconnect.
  if (gen !== session.generation || !session.connected) return;
  try {
    await sock.readMessages([msg.key]);
  } catch (err) {
    session.health.errors += 1;
    session.health.lastError = err.message;
    ctx.logger.warn(`autoview could not mark status as read: ${err.message}`);
  }
}

export const hook = { hook: 'message', run: runAutoviewHook };

export default {
  name: 'autoview',
  description: 'Turn automatic viewing of statuses on or off',
  category: 'Automation',
  access: 'owner',
  async run(ctx) {
    const mode = (ctx.args[0] || '').toLowerCase();
    if (mode !== 'on' && mode !== 'off') {
      await ctx.reply(usage(`Use ${ctx.config.prefix}autoview on|off.`));
      return;
    }
    const result = await ctx.session.setSetting('autoview', mode === 'on');
    if (!result.ok) {
      await ctx.reply(errorPanel(result.error));
      return;
    }
    await ctx.reply(panel('Automation', [
      { label: 'Auto view status', value: onOff(ctx.session.settings.autoview) },
      { label: 'Auto like status', value: onOff(ctx.session.settings.autolike) }
    ]));
  }
};
