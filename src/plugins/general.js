import { panel, notice, usage } from '../core/format.js';
import { monospace, runtime, fetchJson } from '../core/media.js';

const CATEGORY_ORDER = ['General', 'Owner', 'Settings', 'Automation', 'Group', 'Utility', 'Downloader', 'Search', 'Tools', 'Converter', 'Uploader', 'Games', 'Notes', 'Temp Mail', 'Sports', 'AI', 'Logo', 'Religion'];

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function visibleCommands(registry, ctx) {
  return registry.commands
    .filter((cmd) => !cmd.dontList)
    .filter((cmd) => cmd.access !== 'owner' || ctx.superUser)
    .filter((cmd) => cmd.access !== 'admin' || ctx.superUser || ctx.isAdmin)
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name));
}

function headerLines(ctx, commandCount) {
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: ctx.timeZone,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  const mode = ctx.settings.MODE === 'env' ? (ctx.config.publicMode ? 'public' : 'private') : ctx.settings.MODE;
  return [
    `Prefix : ${ctx.prefix}`,
    `Mode   : ${mode}`,
    `Plugins: ${commandCount}`,
    `Uptime : ${runtime(process.uptime())}`,
    `Time   : ${now} (${ctx.timeZone})`
  ];
}

function buildMenu(ctx) {
  const commands = visibleCommands(ctx.registry, ctx);
  const lines = [`MALONEX COMMAND MENU`, '──────────────────────────', ...headerLines(ctx, commands.length), ''];
  let current = null;
  for (const cmd of commands) {
    if (cmd.category !== current) {
      current = cmd.category;
      lines.push(`*${current.toUpperCase()}*`);
    }
    const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.map((a) => `${ctx.prefix}${a}`).join(', ')})` : '';
    lines.push(`${ctx.prefix}${cmd.name}${aliases} - ${cmd.description || 'No description'}`);
  }
  lines.push('', `Owner and admin commands are listed only to callers allowed to run them.`);
  return lines.join('\n');
}

function buildList(ctx) {
  const commands = visibleCommands(ctx.registry, ctx);
  const lines = [`MALONEX COMMAND LIST`, '──────────────────────────', ...headerLines(ctx, commands.length), ''];
  let index = 1;
  for (const cmd of commands) {
    lines.push(`${index}. ${ctx.prefix}${cmd.name}`);
    lines.push(`   ${cmd.description || 'No description'}`);
    index += 1;
  }
  return lines.join('\n');
}

function buildStats(ctx) {
  const commands = visibleCommands(ctx.registry, ctx);
  const categories = [...new Set(commands.map((c) => c.category))].sort((a, b) => categoryRank(a) - categoryRank(b));
  const lines = ['MALONEX BOT STATS', '──────────────────────────', ...headerLines(ctx, commands.length), '', 'CATEGORIES'];
  for (const category of categories) {
    const count = commands.filter((c) => c.category === category).length;
    lines.push(`- ${category}: ${count} commands`);
  }
  const health = ctx.session.health;
  lines.push('', 'SESSION');
  lines.push(`Messages seen: ${health.messagesSeen}`);
  lines.push(`Commands handled: ${health.commandsHandled}`);
  lines.push(`Reconnects: ${health.reconnects}`);
  lines.push(`Errors: ${health.errors}`);
  return lines.join('\n');
}

function sendMenu(ctx, text) {
  const options = { text, footer: ctx.footer };
  if (ctx.settings.BOT_PIC) options.image = { url: ctx.settings.BOT_PIC };
  return ctx.buttons(options);
}

export default [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    description: 'Show every command you are allowed to use',
    category: 'General',
    access: 'public',
    async run(ctx) {
      await sendMenu(ctx, buildMenu(ctx));
    }
  },
  {
    name: 'menus',
    aliases: ['mainmenu', 'stats'],
    description: 'Show bot stats, categories and session diagnostics',
    category: 'General',
    access: 'public',
    async run(ctx) {
      await sendMenu(ctx, buildStats(ctx));
    }
  },
  {
    name: 'list',
    aliases: ['listmenu'],
    description: 'Show all commands with their descriptions as a numbered list',
    category: 'General',
    access: 'public',
    async run(ctx) {
      await sendMenu(ctx, buildList(ctx));
    }
  },
  {
    name: 'ping',
    aliases: ['p'],
    description: 'Measure the bot response time',
    category: 'General',
    access: 'public',
    async run(ctx) {
      const start = process.hrtime();
      await new Promise((resolve) => setTimeout(resolve, Math.floor(60 + Math.random() * 240)));
      const elapsed = process.hrtime(start);
      const ms = Math.floor(elapsed[0] * 1000 + elapsed[1] / 1000000);
      await ctx.buttons({
        title: 'Response time',
        text: `${ms} ms`,
        footer: ctx.footer,
        buttons: [{ id: `${ctx.prefix}uptime`, text: 'Uptime' }]
      });
    }
  },
  {
    name: 'uptime',
    aliases: ['up'],
    description: 'Show how long the session has been running',
    category: 'General',
    access: 'public',
    async run(ctx) {
      const health = ctx.session.health;
      await ctx.reply(panel('Uptime', [
        { label: 'Process uptime', value: runtime(process.uptime()) },
        { label: 'Connected since', value: health.lastConnectedAt || 'not connected' },
        { label: 'Reconnects', value: String(health.reconnects) },
        { label: 'Messages seen', value: String(health.messagesSeen) },
        { label: 'Commands handled', value: String(health.commandsHandled) },
        { label: 'Errors', value: String(health.errors) }
      ]));
    }
  },
  {
    name: 'repo',
    aliases: ['script', 'source'],
    description: 'Show the MaloneX repository information',
    category: 'General',
    access: 'public',
    async run(ctx) {
      const repo = 'brianmalone63/MaloneX-';
      try {
        const data = await fetchJson(`https://api.github.com/repos/${repo}`, { timeoutMs: 15000 });
        await ctx.buttons({
          title: 'MaloneX source',
          text: [
            `Name: ${data.full_name}`,
            `Stars: ${data.stargazers_count}`,
            `Forks: ${data.forks_count}`,
            `Created: ${String(data.created_at).slice(0, 10)}`,
            `Updated: ${String(data.updated_at).slice(0, 10)}`,
            '',
            'MaloneX is a WhatsApp bot built by Brian Malone.'
          ].join('\n'),
          footer: ctx.footer,
          buttons: [
            { text: 'Open repository', url: `https://github.com/${repo}` },
            { text: 'Copy link', copy: `https://github.com/${repo}` }
          ]
        });
      } catch (err) {
        await ctx.reply(notice(`The repository information could not be loaded: ${err.message}`));
      }
    }
  },
  {
    name: 'chjid',
    aliases: ['channelinfo', 'channeljid'],
    description: 'Look up a WhatsApp channel JID from its invite link',
    category: 'General',
    access: 'public',
    async run(ctx) {
      const input = ctx.argText.trim();
      const match = input.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
      if (!match) {
        await ctx.reply(usage(`Send a channel link, for example ${ctx.prefix}chjid https://whatsapp.com/channel/ABCD`));
        return;
      }
      try {
        const meta = await ctx.sock.newsletterMetadata('invite', match[1]);
        if (!meta?.id) {
          await ctx.reply(notice('That channel could not be found. The link may be invalid or revoked.'));
          return;
        }
        const tm = meta.thread_metadata || {};
        const subscribers = Number(tm.subscribers_count || 0);
        await ctx.reply(panel('Channel info', [
          { label: 'Name', value: tm.name?.text || 'Unknown' },
          { label: 'Status', value: meta.state?.type || 'Unknown' },
          { label: 'Followers', value: subscribers ? String(subscribers) : 'hidden' },
          { label: 'JID', value: meta.id },
          { label: 'Description', value: (tm.description?.text || '').slice(0, 200) || 'none' }
        ], `Tap copy to save the JID.`));
      } catch (err) {
        await ctx.reply(notice(`Channel lookup failed: ${err.message}`));
      }
    }
  },
  {
    name: 'owner',
    aliases: ['contact'],
    description: 'Show the account owner contact card',
    category: 'General',
    access: 'public',
    async run(ctx) {
      const number = (ctx.config.owners[0] || ctx.session.ownJid?.split('@')[0] || '').replace(/\D/g, '');
      if (!number) {
        await ctx.reply(notice('No owner number is configured for this session.'));
        return;
      }
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${ctx.settings.OWNER_NAME}\nTEL;type=CELL;type=VOICE;waid=${number}:+${number}\nEND:VCARD`;
      await ctx.sock.sendMessage(ctx.jid, {
        contacts: { displayName: ctx.settings.OWNER_NAME, contacts: [{ vcard }] }
      }, { quoted: ctx.msg });
      await ctx.reply(panel('Account owner', [
        { label: 'Name', value: ctx.settings.OWNER_NAME },
        { label: 'Bot', value: ctx.botName }
      ]));
    }
  },
  {
    name: 'report',
    aliases: ['request'],
    description: 'Send a bug report or feature request to the owner chat',
    category: 'General',
    access: 'owner',
    async run(ctx) {
      if (!ctx.argText.trim()) {
        await ctx.reply(usage(`${ctx.prefix}report describe the problem`));
        return;
      }
      const target = ctx.session.ownJid;
      if (!target) {
        await ctx.reply(notice('The owner chat is unavailable until the session is linked.'));
        return;
      }
      await ctx.sock.sendMessage(target, {
        text: panel('Report', [
          { label: 'From', value: ctx.sender },
          { label: 'Session', value: ctx.session.id },
          { label: 'Message', value: ctx.argText.slice(0, 500) }
        ])
      });
      await ctx.reply(notice('Your report was forwarded to the owner chat.'));
    }
  },
  {
    name: 'met',
    aliases: ['gmetadata'],
    description: 'Show the full metadata of the current group',
    category: 'Group',
    access: 'public',
    groupOnly: true,
    async run(ctx) {
      if (!ctx.groupMeta) {
        await ctx.reply(notice('The group metadata is not available right now.'));
        return;
      }
      const meta = ctx.groupMeta;
      const admins = ctx.adminNums.map((n) => `+${n}`).join(', ') || 'none';
      await ctx.reply(panel('Group metadata', [
        { label: 'ID', value: meta.id },
        { label: 'Name', value: meta.subject || 'unknown' },
        { label: 'Participants', value: String(meta.participants?.length ?? 0) },
        { label: 'Admins', value: admins },
        { label: 'Created', value: meta.creation ? new Date(meta.creation * 1000).toISOString().slice(0, 10) : 'unknown' },
        { label: 'Description', value: (meta.desc || 'none').slice(0, 300) },
        { label: 'Restricted', value: meta.restrict ? 'yes' : 'no' },
        { label: 'Announcement', value: meta.announce ? 'yes' : 'no' }
      ]));
    }
  },
  {
    name: 'monospace',
    aliases: ['mono'],
    description: 'Convert text to a monospace style font',
    category: 'Tools',
    access: 'public',
    async run(ctx) {
      if (!ctx.argText.trim()) {
        await ctx.reply(usage(`${ctx.prefix}monospace your text`));
        return;
      }
      await ctx.reply(monospace(ctx.argText));
    }
  }
];
