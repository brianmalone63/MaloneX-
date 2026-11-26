import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/core/filestore.js';
import { stubSession, fakeSock, messageStub, textMessage } from './helpers.js';

// Plugin suite imports
import groupCommands from '../src/plugins/group.js';
import downloaderCommands from '../src/plugins/downloader.js';
import searchCommands from '../src/plugins/search.js';
import toolCommands from '../src/plugins/tools.js';
import textCommands from '../src/plugins/text.js';
import shortenerCommands from '../src/plugins/shortener.js';
import noteCommands from '../src/plugins/notes.js';
import tempmailCommands from '../src/plugins/tempmail.js';
import aiCommands from '../src/plugins/ai.js';
import converterCommands from '../src/plugins/converter.js';
import settingsCommands from '../src/plugins/settings.js';

function findCmd(list, name) {
  const cmd = list.find((c) => c.name === name);
  assert.ok(cmd, `command "${name}" must exist`);
  return cmd;
}

async function makeCtx({ args = [], argText = null, session = null, store = null } = {}) {
  const s = session || stubSession({ settingsRaw: { MODE: 'public' } });
  const sock = fakeSock();
  const msg = messageStub({ fromMe: true, message: textMessage('.x') });
  const resolved = argText === null ? args.join(' ') : argText;
  return {
    session: s,
    store: store || s.store,
    sock,
    msg,
    registry: null,
    logger: s.logger,
    settings: s.settings,
    config: s.config,
    jid: msg.key.remoteJid,
    sender: '1000000000@s.whatsapp.net',
    isGroup: false,
    isStatus: false,
    isFromMe: true,
    isOwner: true,
    superUser: true,
    isAdmin: true,
    isBotAdmin: true,
    groupName: '',
    groupMeta: null,
    participants: [],
    adminNums: [],
    pushName: 'Tester',
    text: resolved,
    quoted: null,
    quotedMessage: null,
    quotedText: '',
    quotedSender: null,
    quotedKey: null,
    quotedInner: {},
    inner: {},
    mediaType: null,
    mentioned: [],
    buttonId: null,
    args,
    argText: resolved,
    prefix: '.',
    timeZone: 'UTC',
    footer: 'MaloneX',
    botName: 'MaloneX',
    packName: 'MaloneX',
    packAuthor: 'Brian Malone',
    command: 'test',
    buttons: async (options) => sock.sendMessage(msg.key.remoteJid, options, { quoted: msg }),
    reply: async (content) => sock.sendMessage(msg.key.remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
    react: async () => {},
    del: async () => {},
    download: async () => { throw new Error('download must not be called in this test'); }
  };
}

async function tempStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'malonex-args-'));
  const store = new FileStore({ dataDir: dir });
  await store.init();
  return { store, dir };
}

test('group commands answer with usage when no target is given', async () => {
  const kick = findCmd(groupCommands, 'kick');
  const ctx = await makeCtx({ args: [] });
  ctx.isGroup = true;
  await kick.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /kick 2547/);

  const add = findCmd(groupCommands, 'add');
  const ctx2 = await makeCtx({ args: ['12345'], argText: '12345' });
  ctx2.isGroup = true;
  await add.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /add 2547xxxxxxx/);

  const ctx2b = await makeCtx({ args: ['254700000009'], argText: '254700000009' });
  ctx2b.isGroup = true;
  ctx2b.sock.onWhatsApp = async () => [{ exists: false }];
  await add.run(ctx2b);
  assert.match(ctx2b.sock.sent[0].content.text, /not registered on WhatsApp/);
});

test('downloader commands validate their input before any network call', async () => {
  const play = findCmd(downloaderCommands, 'play');
  const ctx = await makeCtx({ args: [] });
  await play.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /play artist - song title/);

  const pastebin = findCmd(downloaderCommands, 'pastebin');
  const ctx2 = await makeCtx({ args: ['not-a-paste'], argText: 'not-a-paste' });
  await pastebin.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /pastebin\.com/);

  const gitclone = findCmd(downloaderCommands, 'gitclone');
  const ctx3 = await makeCtx({ args: ['no link here'], argText: 'no link here' });
  await gitclone.run(ctx3);
  assert.match(ctx3.sock.sent[0].content.text, /github\.com\/user\/repo/);
});

test('search and tools commands require their arguments', async () => {
  const weather = findCmd(searchCommands, 'weather');
  const ctx = await makeCtx({ args: [] });
  await weather.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /weather Nairobi/);

  const createqr = findCmd(toolCommands, 'createqr');
  const ctx2 = await makeCtx({ args: [] });
  await createqr.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /createqr your text/);

  const readqr = findCmd(toolCommands, 'readqr');
  const ctx3 = await makeCtx({ args: [] });
  await readqr.run(ctx3);
  assert.match(ctx3.sock.sent[0].content.text, /readqr/);
});

test('text encoders round trip and decoders reject garbage', async () => {
  const ebase = findCmd(textCommands, 'ebase');
  const dbase = findCmd(textCommands, 'dbase');
  const ctx = await makeCtx({ argText: 'hello world' });
  await ebase.run(ctx);
  const encoded = ctx.sock.sent[0].content.text.split('\n').find((l) => /^[A-Za-z0-9+/=]+$/.test(l.trim()));

  const ctx2 = await makeCtx({ argText: encoded.trim() });
  await dbase.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /hello world/);

  const ctx3 = await makeCtx({ argText: 'not base64!!' });
  await dbase.run(ctx3);
  assert.match(ctx3.sock.sent[0].content.text, /Invalid input/);

  const debinary = findCmd(textCommands, 'debinary');
  const ctx4 = await makeCtx({ argText: 'zzz' });
  await debinary.run(ctx4);
  assert.match(ctx4.sock.sent[0].content.text, /Invalid input/);
});

test('shorteners reject input that is not a URL', async () => {
  const tinyurl = findCmd(shortenerCommands, 'tinyurl');
  const ctx = await makeCtx({ argText: 'not a url at all' });
  await tinyurl.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /tinyurl https:\/\/example\.com/);
});

test('notes flow end to end through the file store', async () => {
  const { store, dir } = await tempStore();
  const addnote = findCmd(noteCommands, 'addnote');
  const getnote = findCmd(noteCommands, 'getnote');
  const notes = findCmd(noteCommands, 'notes');
  const delnote = findCmd(noteCommands, 'delnote');

  const ctx1 = await makeCtx({ argText: 'buy milk', store });
  await addnote.run(ctx1);
  assert.match(ctx1.sock.sent[0].content.text, /NOTE SAVED/i);

  const ctx2 = await makeCtx({ args: ['1'], store });
  await getnote.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /buy milk/);

  const ctx3 = await makeCtx({ store });
  await notes.run(ctx3);
  assert.match(ctx3.sock.sent[0].content.text, /buy milk/);

  const ctx4 = await makeCtx({ args: ['1'], store });
  await delnote.run(ctx4);
  assert.match(ctx4.sock.sent[0].content.text, /deleted/i);

  const ctx5 = await makeCtx({ args: ['1'], store });
  await getnote.run(ctx5);
  assert.match(ctx5.sock.sent[0].content.text, /you store 0 notes/);

  const ctx6 = await makeCtx({ args: ['99'], store });
  await getnote.run(ctx6);
  assert.match(ctx6.sock.sent[0].content.text, /getnote 1/);

  await fsp.rm(dir, { recursive: true, force: true });
});

test('temp mail explains itself when no mailbox exists', async () => {
  const { store, dir } = await tempStore();
  const tempinbox = findCmd(tempmailCommands, 'tempinbox');
  const ctx = await makeCtx({ store });
  await tempinbox.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /no temp address yet/);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('AI commands explain the missing provider instead of failing', async () => {
  const gpt = findCmd(aiCommands, 'gpt');
  const ctx = await makeCtx({ argText: 'hello there' });
  await gpt.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /AI chat is not configured/);
  assert.match(ctx.sock.sent[0].content.text, /AI_API_URL/);
});

test('converter commands demand a quoted message', async () => {
  const sticker = findCmd(converterCommands, 'sticker');
  const ctx = await makeCtx({});
  await sticker.run(ctx);
  assert.match(ctx.sock.sent[0].content.text, /Reply to an image, video or sticker/);

  const toaudio = findCmd(converterCommands, 'toaudio');
  const ctx2 = await makeCtx({});
  await toaudio.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /Reply to a video/);
});

test('generated settings commands validate keys and values', async () => {
  const setbotname = findCmd(settingsCommands, 'setbotname');
  const ctx = await makeCtx({ argText: 'My Custom Bot' });
  await setbotname.run(ctx);
  assert.equal(ctx.session.settings.BOT_NAME, 'My Custom Bot');
  assert.match(ctx.sock.sent[0].content.text, /My Custom Bot/);

  const setsetting = findCmd(settingsCommands, 'setsetting');
  const ctx2 = await makeCtx({ args: ['NOT_A_KEY', 'x'], argText: 'NOT_A_KEY x' });
  await setsetting.run(ctx2);
  assert.match(ctx2.sock.sent[0].content.text, /Unknown setting/);

  const setmode = findCmd(settingsCommands, 'setmode');
  const ctx3 = await makeCtx({ args: ['sideways'], argText: 'sideways' });
  await setmode.run(ctx3);
  assert.match(ctx3.sock.sent[0].content.text, /public\|private\|env/);

  const setautolike = findCmd(settingsCommands, 'setautolike');
  const ctx4 = await makeCtx({ argText: 'on' });
  await setautolike.run(ctx4);
  assert.equal(ctx4.session.settings.autolike, true);
});
