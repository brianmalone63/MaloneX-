import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchJson } from '../core/media.js';

// Football data through a configurable provider. The default is the free
// TheSportsDB community tier (key "3"); higher tiers work by changing
// SPORTS_API_URL and SPORTS_API_KEY.
function provider(settings) {
  const base = String(settings.SPORTS_API_URL || 'https://www.thesportsdb.com/api/v1/json/3').replace(/\/+$/, '');
  return { base, key: settings.SPORTS_API_KEY || '' };
}

const MAJOR_LEAGUES = [
  { id: '4328', name: 'Premier League' },
  { id: '4335', name: 'La Liga' },
  { id: '4331', name: 'Serie A' },
  { id: '4332', name: 'Bundesliga' },
  { id: '4334', name: 'Ligue 1' },
  { id: '4346', name: 'MLS' },
  { id: '4480', name: 'CAF Champions League' }
];

function providerNotConfigured(ctx) {
  return notice([
    'No football data provider answered.',
    '',
    'MaloneX defaults to the free TheSportsDB tier. For reliable data set:',
    `${ctx.prefix}setsetting SPORTS_API_URL https://your-provider/v1/json/YOUR_KEY`,
    `${ctx.prefix}setsetting SPORTS_API_KEY your-key`
  ].join('\n'));
}

export default [
  {
    name: 'livescore',
    aliases: ['live'],
    description: 'Show the latest finished and next scheduled matches for a league',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      const league = MAJOR_LEAGUES.find((l) => l.name.toLowerCase().includes((ctx.args[0] || 'premier').toLowerCase())) || MAJOR_LEAGUES[0];
      try {
        const data = await fetchJson(`${provider(ctx.settings).base}/eventsnextleague.php?id=${league.id}`);
        const events = (data?.events || []).slice(0, 8);
        if (events.length === 0) {
          await ctx.reply(notice('No upcoming matches were found for that league.'));
          return;
        }
        const rows = events.map((e) => ({
          label: `${e.strEvent}`.slice(0, 55),
          value: `${e.dateEvent || ''} ${e.strTime || ''} | Round ${e.intRound || '?'}`
        }));
        await ctx.reply(panel(`Upcoming: ${league.name}`, rows, 'Source: TheSportsDB'));
      } catch (err) {
        await ctx.reply(providerNotConfigured(ctx));
      }
    }
  },
  {
    name: 'standings',
    aliases: ['leaguetable'],
    description: 'Show the current league table (premier, laliga, seriea, bundesliga, ligue1, mls)',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      const q = (ctx.args[0] || 'premier').toLowerCase();
      const league = MAJOR_LEAGUES.find((l) => l.name.toLowerCase().includes(q) || l.name.toLowerCase().replace(/\s/g, '').includes(q)) || MAJOR_LEAGUES[0];
      try {
        const data = await fetchJson(`${provider(ctx.settings).base}/lookuptable.php?l=${league.id}&s=2024-2025`);
        const table = (data?.table || []).slice(0, 10);
        if (table.length === 0) {
          await ctx.reply(notice('No standings were returned for that league and season.'));
          return;
        }
        const rows = table.map((t) => ({
          label: `${t.intRank}. ${t.strTeam}`,
          value: `${t.intPlayed} played | ${t.intWin}W ${t.intDraw}D ${t.intLoss}L | ${t.intPoints} pts`
        }));
        await ctx.reply(panel(`Table: ${league.name}`, rows, 'Source: TheSportsDB'));
      } catch (err) {
        await ctx.reply(providerNotConfigured(ctx));
      }
    }
  },
  {
    name: 'topscorers',
    aliases: ['scorers'],
    description: 'Top scorers need a paid provider tier; shows league info instead',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      const league = MAJOR_LEAGUES.find((l) => l.name.toLowerCase().includes((ctx.args[0] || '').toLowerCase())) || MAJOR_LEAGUES[0];
      await ctx.reply(panel('Top scorers', [
        { label: 'League', value: league.name },
        { label: 'Status', value: 'Scorer rankings are not part of the free provider tier.' },
        { label: 'How to enable', value: `Set SPORTS_API_URL and SPORTS_API_KEY to a provider that serves scorers, then rerun ${ctx.prefix}topscorers.` }
      ]));
    }
  },
  {
    name: 'upcomingmatches',
    aliases: ['fixtures'],
    description: 'Show upcoming fixtures across the major leagues',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      try {
        const rows = [];
        for (const league of MAJOR_LEAGUES.slice(0, 4)) {
          const data = await fetchJson(`${provider(ctx.settings).base}/eventsnextleague.php?id=${league.id}`).catch(() => null);
          const first = (data?.events || [])[0];
          if (first) rows.push({ label: `${league.name}`, value: `${first.strEvent} | ${first.dateEvent} ${first.strTime || ''}` });
        }
        if (rows.length === 0) {
          await ctx.reply(notice('No fixtures were returned right now.'));
          return;
        }
        await ctx.reply(panel('Next fixtures', rows, 'Source: TheSportsDB'));
      } catch (err) {
        await ctx.reply(providerNotConfigured(ctx));
      }
    }
  },
  {
    name: 'sportnews',
    aliases: ['footballnews'],
    description: 'Latest football news headlines via Google News RSS',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      const topic = ctx.argText.trim() || 'football';
      try {
        const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-GB&gl=GB&ceid=GB:en`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const items = [...xml.matchAll(/<item><title>(.*?)<\/title>.*?<pubDate>(.*?)<\/pubDate>/g)].slice(0, 8);
        if (items.length === 0) {
          await ctx.reply(notice('No headlines were returned right now.'));
          return;
        }
        const decode = (s) => String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
        const rows = items.map((m, i) => ({ label: `${i + 1}. ${decode(m[1]).slice(0, 70)}`, value: decode(m[2]).slice(0, 40) }));
        await ctx.reply(panel(`News: ${topic}`, rows, 'Source: Google News RSS'));
      } catch (err) {
        await ctx.reply(errorPanel(`The news feed failed: ${err.message}`));
      }
    }
  },
  {
    name: 'surebet',
    aliases: ['bettips'],
    description: 'Sure bets need a live odds provider; explains how to enable one',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      await ctx.reply(panel('Betting tips', [
        { label: 'Status', value: 'Live odds feeds require a licensed commercial provider.' },
        { label: 'How to enable', value: `Set SPORTS_API_URL and SPORTS_API_KEY to an odds provider that exposes arbritrage endpoints, then rerun ${ctx.prefix}surebet.` },
        { label: 'Reminder', value: 'Bet responsibly; no bot can guarantee outcomes.' }
      ]));
    }
  },
  {
    name: 'gamehistory',
    aliases: ['matchevents'],
    description: 'Look up past results of a team by name',
    category: 'Sports',
    access: 'public',
    async run(ctx) {
      const team = ctx.argText.trim();
      if (!team) {
        await ctx.reply(usage(`${ctx.prefix}gamehistory arsenal`));
        return;
      }
      try {
        const search = await fetchJson(`${provider(ctx.settings).base}/searchteams.php?t=${encodeURIComponent(team)}`);
        const teamInfo = (search?.teams || [])[0];
        if (!teamInfo) {
          await ctx.reply(notice('That team was not found.'));
          return;
        }
        const last = await fetchJson(`${provider(ctx.settings).base}/eventslast.php?id=${teamInfo.idTeam}`).catch(() => null);
        const events = (last?.results || []).slice(0, 6);
        const rows = events.map((e) => ({
          label: `${e.strEvent}`.slice(0, 55),
          value: `${e.dateEvent || ''} | ${e.intHomeScore ?? '?'}:${e.intAwayScore ?? '?'}`
        }));
        await ctx.reply(panel(`${teamInfo.strTeam} recent matches`, rows.length > 0 ? rows : [{ label: 'Results', value: 'none returned' }], `League: ${teamInfo.strLeague || 'unknown'}`));
      } catch (err) {
        await ctx.reply(providerNotConfigured(ctx));
      }
    }
  }
];
