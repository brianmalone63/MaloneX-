import { panel, usage, error as errorPanel, onOff } from '../core/format.js';
import { statusHasContent } from '../core/handler.js';
import { validateSetting } from '../core/settings.js';
import { jidNormalizedUser } from '../baileys.js';

// Small in-memory LRU of the last status ids that were already reacted to.
export class LruSet {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
  }

  has(key) {
    return this.map.has(key);
  }

  add(key) {
    if (this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, true);
      return;
    }
    this.map.set(key, true);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  get size() {
    return this.map.size;
  }
}

// Injectable timing helpers and per-session counters so tests can drive the
// hook deterministically.
export const internals = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  MIN_DELAY_MS: 3000,
  MAX_DELAY_MS: 8000,
  MAX_PER_HOUR: 60,
  WINDOW_MS: 60 * 60 * 1000,
  state: new Map() // sessionId -> { seen: LruSet, reactions: number[] }
};

export function resetInternalState() {
  internals.state.clear();
}

export function getState(sessionId) {
  let state = internals.state.get(sessionId);
  if (!state) {
    state = { seen: new LruSet(500), reactions: [] };
    internals.state.set(sessionId, state);
  }
  return state;
}

function isOwnStatus(ctx) {
  if (ctx.isFromMe) return true;
  const participant = ctx.msg.key.participant;
  if (!participant) return true;
  const participantJid = jidNormalizedUser(participant);
  if (ctx.session.ownJid && participantJid === ctx.session.ownJid) return true;
  const digits = participantJid.split('@')[0].split(':')[0];
  return ctx.config.owners.some((owner) => owner === digits);
}

export async function runAutolikeHook(ctx) {
  const { session, sock, msg, settings } = ctx;
  if (!ctx.isStatus || ctx.isFromMe) return;
  if (!settings || settings.autolike !== true) return;
  if (isOwnStatus(ctx)) return;
  if (!statusHasContent(msg.message)) return;

  const state = getState(session.id);
  const statusId = `${msg.key.participant || ''}_${msg.key.id}`;
  if (state.seen.has(statusId)) return;
  state.seen.add(statusId);

  const now = Date.now();
  state.reactions = state.reactions.filter((ts) => now - ts < internals.WINDOW_MS);
  if (state.reactions.length >= internals.MAX_PER_HOUR) {
    ctx.logger.info('autolike hourly cap reached; skipping this status');
    return;
  }

  const emoji = settings.autolike_emoji;
  const gen = session.generation;
  // Reserve the slot before the delay so bursts cannot over-schedule.
  state.reactions.push(now);
  await internals.sleep(internals.randomInt(internals.MIN_DELAY_MS, internals.MAX_DELAY_MS));
  if (gen !== session.generation || !session.connected) return;

  try {
    await sock.sendMessage(
      'status@broadcast',
      { react: { key: msg.key, text: emoji } },
      { statusJidList: [msg.key.participant, session.ownJid].filter(Boolean) }
    );
    // A reaction implies the status was seen; mark it viewed as well.
    await sock.readMessages([msg.key]);
  } catch (err) {
    // Free the reserved slot so other statuses can still use the quota.
    const idx = state.reactions.indexOf(now);
    if (idx !== -1) state.reactions.splice(idx, 1);
    session.health.errors += 1;
    session.health.lastError = err.message;
    ctx.logger.warn(`autolike could not react to status: ${err.message}`);
  }
}

export const hook = { hook: 'message', run: runAutolikeHook };

export default {
  name: 'autolike',
  description: 'Turn automatic status reactions on or off, optionally with an emoji',
  category: 'Automation',
  access: 'owner',
  async run(ctx) {
    const mode = (ctx.args[0] || '').toLowerCase();
    const emojiArg = ctx.args[1];
    if (mode !== 'on' && mode !== 'off') {
      await ctx.reply(usage(`Use ${ctx.config.prefix}autolike on|off [emoji]. The emoji is optional and replaces the stored reaction.`));
      return;
    }
    if (mode === 'on' && emojiArg !== undefined) {
      const check = validateSetting('autolike_emoji', emojiArg);
      if (!check.ok) {
        await ctx.reply(errorPanel('Provide exactly one emoji character after on or off. Other characters are rejected.'));
        return;
      }
      const saved = await ctx.session.setSetting('autolike_emoji', check.value);
      if (!saved.ok) {
        await ctx.reply(errorPanel(saved.error));
        return;
      }
    }
    const result = await ctx.session.setSetting('autolike', mode === 'on');
    if (!result.ok) {
      await ctx.reply(errorPanel(result.error));
      return;
    }
    await ctx.reply(panel('Automation', [
      { label: 'Auto like status', value: `${onOff(ctx.session.settings.autolike)} (emoji: ${ctx.session.settings.autolike_emoji})` },
      { label: 'Reaction cap', value: `${internals.MAX_PER_HOUR} per hour` }
    ]));
  }
};
