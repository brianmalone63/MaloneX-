import { panel, notice, usage, error as errorPanel } from '../core/format.js';
import { digits } from '../core/groups.js';

export default [
  {
    name: 'onwa',
    aliases: ['onwhatsapp'],
    description: 'Check whether a number is registered on WhatsApp',
    category: 'Utility',
    access: 'public',
    async run(ctx) {
      const raw = ctx.argText.trim().replace(/[^\d]/g, '');
      if (raw.length < 7) {
        await ctx.reply(usage(`${ctx.prefix}onwa 2547xxxxxxx`));
        return;
      }
      try {
        const [result] = await ctx.sock.onWhatsApp(raw);
        if (result?.exists) {
          await ctx.reply(panel('WhatsApp check', [
            { label: 'Number', value: `+${result.jid?.split('@')[0] || raw}` },
            { label: 'Registered', value: 'yes' }
          ]));
        } else {
          await ctx.reply(notice(`+${raw} is not registered on WhatsApp.`));
        }
      } catch (err) {
        await ctx.reply(errorPanel(`The check failed: ${err.message}`));
      }
    }
  },
  {
    name: 'vcf',
    aliases: ['contacts', 'savecontacts'],
    description: 'Export the group members as a VCF contact file',
    category: 'Utility',
    access: 'public',
    groupOnly: true,
    async run(ctx) {
      const members = (ctx.participants || [])
        .map((p) => p.pn || p.phoneNumber || p.id)
        .filter((jid) => jid && !String(jid).endsWith('@lid'))
        .map((jid) => String(jid).split('@')[0]);
      if (members.length === 0) {
        await ctx.reply(notice('No usable contacts were found in this group.'));
        return;
      }
      let vcf = '';
      members.forEach((num, index) => {
        vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:[${index + 1}] +${num}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD\n`;
      });
      const name = `${(ctx.groupName || 'group').replace(/[^\w -]/g, '').trim() || 'group'}.vcf`;
      await ctx.sock.sendMessage(ctx.jid, {
        document: Buffer.from(vcf, 'utf8'),
        fileName: name,
        mimetype: 'text/vcard',
        caption: `${members.length} contacts from ${ctx.groupName || 'this group'}.`
      }, { quoted: ctx.msg });
    }
  }
];
