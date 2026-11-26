import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { SETTINGS_SCHEMA } from '../core/settings.js';
import { readGroupSettings, writeGroupSetting, GROUP_SETTING_KEYS, getBadWords, setBadWords, DEFAULT_BAD_WORDS } from '../core/groupsettings.js';

// ---------- global settings ----------

function parseValue(spec, raw) {
  const text = String(raw ?? '').trim();
  if (spec.type === 'boolean') {
    const lower = text.toLowerCase();
    if (['on', 'true', 'yes', '1'].includes(lower)) return true;
    if (['off', 'false', 'no', '0'].includes(lower)) return false;
    return text;
  }
  return text;
}

function displayValue(value) {
  if (value === '' || value === undefined || value === null) return '(empty)';
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return String(value).length > 60 ? `${String(value).slice(0, 60)}...` : String(value);
}

const commands = [
  {
    name: 'settings',
    aliases: ['botsettings', 'allsettings'],
    description: 'Show every global setting of this session',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const keys = Object.keys(SETTINGS_SCHEMA);
      const rows = keys.map((key) => ({ label: key, value: displayValue(ctx.settings[key]) }));
      await ctx.reply(panel('Global settings', rows, `Change with ${ctx.prefix}setsetting KEY VALUE or the ${ctx.prefix}set* shortcuts.`));
    }
  },
  {
    name: 'setsetting',
    aliases: ['setconfig'],
    description: 'Set any global setting: KEY VALUE',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const key = (ctx.args[0] || '').trim();
      if (!key || ctx.args.length < 2) {
        await ctx.reply(usage(`${ctx.prefix}setsetting BOT_NAME My Bot`));
        return;
      }
      const spec = SETTINGS_SCHEMA[key];
      if (!spec) {
        await ctx.reply(errorPanel(`Unknown setting "${key}". Send ${ctx.prefix}settings to list them.`));
        return;
      }
      const value = parseValue(spec, ctx.args.slice(1).join(' '));
      const result = await ctx.session.setSetting(key, value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Setting saved', [
        { label: key, value: displayValue(ctx.settings[key]) },
        { label: 'Type', value: spec.type }
      ]));
    }
  },
  {
    name: 'getsetting',
    aliases: ['getconfig'],
    description: 'Show one global setting: KEY',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const key = (ctx.args[0] || '').trim();
      if (!SETTINGS_SCHEMA[key]) {
        await ctx.reply(errorPanel(`Unknown setting "${key}".`));
        return;
      }
      await ctx.reply(panel(key, [
        { label: 'Value', value: displayValue(ctx.settings[key]) },
        { label: 'Default', value: displayValue(SETTINGS_SCHEMA[key].default) }
      ]));
    }
  },
  {
    name: 'resetsetting',
    aliases: ['resetconfig'],
    description: 'Reset one global setting to its default',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const key = (ctx.args[0] || '').trim();
      const spec = SETTINGS_SCHEMA[key];
      if (!spec) {
        await ctx.reply(errorPanel(`Unknown setting "${key}".`));
        return;
      }
      const result = await ctx.session.setSetting(key, spec.default);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(notice(`"${key}" was reset to its default.`));
    }
  },
  {
    name: 'resetallsettings',
    aliases: ['resetsettings'],
    description: 'Reset every global setting to its default',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      let failures = 0;
      for (const [key, spec] of Object.entries(SETTINGS_SCHEMA)) {
        const result = await ctx.session.setSetting(key, spec.default).catch(() => null);
        if (!result?.ok) failures += 1;
      }
      if (failures > 0) {
        await ctx.reply(errorPanel(`${failures} settings could not be reset. Check the storage backend.`));
        return;
      }
      await ctx.reply(notice('Every setting was reset to its default.'));
    }
  },
  {
    name: 'setmode',
    aliases: ['mode'],
    description: 'Switch the bot between public and private mode',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const value = (ctx.args[0] || '').toLowerCase();
      if (!['public', 'private', 'env'].includes(value)) {
        await ctx.reply(usage(`${ctx.prefix}setmode public|private|env`));
        return;
      }
      const result = await ctx.session.setSetting('MODE', value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Mode', [{ label: 'New mode', value: value === 'env' ? `${ctx.config.publicMode ? 'public' : 'private'} (from environment)` : value }]));
    }
  },
  {
    name: 'settimezone',
    aliases: ['timezone'],
    description: 'Set the time zone used in replies',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const value = ctx.argText.trim();
      if (!value) {
        await ctx.reply(usage(`${ctx.prefix}settimezone Africa/Nairobi`));
        return;
      }
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date());
      } catch {
        await ctx.reply(errorPanel(`"${value}" is not a valid IANA time zone.`));
        return;
      }
      const result = await ctx.session.setSetting('TIME_ZONE', value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Time zone', [{ label: 'Set', value }]));
    }
  },
  {
    name: 'setprefix',
    aliases: ['prefix'],
    description: 'Set the command prefix for this session',
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const value = ctx.argText.trim();
      if (!value || value.length > 8) {
        await ctx.reply(usage(`${ctx.prefix}setprefix ! (1 to 8 characters)`));
        return;
      }
      const result = await ctx.session.setSetting('PREFIX', value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Prefix', [{ label: 'Set', value }], value === '' ? 'Empty prefix falls back to the environment value.' : null));
    }
  },

  // ---------- per-group settings ----------

  {
    name: 'groupsettings',
    aliases: ['gcsettings'],
    description: 'Show every setting of the current group',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const current = await readGroupSettings(ctx.store, ctx.session.id, ctx.jid);
      const rows = GROUP_SETTING_KEYS.map((key) => ({ label: key, value: displayValue(current[key]) }));
      await ctx.reply(panel(`Group settings: ${ctx.groupName || 'group'}`, rows, `Change with ${ctx.prefix}setgroupsetting KEY VALUE.`));
    }
  },
  {
    name: 'setgroupsetting',
    aliases: ['setgcsetting'],
    description: 'Set one group setting: KEY VALUE',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const key = (ctx.args[0] || '').trim();
      const value = ctx.args.slice(1).join(' ').trim();
      if (!key || !value) {
        await ctx.reply(usage(`${ctx.prefix}setgroupsetting ANTILINK warn`));
        return;
      }
      if (!GROUP_SETTING_KEYS.includes(key)) {
        await ctx.reply(errorPanel(`Unknown group setting "${key}". Send ${ctx.prefix}groupsettings to list them.`));
        return;
      }
      const result = await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, key, value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Group setting saved', [{ label: key, value: displayValue(result.value) }]));
    }
  },
  {
    name: 'resetgroup',
    aliases: ['resetgroupsettings'],
    description: 'Reset every setting of the current group',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      for (const key of GROUP_SETTING_KEYS) {
        await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, key, 'off').catch(() => {});
      }
      await ctx.store.setDoc(ctx.session.id, 'badwords', ctx.jid, { words: null }).catch(() => {});
      await ctx.reply(notice('Group settings were reset to their defaults.'));
    }
  },
  {
    name: 'badwords',
    aliases: ['setbadwords'],
    description: 'Manage the bad-words list: add/remove/list/clear/default',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const action = (ctx.args[0] || '').toLowerCase();
      const current = await getBadWords(ctx.store, ctx.session.id, ctx.jid);
      if (action === 'list') {
        await ctx.reply(panel('Bad words', [current.join(', ') || '(default list in use)']));
        return;
      }
      if (action === 'add') {
        const words = ctx.args.slice(1).map((w) => w.toLowerCase().trim()).filter(Boolean);
        if (words.length === 0) {
          await ctx.reply(usage(`${ctx.prefix}badwords add word1 word2`));
          return;
        }
        await setBadWords(ctx.store, ctx.session.id, ctx.jid, [...new Set([...(current === DEFAULT_BAD_WORDS ? [] : current), ...words])]);
        await ctx.reply(panel('Bad words', [{ label: 'Added', value: words.join(', ') }]));
        return;
      }
      if (action === 'remove') {
        const words = ctx.args.slice(1).map((w) => w.toLowerCase().trim()).filter(Boolean);
        if (words.length === 0) {
          await ctx.reply(usage(`${ctx.prefix}badwords remove word1`));
          return;
        }
        const base = current === DEFAULT_BAD_WORDS ? [...DEFAULT_BAD_WORDS] : [...current];
        await setBadWords(ctx.store, ctx.session.id, ctx.jid, base.filter((w) => !words.includes(w)));
        await ctx.reply(panel('Bad words', [{ label: 'Removed', value: words.join(', ') }]));
        return;
      }
      if (action === 'clear') {
        await setBadWords(ctx.store, ctx.session.id, ctx.jid, []);
        await ctx.reply(notice('The bad-words list is now empty.'));
        return;
      }
      if (action === 'default') {
        await ctx.store.setDoc(ctx.session.id, 'badwords', ctx.jid, { words: null }).catch(() => {});
        await ctx.reply(notice('The default bad-words list is in effect again.'));
        return;
      }
      await ctx.reply(usage(`${ctx.prefix}badwords add|remove|list|clear|default ...`));
    }
  }
];

// One setter per global schema key, mirroring the .setX convention.
const SKIP_KEYS = new Set(['MODE', 'TIME_ZONE', 'PREFIX']);
// Dedicated commands already exist for these keys; their lowercase names are
// taken, so the generated setters only expose the setX form.
const NO_ALIAS_KEYS = new Set(['autoview', 'autolike']);
for (const [key, spec] of Object.entries(SETTINGS_SCHEMA)) {
  if (SKIP_KEYS.has(key)) continue;
  const name = `set${key.toLowerCase().replace(/_/g, '')}`;
  const valueArg = spec.type === 'enum'
    ? spec.values.join('|')
    : spec.type === 'boolean'
      ? 'on|off'
      : 'value';
  const description = `Set ${key}: ${spec.description}`;

  commands.push({
    name,
    aliases: NO_ALIAS_KEYS.has(key) ? [] : [key.toLowerCase()],
    description,
    category: 'Settings',
    access: 'owner',
    async run(ctx) {
      const raw = ctx.argText.trim();
      if (!raw) {
        const current = displayValue(ctx.settings[key]);
        await ctx.reply(panel(key, [
          { label: 'Current', value: current },
          { label: 'Accepts', value: valueArg }
        ], `${key}: ${spec.description}`));
        return;
      }
      const value = parseValue(spec, raw);
      const result = await ctx.session.setSetting(key, value);
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel(key, [{ label: 'Value', value: displayValue(ctx.settings[key]) }]));
    }
  });
}

export default commands;
