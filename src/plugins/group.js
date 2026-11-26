import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { toUserJid, digits, invalidateGroup, superUserNumbers } from '../core/groups.js';
import { readGroupSettings, writeGroupSetting, addWarning, resetWarnings } from '../core/groupsettings.js';

function guard(ctx, { needBotAdmin = true } = {}) {
  if (!ctx.isGroup) return 'This command only works inside a group.';
  if (needBotAdmin && !ctx.isBotAdmin) return 'The bot is not an admin in this group.';
  return null;
}

function resolveTarget(ctx) {
  if (ctx.mentioned.length > 0) return ctx.mentioned[0];
  if (ctx.quotedSender) return ctx.quotedSender;
  if (ctx.argText.trim()) return toUserJid(ctx.argText.trim().split(/\s+/)[0]);
  return null;
}

function cannotAct(ctx, targetNum) {
  const superUsers = superUserNumbers(ctx.session, ctx.session.ownJid);
  if (superUsers.has(targetNum)) return 'That user is a super user on this bot.';
  if (targetNum === digits(ctx.session.ownJid)) return 'That user is this bot itself.';
  if (ctx.isSuperAdmin && ctx.adminNums.includes(targetNum)) return 'That user is the group owner.';
  return null;
}

function targetFromParticipants(ctx, target) {
  const num = digits(target);
  const found = (ctx.participants || []).find((p) => digits(p.pn || p.phoneNumber || p.id) === num);
  return found ? (found.pn || found.phoneNumber || found.id) : target;
}

async function actOnParticipant(ctx, target, action, doneText) {
  const num = digits(target);
  const blocked = cannotAct(ctx, num);
  if (blocked) {
    await ctx.reply(errorPanel(blocked));
    return;
  }
  const jid = targetFromParticipants(ctx, target);
  try {
    const result = await ctx.sock.groupParticipantsUpdate(ctx.jid, [jid], action);
    const status = String(result?.[0]?.status || '');
    invalidateGroup(ctx.jid);
    if (status === '403') {
      await ctx.reply(notice(`+${num} could not be ${action}d directly (privacy settings).`));
      return;
    }
    await ctx.sock.sendMessage(ctx.jid, {
      text: panel(action[0].toUpperCase() + action.slice(1), [
        { label: 'User', value: `+${num}` },
        { label: 'Result', value: doneText }
      ]),
      mentions: [jid]
    }, { quoted: ctx.msg });
  } catch (err) {
    await ctx.reply(errorPanel(`The ${action} failed: ${err.message}`));
  }
}

export default [
  {
    name: 'mute',
    aliases: ['close', 'gcclose'],
    description: 'Close the group so only admins can write',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      invalidateGroup(ctx.jid);
      await ctx.reply(panel('Group', [{ label: 'State', value: 'Only admins can send messages.' }]));
    }
  },
  {
    name: 'unmute',
    aliases: ['open', 'gcopen'],
    description: 'Open the group so every member can write',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      invalidateGroup(ctx.jid);
      await ctx.reply(panel('Group', [{ label: 'State', value: 'All members can send messages.' }]));
    }
  },
  {
    name: 'promote',
    aliases: ['toadmin'],
    description: 'Promote a user to group admin',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention, quote or type a number: ${ctx.prefix}promote 2547xxxxxxx`));
        return;
      }
      await actOnParticipant(ctx, target, 'promote', 'promoted to admin');
    }
  },
  {
    name: 'demote',
    aliases: [],
    description: 'Demote a group admin',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention, quote or type a number: ${ctx.prefix}demote 2547xxxxxxx`));
        return;
      }
      await actOnParticipant(ctx, target, 'demote', 'demoted to member');
    }
  },
  {
    name: 'kick',
    aliases: ['remove'],
    description: 'Remove a user from the group',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`Mention, quote or type a number: ${ctx.prefix}kick 2547xxxxxxx`));
        return;
      }
      if (digits(target) === digits(ctx.sender)) {
        await ctx.reply(notice('You cannot remove yourself with this command.'));
        return;
      }
      await actOnParticipant(ctx, target, 'remove', 'removed from the group');
    }
  },
  {
    name: 'add',
    aliases: ['invite'],
    description: 'Add a number to the group',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(usage(`${ctx.prefix}add 2547xxxxxxx`));
        return;
      }
      const num = digits(target);
      if (num.length < 7) {
        await ctx.reply(errorPanel('That number is too short to be valid.'));
        return;
      }
      try {
        const [check] = await ctx.sock.onWhatsApp(num);
        if (!check?.exists) {
          await ctx.reply(notice(`+${num} is not registered on WhatsApp.`));
          return;
        }
      } catch {
        await ctx.reply(notice(`The number could not be verified; trying to add it anyway.`));
      }
      await actOnParticipant(ctx, target, 'add', 'added to the group');
    }
  },
  {
    name: 'link',
    aliases: ['gclink', 'grouplink'],
    description: 'Show the group invite link',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      try {
        const code = await ctx.sock.groupInviteCode(ctx.jid);
        const rows = [
          { label: 'Group', value: ctx.groupName || 'group' },
          { label: 'Members', value: String(ctx.participants?.length ?? 0) },
          { label: 'Link', value: `https://chat.whatsapp.com/${code}` }
        ];
        await ctx.reply(panel('Invite link', rows));
      } catch (err) {
        await ctx.reply(errorPanel(`The invite link could not be fetched: ${err.message}`));
      }
    }
  },
  {
    name: 'resetlink',
    aliases: ['revokelink'],
    description: 'Revoke and regenerate the group invite link',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      try {
        await ctx.sock.groupRevokeInvite(ctx.jid);
        const code = await ctx.sock.groupInviteCode(ctx.jid);
        await ctx.reply(panel('Invite link', [
          { label: 'Reset', value: 'yes' },
          { label: 'New link', value: `https://chat.whatsapp.com/${code}` }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The link could not be reset: ${err.message}`));
      }
    }
  },
  {
    name: 'newgroup',
    aliases: ['creategroup'],
    description: 'Create a new group with the sender as first member',
    category: 'Group',
    access: 'owner',
    async run(ctx) {
      const name = ctx.argText.trim();
      if (!name) {
        await ctx.reply(usage(`${ctx.prefix}newgroup My New Group`));
        return;
      }
      try {
        const group = await ctx.sock.groupCreate(name, [ctx.sender]);
        const code = await ctx.sock.groupInviteCode(group.id);
        await ctx.reply(panel('Group created', [
          { label: 'Name', value: name },
          { label: 'JID', value: group.id },
          { label: 'Invite', value: `https://chat.whatsapp.com/${code}` }
        ]));
      } catch (err) {
        await ctx.reply(errorPanel(`The group could not be created: ${err.message}`));
      }
    }
  },
  {
    name: 'killgc',
    aliases: ['destroygc'],
    description: 'Remove all members and leave the group',
    category: 'Group',
    access: 'owner',
    groupOnly: true,
    async run(ctx) {
      const blocked = guard(ctx);
      if (blocked) return ctx.reply(notice(blocked));
      await ctx.reply(notice('Terminating this group: every member will be removed and the bot will leave.'));
      try {
        const meta = await ctx.sock.groupMetadata(ctx.jid);
        const botNum = digits(ctx.session.ownJid);
        const keep = new Set([botNum, digits(ctx.sender)]);
        const toRemove = (meta.participants || [])
          .map((p) => p.pn || p.phoneNumber || p.id)
          .filter((jid) => jid && !keep.has(digits(jid)));
        if (toRemove.length > 0) {
          await ctx.sock.groupParticipantsUpdate(ctx.jid, toRemove, 'remove');
        }
        await ctx.sock.groupLeave(ctx.jid);
      } catch (err) {
        await ctx.reply(errorPanel(`The group could not be terminated: ${err.message}`));
      }
    }
  },
  {
    name: 'left',
    aliases: ['leave'],
    description: 'Make the bot leave this group',
    category: 'Group',
    access: 'owner',
    groupOnly: true,
    async run(ctx) {
      await ctx.reply(notice('Leaving this group.'));
      await ctx.sock.groupLeave(ctx.jid).catch((err) => ctx.reply(errorPanel(`Could not leave: ${err.message}`)));
    }
  },
  {
    name: 'accept',
    aliases: ['approve'],
    description: 'Approve one pending join request by number',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const target = toUserJid(ctx.args[0] || '');
      if (!target) {
        await ctx.reply(usage(`${ctx.prefix}accept 2547xxxxxxx`));
        return;
      }
      try {
        await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, [target], 'approve');
        await ctx.reply(panel('Join request', [{ label: 'Approved', value: `+${digits(target)}` }]));
      } catch {
        await ctx.reply(notice('No pending join request found for that number.'));
      }
    }
  },
  {
    name: 'reject',
    aliases: ['decline'],
    description: 'Reject one pending join request by number',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const target = toUserJid(ctx.args[0] || '');
      if (!target) {
        await ctx.reply(usage(`${ctx.prefix}reject 2547xxxxxxx`));
        return;
      }
      try {
        await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, [target], 'reject');
        await ctx.reply(panel('Join request', [{ label: 'Rejected', value: `+${digits(target)}` }]));
      } catch {
        await ctx.reply(notice('No pending join request found for that number.'));
      }
    }
  },
  {
    name: 'acceptall',
    aliases: ['approveall'],
    description: 'Approve every pending join request',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const pending = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
      if (!pending?.length) {
        await ctx.reply(notice('There are no pending join requests.'));
        return;
      }
      await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, pending.map((p) => p.jid), 'approve');
      await ctx.reply(panel('Join requests', [{ label: 'Approved', value: String(pending.length) }]));
    }
  },
  {
    name: 'rejectall',
    aliases: ['declineall'],
    description: 'Reject every pending join request',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const pending = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
      if (!pending?.length) {
        await ctx.reply(notice('There are no pending join requests.'));
        return;
      }
      await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, pending.map((p) => p.jid), 'reject');
      await ctx.reply(panel('Join requests', [{ label: 'Rejected', value: String(pending.length) }]));
    }
  },
  {
    name: 'listrequests',
    aliases: ['joinrequests'],
    description: 'List pending join requests',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const pending = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
      if (!pending?.length) {
        await ctx.reply(notice('There are no pending join requests.'));
        return;
      }
      const rows = pending.map((p) => ({ label: `+${digits(p.jid)}`, value: p.jid }));
      await ctx.reply(panel('Pending join requests', rows.slice(0, 40), `${pending.length} waiting.`));
    }
  },
  {
    name: 'online',
    aliases: ['listonline'],
    description: 'Probe which members are currently online (about 10 seconds)',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const seen = new Set();
      const handler = ({ id, presences }) => {
        for (const [user, presence] of Object.entries(presences || {})) {
          if (presence.lastKnownPresence === 'available' || presence?.presence === 'available') {
            seen.add(digits(user) || user);
          }
        }
      };
      ctx.sock.ev.on('presence.update', handler);
      for (const p of ctx.participants || []) {
        const jid = p.pn || p.phoneNumber || p.id;
        if (jid) await ctx.sock.presenceSubscribe(jid).catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
      ctx.sock.ev.off('presence.update', handler);
      if (seen.size === 0) {
        await ctx.reply(notice('No online presence was reported in the last 10 seconds.'));
        return;
      }
      const rows = [...seen].slice(0, 40).map((num) => ({ label: `+${num}`, value: 'online' }));
      await ctx.reply(panel('Online members', rows, `${seen.size} detected (detection depends on clients sharing presence).`));
    }
  },
  {
    name: 'groupname',
    aliases: ['gcname'],
    description: 'Change the group name',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const name = ctx.argText.trim();
      if (!name) {
        await ctx.reply(usage(`${ctx.prefix}groupname New Group Name`));
        return;
      }
      try {
        await ctx.sock.groupUpdateSubject(ctx.jid, name.slice(0, 60));
        invalidateGroup(ctx.jid);
        await ctx.reply(panel('Group name', [{ label: 'Changed to', value: name.slice(0, 60) }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The name could not be changed: ${err.message}`));
      }
    }
  },
  {
    name: 'gcdesc',
    aliases: ['gcdescription'],
    description: 'Change the group description',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}gcdesc New description text`));
        return;
      }
      try {
        await ctx.sock.groupUpdateDescription(ctx.jid, text.slice(0, 2048));
        invalidateGroup(ctx.jid);
        await ctx.reply(panel('Group description', [{ label: 'Updated', value: `${text.length} characters` }]));
      } catch (err) {
        await ctx.reply(errorPanel(`The description could not be changed: ${err.message}`));
      }
    }
  },
  {
    name: 'tagall',
    aliases: ['mentionall'],
    description: 'Mention every member with an optional message',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const jids = (ctx.participants || []).map((p) => p.pn || p.phoneNumber || p.id).filter(Boolean);
      const header = ctx.argText.trim() || 'Attention everyone.';
      const lines = [`*${header}*`, '', ...jids.map((j, i) => `${i + 1}. @${digits(j)}`)];
      await ctx.sock.sendMessage(ctx.jid, { text: lines.join('\n'), mentions: jids }, { quoted: ctx.msg });
    }
  },
  {
    name: 'tagadmins',
    aliases: [],
    description: 'Mention only the group admins with an optional message',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const adminJids = (ctx.participants || [])
        .filter((p) => p.admin)
        .map((p) => p.pn || p.phoneNumber || p.id)
        .filter(Boolean);
      if (adminJids.length === 0) {
        await ctx.reply(notice('This group has no admins besides WhatsApp itself.'));
        return;
      }
      const header = ctx.argText.trim() || 'Calling the admins.';
      const lines = [`*${header}*`, '', ...adminJids.map((j) => `- @${digits(j)}`)];
      await ctx.sock.sendMessage(ctx.jid, { text: lines.join('\n'), mentions: adminJids }, { quoted: ctx.msg });
    }
  },
  {
    name: 'everyone',
    aliases: ['tag'],
    description: 'Mention everyone with a custom message',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const message = ctx.argText.trim();
      if (!message) {
        await ctx.reply(usage(`${ctx.prefix}everyone your message`));
        return;
      }
      const jids = (ctx.participants || []).map((p) => p.pn || p.phoneNumber || p.id).filter(Boolean);
      await ctx.sock.sendMessage(ctx.jid, { text: message, mentions: jids }, { quoted: ctx.msg });
    }
  },
  {
    name: 'hidetag',
    aliases: ['htag'],
    description: 'Send a message that silently mentions everyone',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const message = ctx.argText.trim();
      if (!message) {
        await ctx.reply(usage(`${ctx.prefix}hidetag your message`));
        return;
      }
      const jids = (ctx.participants || []).map((p) => p.pn || p.phoneNumber || p.id).filter(Boolean);
      await ctx.sock.sendMessage(ctx.jid, { text: message, mentions: jids });
    }
  },
  {
    name: 'antigroupmention',
    aliases: [],
    description: 'Protect against group mentions in statuses: warn/delete/kick/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'ANTIGROUPMENTION', ['warn', 'delete', 'kick', 'off']);
    }
  },
  {
    name: 'setantigcmentionwarnlimit',
    aliases: [],
    description: 'Set the anti group-mention warning limit (1-50)',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setWarnLimit(ctx, 'ANTIGROUPMENTION_WARN_COUNT');
    }
  },
  {
    name: 'antipromote',
    aliases: [],
    description: 'Undo unauthorized promotions: on/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'ANTIPROMOTE', ['on', 'off']);
    }
  },
  {
    name: 'antidemote',
    aliases: [],
    description: 'Undo unauthorized demotions: on/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'ANTIDEMOTE', ['on', 'off']);
    }
  },
  {
    name: 'antilink',
    aliases: ['setantilink'],
    description: 'Protect against links: warn/delete/kick/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'ANTILINK', ['warn', 'delete', 'kick', 'off']);
    }
  },
  {
    name: 'antilinkwarn',
    aliases: ['setwarncount'],
    description: 'Set the antilink warning limit (1-50)',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setWarnLimit(ctx, 'ANTILINK_WARN_COUNT');
    }
  },
  {
    name: 'antibad',
    aliases: ['setantibad'],
    description: 'Protect against bad words: warn/delete/kick/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'ANTIBAD', ['warn', 'delete', 'kick', 'off']);
    }
  },
  {
    name: 'antibadwarn',
    aliases: ['badwarncount'],
    description: 'Set the anti-badwords warning limit (1-50)',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setWarnLimit(ctx, 'ANTIBAD_WARN_COUNT');
    }
  },
  {
    name: 'disapp',
    aliases: ['disappearing'],
    description: 'Toggle disappearing messages: off/1/7/90 days',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const value = (ctx.args[0] || '').toLowerCase();
      const map = { off: 0, '0': 0, '1': 86400, '7': 604800, '90': 7776000 };
      if (!(value in map)) {
        await ctx.reply(usage(`${ctx.prefix}disapp off|1|7|90`));
        return;
      }
      await ctx.sock.sendMessage(ctx.jid, { disappearingMessagesInChat: map[value] });
      await ctx.reply(panel('Disappearing messages', [{ label: 'Timer', value: map[value] === 0 ? 'off' : `${value} day(s)` }]));
    }
  },
  {
    name: 'del',
    aliases: ['delete'],
    description: 'Delete a quoted message sent by the bot or by you',
    category: 'Group',
    access: 'admin',
    async run(ctx) {
      if (!ctx.quotedKey?.id) {
        await ctx.reply(usage(`Reply to the message you want removed, then send ${ctx.prefix}del.`));
        return;
      }
      const key = { remoteJid: ctx.jid, id: ctx.quotedKey.id, fromMe: false, participant: ctx.quotedSender || undefined };
      try {
        await ctx.sock.sendMessage(ctx.jid, { delete: key });
        await ctx.reply(notice('The message was deleted.'));
      } catch {
        // Trying to delete your own quoted message needs fromMe semantics.
        try {
          await ctx.sock.sendMessage(ctx.jid, { delete: { remoteJid: ctx.jid, id: ctx.quotedKey.id, fromMe: true } });
          await ctx.reply(notice('The message was deleted.'));
        } catch (err) {
          await ctx.reply(errorPanel(`The message could not be deleted: ${err.message}`));
        }
      }
    }
  },
  {
    name: 'getgcpp',
    aliases: ['stealgcpp'],
    description: 'Download the group profile picture',
    category: 'Group',
    access: 'public',
    groupOnly: true,
    async run(ctx) {
      try {
        const url = await ctx.sock.profilePictureUrl(ctx.jid, 'image');
        const { fetchBuffer } = await import('../core/media.js');
        const buffer = await fetchBuffer(url);
        await ctx.sock.sendMessage(ctx.jid, { image: buffer, caption: ctx.groupName || 'group picture' }, { quoted: ctx.msg });
      } catch {
        await ctx.reply(notice('This group has no picture.'));
      }
    }
  },
  {
    name: 'getlid',
    aliases: ['lid'],
    description: 'Resolve a LID to the real phone JID via group data',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const raw = ctx.argText.trim();
      if (!raw) {
        await ctx.reply(usage(`${ctx.prefix}getlid 9988776655@lid or a quoted message`));
        return;
      }
      const num = digits(raw);
      const found = (ctx.participants || []).find((p) =>
        String(p.id || '').includes(num) || String(p.lid || '').includes(num) || digits(p.pn) === num);
      if (!found) {
        await ctx.reply(notice('No participant matches that identifier.'));
        return;
      }
      await ctx.reply(panel('LID resolution', [
        { label: 'LID', value: found.lid || found.id },
        { label: 'Phone JID', value: found.pn || found.phoneNumber || found.id }
      ]));
    }
  },
  {
    name: 'setgroupevents',
    aliases: ['groupevents'],
    description: 'Announce promote and demote events: on/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'GROUP_EVENTS', ['on', 'off']);
    }
  },
  {
    name: 'setwelcome',
    aliases: ['welcome'],
    description: 'Toggle welcome messages: on/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'WELCOME_MESSAGE', ['on', 'off']);
    }
  },
  {
    name: 'setgoodbye',
    aliases: ['goodbye'],
    description: 'Toggle goodbye messages: on/off',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      await setGroupToggle(ctx, 'GOODBYE_MESSAGE', ['on', 'off']);
    }
  },
  {
    name: 'welcomemessage',
    aliases: ['setwelcomemsg'],
    description: 'Set a custom welcome text with {user}, {group} and {count} placeholders',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}welcomemessage Welcome {user} to {group}!`));
        return;
      }
      const result = await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, 'WELCOME_TEXT', text);
      if (!result.ok) return ctx.reply(errorPanel(result.error));
      await ctx.reply(panel('Welcome text', [{ label: 'Set', value: text.slice(0, 200) }]));
    }
  },
  {
    name: 'goodbyemessage',
    aliases: ['setgoodbyemsg'],
    description: 'Set a custom goodbye text with {user} and {group} placeholders',
    category: 'Group',
    access: 'admin',
    groupOnly: true,
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}goodbyemessage Goodbye {user}.`));
        return;
      }
      const result = await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, 'GOODBYE_TEXT', text);
      if (!result.ok) return ctx.reply(errorPanel(result.error));
      await ctx.reply(panel('Goodbye text', [{ label: 'Set', value: text.slice(0, 200) }]));
    }
  }
];

async function setGroupToggle(ctx, key, allowed) {
  const value = (ctx.args[0] || '').toLowerCase();
  if (!allowed.includes(value)) {
    const current = await readGroupSettings(ctx.store, ctx.session.id, ctx.jid);
    await ctx.reply(panel(key, [{ label: 'Current', value: current[key] }], `Use ${ctx.prefix}${key.toLowerCase()} ${allowed.join('/')}.`));
    return;
  }
  const result = await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, key, value);
  if (!result.ok) return ctx.reply(errorPanel(result.error));
  await ctx.reply(panel(key, [{ label: 'Set to', value: value }]));
}

async function setWarnLimit(ctx, key) {
  const value = Number.parseInt(ctx.args[0] || '', 10);
  const result = await writeGroupSetting(ctx.store, ctx.session.id, ctx.jid, key, String(value));
  if (!result.ok) return ctx.reply(errorPanel(result.error));
  await ctx.reply(panel(key, [{ label: 'Set to', value: String(value) }]));
}
