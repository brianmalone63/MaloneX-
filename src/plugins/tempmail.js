import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchJson } from '../core/media.js';

// Temporary email through the free mail.tm API (no key required).
// Each sender owns one mailbox at a time, stored in the docs collection.
const COLLECTION = 'tempmail';

async function getMailbox(ctx) {
  return ctx.store.getDoc(ctx.session.id, COLLECTION, ctx.sender);
}

async function saveMailbox(ctx, mailbox) {
  await ctx.store.setDoc(ctx.session.id, COLLECTION, ctx.sender, mailbox);
}

async function apiToken(address, password) {
  const data = await fetchJson('https://api.mail.tm/token', {
    method: 'POST',
    body: { address, password }
  });
  return data.token;
}

export default [
  {
    name: 'tempmail',
    aliases: ['tempmailgen', 'newmail'],
    description: 'Generate a temporary email address (mail.tm)',
    category: 'Temp Mail',
    access: 'public',
    async run(ctx) {
      if (!ctx.store) {
        await ctx.reply(errorPanel('No storage backend is attached to this session.'));
        return;
      }
      const existing = await getMailbox(ctx);
      if (existing) {
        await ctx.reply(panel('Temp mail', [
          { label: 'Your address', value: existing.address },
          { label: 'Created', value: existing.createdAt?.slice(0, 19).replace('T', ' ') || '' }
        ], `Use .tempinbox to check mail, or .delmail then .tempmail for a new address.`));
        return;
      }
      try {
        const domains = await fetchJson('https://api.mail.tm/domains?page=1');
        const domain = (domains?.['hydra:member'] || domains?.member || [])[0]?.domain;
        if (!domain) throw new Error('no domains available');
        const user = `mx${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
        const address = `${user}@${domain}`;
        const password = `mx-${Math.random().toString(36).slice(2, 12)}`;
        await fetchJson('https://api.mail.tm/accounts', { method: 'POST', body: { address, password } });
        const mailbox = { address, password, createdAt: new Date().toISOString() };
        await saveMailbox(ctx, mailbox);
        await ctx.reply(panel('Temp mail created', [
          { label: 'Address', value: address },
          { label: 'Note', value: 'One mailbox per sender. Check with .tempinbox.' }
        ], 'The mailbox lives until mail.tm removes it; delete with .delmail.'));
      } catch (err) {
        await ctx.reply(errorPanel(`The temporary mailbox could not be created: ${err.message}`));
      }
    }
  },
  {
    name: 'tempinbox',
    aliases: ['checkinbox'],
    description: 'Check the inbox of your temp address',
    category: 'Temp Mail',
    access: 'public',
    async run(ctx) {
      const mailbox = await getMailbox(ctx);
      if (!mailbox) {
        await ctx.reply(notice('You have no temp address yet. Generate one with .tempmail.'));
        return;
      }
      try {
        const token = await apiToken(mailbox.address, mailbox.password);
        const data = await fetchJson('https://api.mail.tm/messages?page=1', { headers: { Authorization: `Bearer ${token}` } });
        const messages = data?.['hydra:member'] || data?.member || [];
        if (messages.length === 0) {
          await ctx.reply(panel('Temp inbox', [{ label: 'Address', value: mailbox.address }, { label: 'Messages', value: 'none yet' }]));
          return;
        }
        const rows = messages.slice(0, 8).map((m, i) => ({
          label: `${i + 1}. ${m.subject || '(no subject)'}`.slice(0, 55),
          value: `from ${m.from?.address || 'unknown'} | ${m.createdAt?.slice(0, 16).replace('T', ' ') || ''}`
        }));
        await ctx.reply(panel('Temp inbox', rows, `Read one with .readmail NUMBER.`));
      } catch (err) {
        await ctx.reply(errorPanel(`The inbox could not be checked: ${err.message}`));
      }
    }
  },
  {
    name: 'readmail',
    aliases: ['getmsg'],
    description: 'Read one temp email by number',
    category: 'Temp Mail',
    access: 'public',
    async run(ctx) {
      const mailbox = await getMailbox(ctx);
      if (!mailbox) {
        await ctx.reply(notice('You have no temp address. Generate one with .tempmail.'));
        return;
      }
      const index = Number.parseInt(ctx.args[0] || '', 10);
      if (!Number.isInteger(index) || index < 1) {
        await ctx.reply(usage(`${ctx.prefix}readmail 1`));
        return;
      }
      try {
        const token = await apiToken(mailbox.address, mailbox.password);
        const headers = { Authorization: `Bearer ${token}` };
        const data = await fetchJson('https://api.mail.tm/messages?page=1', { headers });
        const messages = data?.['hydra:member'] || data?.member || [];
        const summary = messages[index - 1];
        if (!summary) {
          await ctx.reply(notice('That message number does not exist.'));
          return;
        }
        const full = await fetchJson(`https://api.mail.tm/messages/${summary.id}`, { headers });
        const body = String(full.text || '(HTML only message; open the mail provider to view it)').slice(0, 2500);
        await ctx.reply(panel(`Mail ${index}: ${summary.subject || '(no subject)'}`, [
          `From: ${summary.from?.address || 'unknown'}`,
          `Date: ${summary.createdAt?.slice(0, 19).replace('T', ' ') || ''}`,
          '',
          body
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The message could not be read: ${err.message}`));
      }
    }
  },
  {
    name: 'delmail',
    aliases: [],
    description: 'Delete your temp mailbox record',
    category: 'Temp Mail',
    access: 'public',
    async run(ctx) {
      const mailbox = await getMailbox(ctx);
      if (!mailbox) {
        await ctx.reply(notice('You have no temp address.'));
        return;
      }
      await ctx.store.delDoc(ctx.session.id, COLLECTION, ctx.sender);
      await ctx.reply(notice(`The address ${mailbox.address} was released. You can generate a new one with .tempmail.`));
    }
  }
];
