import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { fetchBuffer } from '../core/media.js';
import { toUserJid } from '../core/groups.js';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the target of an owner action from a mention, a quoted message or a
// bare number argument.
function resolveTarget(ctx) {
  if (ctx.mentioned.length > 0) return ctx.mentioned[0];
  if (ctx.quotedSender) return ctx.quotedSender;
  if (ctx.argText.trim()) return toUserJid(ctx.argText.trim());
  return null;
}

async function downloadQuotedMedia(ctx) {
  const inner = ctx.quotedInner || {};
  const mediaKey = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']
    .find((k) => inner[k]);
  if (!mediaKey) return null;
  const buffer = await ctx.download({ key: ctx.msg.key, message: ctx.quoted }, mediaKey);
  if (!buffer || !buffer.length) throw new Error('The media could not be downloaded.');
  return { key: mediaKey, buffer, meta: inner[mediaKey] || {} };
}

function mediaPayload(kind, buffer, meta = {}, caption = null) {
  switch (kind) {
    case 'imageMessage': return caption ? { image: buffer, caption } : { image: buffer };
    case 'videoMessage': return caption ? { video: buffer, caption } : { video: buffer };
    case 'audioMessage': return { audio: buffer, mimetype: meta.mimetype || 'audio/mp4', ptt: Boolean(meta.ptt) };
    case 'stickerMessage': return { sticker: buffer };
    case 'documentMessage': return {
      document: buffer,
      fileName: meta.fileName || 'document',
      mimetype: meta.mimetype || 'application/octet-stream',
      ...(caption ? { caption } : {})
    };
    default: return { document: buffer, fileName: 'media', mimetype: 'application/octet-stream' };
  }
}

function sendMedia(ctx, target, kind, buffer, meta, caption) {
  return ctx.sock.sendMessage(target, mediaPayload(kind, buffer, meta, caption));
}

export default [
  // ---------- view once ----------
  {
    name: 'vv2',
    aliases: ['reveal'],
    description: 'Reveal view-once media and send it into the current chat',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const quoted = ctx.quoted;
      if (!quoted) {
        await ctx.reply(usage(`Reply to a view-once message with ${ctx.prefix}vv2.`));
        return;
      }
      const { unwrapViewOnce } = await import('./vv.js');
      const inner = unwrapViewOnce(quoted);
      if (!inner) {
        await ctx.reply(errorPanel('The quoted message is not a view-once message.'));
        return;
      }
      const mediaKey = ['imageMessage', 'videoMessage', 'audioMessage'].find((k) => inner[k]);
      if (!mediaKey) {
        await ctx.reply(errorPanel('The view-once message contains no supported media.'));
        return;
      }
      try {
        const buffer = await ctx.download({ key: ctx.msg.key, message: quoted }, mediaKey);
        if (!buffer?.length) throw new Error('download returned no data');
        const payload = mediaKey === 'imageMessage'
          ? { image: buffer }
          : mediaKey === 'videoMessage'
            ? { video: buffer }
            : { audio: buffer, ptt: true, mimetype: inner[mediaKey].mimetype || 'audio/mp4' };
        await ctx.sock.sendMessage(ctx.jid, payload, { quoted: ctx.msg });
        await ctx.reply(panel('View-once', [{ label: 'Status', value: 'Revealed into this chat.' }]));
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel('The media could not be revealed. It may have expired.'));
      }
    }
  },

  // ---------- message utilities ----------
  {
    name: 'save',
    aliases: ['sv'],
    description: 'Save a quoted message into your own chat',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (!ctx.quoted) {
        await ctx.reply(usage(`Reply to any message with ${ctx.prefix}save to keep it in your own chat.`));
        return;
      }
      const target = ctx.session.ownJid;
      if (!target) {
        await ctx.reply(errorPanel('Your own chat is unavailable until the session is linked.'));
        return;
      }
      const inner = ctx.quotedInner || {};
      const text = inner.conversation || inner.extendedTextMessage?.text
        || inner.imageMessage?.caption || inner.videoMessage?.caption || '';
      try {
        const media = await downloadQuotedMedia(ctx);
        if (media) {
          await sendMedia(ctx, target, media.key, media.buffer, media.meta, media.meta.caption || null);
        } else if (text) {
          await ctx.sock.sendMessage(target, { text });
        } else {
          await ctx.reply(errorPanel('This message type cannot be saved.'));
          return;
        }
        await ctx.reply(panel('Saved', [{ label: 'Delivered to', value: 'your own chat' }]));
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The message could not be saved: ${err.message}`));
      }
    }
  },
  {
    name: 'forward',
    aliases: ['fwd'],
    description: 'Forward a quoted message to a number or group JID',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (!ctx.quoted) {
        await ctx.reply(usage(`Reply to a message, then ${ctx.prefix}forward 2547xxxxxxx`));
        return;
      }
      const targetRaw = ctx.args[0];
      if (!targetRaw) {
        await ctx.reply(usage(`Provide a destination: ${ctx.prefix}forward 2547xxxxxxx or a group JID.`));
        return;
      }
      let target = targetRaw.includes('@g.us') ? targetRaw : toUserJid(targetRaw);
      if (!target) {
        await ctx.reply(errorPanel('That destination does not look like a valid number or JID.'));
        return;
      }
      const inner = ctx.quotedInner || {};
      const text = inner.conversation || inner.extendedTextMessage?.text || '';
      try {
        const media = await downloadQuotedMedia(ctx);
        const caption = [ctx.argText.split(/\s+/).slice(1).join(' '), text].filter(Boolean).join('\n') || null;
        if (media) await sendMedia(ctx, target, media.key, media.buffer, media.meta, caption);
        else if (text) await ctx.sock.sendMessage(target, { text: caption || text });
        else {
          // Forward unknown structures natively.
          await ctx.sock.sendMessage(target, { forward: { key: ctx.msg.key, message: ctx.quoted } });
        }
        await ctx.reply(panel('Forwarded', [{ label: 'Destination', value: target }]));
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`Forwarding failed: ${err.message}`));
      }
    }
  },
  {
    name: 'tostatus',
    aliases: ['tomystatus'],
    description: 'Post a quoted message to your WhatsApp status',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (!ctx.quoted) {
        await ctx.reply(usage(`Reply to a message with ${ctx.prefix}tostatus to post it as your status.`));
        return;
      }
      const inner = ctx.quotedInner || {};
      const caption = ctx.argText.trim() || inner.imageMessage?.caption || inner.videoMessage?.caption || '';
      try {
        const media = await downloadQuotedMedia(ctx);
        if (media?.key === 'imageMessage') {
          await ctx.sock.sendMessage('status@broadcast', { image: media.buffer, caption });
        } else if (media?.key === 'videoMessage') {
          await ctx.sock.sendMessage('status@broadcast', { video: media.buffer, caption });
        } else {
          const text = inner.conversation || inner.extendedTextMessage?.text || caption;
          if (!text) {
            await ctx.reply(errorPanel('Only text, images and videos can be posted to a status.'));
            return;
          }
          await ctx.sock.sendMessage('status@broadcast', { text: String(text) });
        }
        await ctx.reply(panel('Status', [{ label: 'Posted', value: 'yes' }]));
      } catch (err) {
        ctx.session.health.errors += 1;
        await ctx.reply(errorPanel(`The status could not be posted: ${err.message}`));
      }
    }
  },
  {
    name: 'jid',
    aliases: ['chatid'],
    description: 'Show the JID of this chat or of a quoted user',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const rows = [{ label: 'Chat JID', value: ctx.jid }];
      if (ctx.isGroup) rows.push({ label: 'Your JID', value: ctx.sender });
      if (ctx.quotedSender) rows.push({ label: 'Quoted user', value: ctx.quotedSender });
      if (ctx.mentioned.length > 0) rows.push({ label: 'Mentioned', value: ctx.mentioned.join(', ') });
      await ctx.reply(panel('JIDs', rows));
    }
  },
  {
    name: 'cmd',
    aliases: ['getcmd'],
    description: 'Send the source file of a command as a document',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const name = (ctx.args[0] || '').toLowerCase().replace(/^\./, '');
      if (!name) {
        await ctx.reply(usage(`${ctx.prefix}cmd ping - send the source of the ping command.`));
        return;
      }
      const cmd = ctx.registry?.find(name);
      if (!cmd?.sourceFile) {
        await ctx.reply(errorPanel(`No command named "${name}" was found.`));
        return;
      }
      try {
        const buffer = await fs.readFile(cmd.sourceFile);
        await ctx.sock.sendMessage(ctx.jid, {
          document: buffer,
          fileName: path.basename(cmd.sourceFile),
          mimetype: 'text/javascript'
        }, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`The source could not be read: ${err.message}`));
      }
    }
  },
  {
    name: 'cachedmeta',
    aliases: ['cachedmetadata'],
    description: 'Show the cached metadata of a group',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = ctx.args[0] || (ctx.isGroup ? ctx.jid : null);
      if (!target?.endsWith('@g.us')) {
        await ctx.reply(usage(`Run inside a group or pass a group JID: ${ctx.prefix}cachedmeta 123456@g.us`));
        return;
      }
      const { getGroupMeta } = await import('../core/groups.js');
      try {
        const meta = await getGroupMeta(ctx.sock, target);
        await ctx.reply(panel('Cached metadata', [
          { label: 'Name', value: meta?.subject || 'unknown' },
          { label: 'Participants', value: String(meta?.participants?.length ?? 0) },
          { label: 'Announcement', value: meta?.announce ? 'yes' : 'no' },
          { label: 'Restricted', value: meta?.restrict ? 'yes' : 'no' }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`Metadata lookup failed: ${err.message}`));
      }
    }
  },

  // ---------- account ----------
  {
    name: 'pp',
    aliases: ['setpp'],
    description: 'Set the profile picture from a quoted image',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (ctx.mediaType !== 'imageMessage' || !ctx.quoted) {
        await ctx.reply(usage(`Reply to an image with ${ctx.prefix}pp to set it as the profile picture.`));
        return;
      }
      try {
        const { buffer } = await downloadQuotedMedia(ctx);
        await ctx.sock.updateProfilePicture(ctx.session.ownJid, buffer);
        await ctx.reply(panel('Profile picture', [{ label: 'Updated', value: 'yes' }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The profile picture could not be updated: ${err.message}`));
      }
    }
  },
  {
    name: 'fullpp',
    aliases: ['setfullpp'],
    description: 'Set a full-size profile picture without cropping',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (ctx.mediaType !== 'imageMessage' || !ctx.quoted) {
        await ctx.reply(usage(`Reply to an image with ${ctx.prefix}fullpp for a crop-free profile picture.`));
        return;
      }
      try {
        const { buffer } = await downloadQuotedMedia(ctx);
        // Wide-picture upload via the picture IQ node (same technique as
        // full-size avatars in WhatsApp Web clients).
        const iq = {
          tag: 'iq',
          attrs: { to: ctx.session.ownJid, type: 'set', xmlns: 'w:profile:picture' },
          content: [
            { tag: 'picture', attrs: { type: 'image' }, content: buffer },
            { tag: 'picture', attrs: { type: 'preview' }, content: buffer }
          ]
        };
        await ctx.sock.query(iq);
        await ctx.reply(panel('Profile picture', [{ label: 'Updated full-size', value: 'yes' }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The full-size picture could not be applied: ${err.message}`));
      }
    }
  },
  {
    name: 'whois',
    aliases: ['profile'],
    description: 'Show profile details of a quoted or mentioned user',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention someone or reply to their message, then send ${ctx.prefix}whois.`));
        return;
      }
      const rows = [{ label: 'JID', value: target }];
      try {
        const url = await ctx.sock.profilePictureUrl(target, 'image').catch(() => null);
        rows.push({ label: 'Picture', value: url ? 'available' : 'not set' });
        if (url) rows.push({ label: 'Picture URL', value: url.slice(0, 120) });
        const status = await ctx.sock.fetchStatus(target).catch(() => null);
        const statusText = status?.[0]?.status || status?.status || null;
        if (statusText) rows.push({ label: 'Status', value: String(statusText).slice(0, 120) });
        const payload = { text: panel('Profile', rows) };
        if (url) payload.image = { url };
        await ctx.sock.sendMessage(ctx.jid, payload, { quoted: ctx.msg });
      } catch (err) {
        await ctx.reply(errorPanel(`Profile lookup failed: ${err.message}`));
      }
    }
  },
  {
    name: 'getpp',
    aliases: ['stealpp'],
    description: 'Download the profile picture of a user or this group',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = ctx.isGroup ? ctx.jid : resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention someone or reply to their message, then send ${ctx.prefix}getpp.`));
        return;
      }
      try {
        const url = await ctx.sock.profilePictureUrl(target, 'image');
        const buffer = await fetchBuffer(url);
        await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: `${target}` }, { quoted: ctx.msg });
      } catch {
        await ctx.reply(notice('That profile has no picture, or it cannot be fetched.'));
      }
    }
  },
  {
    name: 'mygroups',
    aliases: ['listgroups'],
    description: 'List every group this session has joined',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      try {
        const groups = await ctx.sock.groupFetchAllParticipating();
        const list = Object.values(groups || {});
        if (list.length === 0) {
          await ctx.reply(notice('This session has not joined any groups.'));
          return;
        }
        const rows = list
          .sort((a, b) => String(a.subject).localeCompare(String(b.subject)))
          .map((g) => ({ label: g.subject || 'unnamed', value: `${g.id} (${g.participants?.length ?? 0} members)` }));
        await ctx.reply(panel('Joined groups', rows.slice(0, 40), `${list.length} groups in total.`));
      } catch (err) {
        await ctx.reply(errorPanel(`Groups could not be listed: ${err.message}`));
      }
    }
  },
  {
    name: 'join',
    aliases: ['joingc'],
    description: 'Join a group from an invite link',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const link = ctx.argText.trim();
      const match = link.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]+)/i);
      if (!match) {
        await ctx.reply(usage(`${ctx.prefix}join https://chat.whatsapp.com/INVITECODE`));
        return;
      }
      try {
        const jid = await ctx.sock.groupAcceptInvite(match[1]);
        await ctx.reply(panel('Group invite', [{ label: 'Joined', value: jid }]));
      } catch (err) {
        const reason = /gone|not-found/i.test(err.message) ? 'The invite link is invalid or was revoked.' : err.message;
        await ctx.reply(errorPanel(`Could not join: ${reason}`));
      }
    }
  },

  // ---------- blocking ----------
  {
    name: 'block',
    aliases: ['blockuser'],
    description: 'Block a number. Mention, quote or type the number',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Provide a number: ${ctx.prefix}block 2547xxxxxxx`));
        return;
      }
      await ctx.sock.updateBlockStatus(target, 'block');
      await ctx.reply(panel('Block', [{ label: 'Blocked', value: target }]));
    }
  },
  {
    name: 'unblock',
    aliases: ['unblockuser'],
    description: 'Unblock a number. Mention, quote or type the number',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Provide a number: ${ctx.prefix}unblock 2547xxxxxxx`));
        return;
      }
      await ctx.sock.updateBlockStatus(target, 'unblock');
      await ctx.reply(panel('Block', [{ label: 'Unblocked', value: target }]));
    }
  },
  {
    name: 'blocklist',
    aliases: ['blocked'],
    description: 'List every blocked number',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const list = await ctx.sock.fetchBlocklist();
      if (!list || list.length === 0) {
        await ctx.reply(notice('No numbers are blocked.'));
        return;
      }
      const rows = list.map((jid) => ({ label: `+${String(jid).split('@')[0]}`, value: jid }));
      await ctx.reply(panel('Blocked numbers', rows.slice(0, 50), `${list.length} in total.`));
    }
  },

  // ---------- sudo ----------
  {
    name: 'setsudo',
    aliases: ['addsudo'],
    description: 'Grant owner-level access to a number',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention someone or type a number: ${ctx.prefix}setsudo 2547xxxxxxx`));
        return;
      }
      const num = target.split('@')[0];
      const current = String(ctx.settings.SUDO_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (current.includes(num)) {
        await ctx.reply(notice(`+${num} already has sudo access.`));
        return;
      }
      current.push(num);
      const result = await ctx.session.setSetting('SUDO_NUMBERS', current.join(','));
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Sudo users', [{ label: 'Added', value: `+${num}` }, { label: 'Total', value: String(current.length) }]));
    }
  },
  {
    name: 'delsudo',
    aliases: ['removesudo'],
    description: 'Revoke owner-level access from a number',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention someone or type a number: ${ctx.prefix}delsudo 2547xxxxxxx`));
        return;
      }
      const num = target.split('@')[0];
      const current = String(ctx.settings.SUDO_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
      const next = current.filter((n) => n !== num);
      if (next.length === current.length) {
        await ctx.reply(notice(`+${num} does not have sudo access.`));
        return;
      }
      const result = await ctx.session.setSetting('SUDO_NUMBERS', next.join(','));
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(panel('Sudo users', [{ label: 'Removed', value: `+${num}` }]));
    }
  },
  {
    name: 'getsudo',
    aliases: ['sudolist'],
    description: 'List numbers with owner-level access',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const current = String(ctx.settings.SUDO_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
      const configOwners = (ctx.config.owners || []).map((n) => `+${n} (config)`);
      await ctx.reply(panel('Sudo users', [
        { label: 'Settings', value: current.length ? current.map((n) => `+${n}`).join(', ') : 'none' },
        { label: 'Config OWNER', value: configOwners.join(', ') || 'none' }
      ]));
    }
  },
  {
    name: 'resetsudo',
    aliases: ['clearsudo'],
    description: 'Remove every sudo number set through commands',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const result = await ctx.session.setSetting('SUDO_NUMBERS', '');
      if (!result.ok) {
        await ctx.reply(errorPanel(result.error));
        return;
      }
      await ctx.reply(notice('Every sudo number set through commands was removed.'));
    }
  },

  // ---------- developer tools ----------
  {
    name: '$',
    aliases: ['shell'],
    description: 'Run a shell command on the host (owner only)',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const command = ctx.argText.trim();
      if (!command) {
        await ctx.reply(usage(`${ctx.prefix}$ ls -la`));
        return;
      }
      execFile('sh', ['-c', command], { timeout: 30000, maxBuffer: 1024 * 512 }, async (err, stdout, stderr) => {
        const out = String(stdout || '').slice(0, 3500) || String(stderr || '').slice(0, 3500) || '(no output)';
        await ctx.reply(panel('Shell', [command, '', out, err ? `Exit: ${err.message}` : ''].filter(Boolean)));
      });
    }
  },
  {
    name: '>',
    aliases: ['eval'],
    description: 'Evaluate a JavaScript expression (owner only)',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const code = ctx.argText.trim();
      if (!code) {
        await ctx.reply(usage(`${ctx.prefix}> 2 + 2`));
        return;
      }
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const result = await new AsyncFunction('ctx', `return (${code});`)(ctx);
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        await ctx.reply(panel('Eval', [code, '', String(text).slice(0, 3000)]));
      } catch (err) {
        await ctx.reply(errorPanel(`Evaluation failed: ${err.message}`));
      }
    }
  },
  {
    name: 'update',
    aliases: ['checkupdate'],
    description: 'Check the MaloneX repository for newer commits',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const repo = 'brianmalone63/MaloneX-';
      try {
        const data = await fetchJson(`https://api.github.com/repos/${repo}/commits/main`, { timeoutMs: 15000 });
        const latest = data?.sha?.slice(0, 8) || 'unknown';
        const message = data?.commit?.message?.split('\n')[0] || '';
        await ctx.reply(panel('Update check', [
          { label: 'Latest commit', value: latest },
          { label: 'Message', value: message.slice(0, 120) },
          { label: 'Date', value: String(data?.commit?.committer?.date || 'unknown').slice(0, 19) },
          { label: 'Note', value: 'Deploy by pulling the repository on your host; the bot process can then be restarted with .restart.' }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The update check failed: ${err.message}`));
      }
    }
  },
  {
    name: 'resetdb',
    aliases: ['resetdata'],
    description: 'Reset per-session data: settings, sudo, notes and games (keeps pairing)',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      if (!ctx.store) {
        await ctx.reply(errorPanel('No storage backend is attached to this session.'));
        return;
      }
      for (const key of ['SUDO_NUMBERS']) {
        await ctx.session.setSetting(key, '').catch(() => {});
      }
      for (const collection of ['games', 'notes', 'warn_antilink', 'warn_antibad', 'warn_antigroupmention', 'badwords']) {
        await ctx.store.delAllDocs(ctx.session.id, collection).catch(() => {});
      }
      await ctx.reply(notice('Session data was reset. Settings keep their defaults; pairing is untouched.'));
    }
  }
];
