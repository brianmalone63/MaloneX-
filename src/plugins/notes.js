import { panel, notice, usage, error as errorPanel } from '../core/format.js';

// Personal notes stored per sender in the docs collection.
const COLLECTION = 'notes';

async function userNotes(ctx) {
  const doc = (await ctx.store.getDoc(ctx.session.id, COLLECTION, ctx.sender)) || { notes: [] };
  return doc.notes || [];
}

async function saveNotes(ctx, notes) {
  await ctx.store.setDoc(ctx.session.id, COLLECTION, ctx.sender, { notes, updatedAt: new Date().toISOString() });
}

export default [
  {
    name: 'notes',
    aliases: ['mynotes'],
    description: 'List your saved notes',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      if (!ctx.store) {
        await ctx.reply(errorPanel('No storage backend is attached to this session.'));
        return;
      }
      const notes = await userNotes(ctx);
      if (notes.length === 0) {
        await ctx.reply(notice('You have no notes yet. Add one with .addnote your text.'));
        return;
      }
      const rows = notes.map((n, i) => ({ label: `${i + 1}. ${String(n.text).slice(0, 50)}`, value: `${String(n.text).length} chars | ${n.createdAt?.slice(0, 10) || ''}` }));
      await ctx.reply(panel('Your notes', rows, `${notes.length} note(s). Use .getnote NUMBER for the full text.`));
    }
  },
  {
    name: 'addnote',
    aliases: ['newnote'],
    description: 'Save a new note',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) {
        await ctx.reply(usage(`${ctx.prefix}addnote remember the milk`));
        return;
      }
      if (text.length > 1500) {
        await ctx.reply(errorPanel('Notes are limited to 1500 characters.'));
        return;
      }
      const notes = await userNotes(ctx);
      if (notes.length >= 50) {
        await ctx.reply(errorPanel('You already store 50 notes. Delete some first with .delnote.'));
        return;
      }
      notes.push({ text, createdAt: new Date().toISOString() });
      await saveNotes(ctx, notes);
      await ctx.reply(panel('Note saved', [{ label: 'Number', value: String(notes.length) }, { label: 'Text', value: text.slice(0, 120) }]));
    }
  },
  {
    name: 'getnote',
    aliases: ['listnote'],
    description: 'Show one note by number',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const index = Number.parseInt(ctx.args[0] || '', 10);
      const notes = await userNotes(ctx);
      if (!Number.isInteger(index) || index < 1 || index > notes.length) {
        await ctx.reply(usage(`${ctx.prefix}getnote 1 (you store ${notes.length} notes)`));
        return;
      }
      const note = notes[index - 1];
      await ctx.reply(panel(`Note ${index}`, [note.text, '', `Saved: ${note.createdAt?.slice(0, 19).replace('T', ' ') || 'unknown'}`]));
    }
  },
  {
    name: 'getnotes',
    aliases: ['allnotes'],
    description: 'Show all your notes in full',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const notes = await userNotes(ctx);
      if (notes.length === 0) {
        await ctx.reply(notice('You have no notes yet.'));
        return;
      }
      const lines = notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n\n');
      if (lines.length > 3800) {
        await ctx.sock.sendMessage(ctx.jid, { text: `Your notes\n\n${lines.slice(0, 3800)}\n\n(truncated)` }, { quoted: ctx.msg });
        return;
      }
      await ctx.reply(panel('All notes', [lines]));
    }
  },
  {
    name: 'updatenote',
    aliases: ['editnote'],
    description: 'Replace the text of a note: NUMBER new text',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const index = Number.parseInt(ctx.args[0] || '', 10);
      const text = ctx.args.slice(1).join(' ').trim();
      const notes = await userNotes(ctx);
      if (!Number.isInteger(index) || index < 1 || index > notes.length || !text) {
        await ctx.reply(usage(`${ctx.prefix}updatenote 1 new text`));
        return;
      }
      notes[index - 1] = { text, createdAt: notes[index - 1].createdAt, updatedAt: new Date().toISOString() };
      await saveNotes(ctx, notes);
      await ctx.reply(panel(`Note ${index} updated`, [text.slice(0, 200)]));
    }
  },
  {
    name: 'delnote',
    aliases: ['deletenote'],
    description: 'Delete one note by number',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const index = Number.parseInt(ctx.args[0] || '', 10);
      const notes = await userNotes(ctx);
      if (!Number.isInteger(index) || index < 1 || index > notes.length) {
        await ctx.reply(usage(`${ctx.prefix}delnote 1`));
        return;
      }
      const removed = notes.splice(index - 1, 1)[0];
      await saveNotes(ctx, notes);
      await ctx.reply(panel('Note deleted', [{ label: 'Number', value: String(index) }, { label: 'Text', value: String(removed.text).slice(0, 100) }]));
    }
  },
  {
    name: 'delallnotes',
    aliases: ['deleteallnotes'],
    description: 'Delete every one of your notes',
    category: 'Notes',
    access: 'public',
    async run(ctx) {
      const notes = await userNotes(ctx);
      if (notes.length === 0) {
        await ctx.reply(notice('You have no notes to delete.'));
        return;
      }
      await saveNotes(ctx, []);
      await ctx.reply(notice(`${notes.length} note(s) deleted.`));
    }
  },
  {
    name: 'allnotesadmin',
    aliases: ['viewnotes'],
    description: 'List every user that stores notes (owner)',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const docs = await ctx.store.listDocs(ctx.session.id, COLLECTION);
      if (docs.length === 0) {
        await ctx.reply(notice('No notes are stored on this session.'));
        return;
      }
      const rows = docs.map((d) => ({ label: `+${d.key.split('@')[0]}`, value: `${(d.value?.notes || []).length} notes` }));
      await ctx.reply(panel('Notes by user', rows.slice(0, 40), `${docs.length} user(s).`));
    }
  },
  {
    name: 'adminclearnotes',
    aliases: ['clearusernotes'],
    description: 'Delete all notes of one user (owner)',
    category: 'Owner',
    access: 'owner',
    async run(ctx) {
      const num = ctx.argText.trim().replace(/\D/g, '');
      if (!num) {
        await ctx.reply(usage(`${ctx.prefix}adminclearnotes 2547xxxxxxx`));
        return;
      }
      await ctx.store.delDoc(ctx.session.id, COLLECTION, `${num}@s.whatsapp.net`);
      await ctx.reply(notice(`Notes for +${num} were cleared.`));
    }
  }
];
