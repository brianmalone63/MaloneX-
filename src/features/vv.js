// View-once reveal: downloads a quoted view-once photo, video or voice note
// and delivers it to the owner's own chat (default) or back to the source
// chat. Owner only, 16 MB cap, plain-language errors.
export function findViewOnce(quoted) {
  if (!quoted || typeof quoted !== 'object') return null;
  for (const wrapper of ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage']) {
    const inner = quoted[wrapper]?.message;
    if (!inner) continue;
    for (const kind of ['imageMessage', 'videoMessage', 'audioMessage']) {
      if (inner[kind]) return { kind, media: inner[kind] };
    }
  }
  for (const kind of ['imageMessage', 'videoMessage', 'audioMessage']) {
    if (quoted[kind]?.viewOnce) return { kind, media: quoted[kind] };
  }
  return null;
}

export async function deliverViewOnce({ quoted, sock, ownerJid, sourceJid, destination, download, maxBytes }) {
  const found = findViewOnce(quoted);
  if (!found) {
    return { ok: false, error: 'That message is not a view-once photo, video or voice note.' };
  }
  if (typeof download !== 'function') {
    return { ok: false, error: 'Media download is unavailable in this deployment.' };
  }
  const destinationJid = destination === 'chat' ? sourceJid : ownerJid;
  if (!destinationJid) {
    return { ok: false, error: 'The owner chat is not known yet. Send a command after the bot has connected.' };
  }

  let buffer;
  try {
    buffer = await download({ key: {}, message: quoted });
  } catch (err) {
    return { ok: false, error: `The download failed. WhatsApp may have already expired this media. (${err.message})` };
  }
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { ok: false, error: 'The download returned nothing usable.' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: `The media is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB cap and was not sent.` };
  }

  const payload = { [found.kind]: buffer };
  if (found.media?.mimetype) payload.mimetype = found.media.mimetype;
  if (found.kind === 'audioMessage') payload.ptt = found.media.ptt === true;
  try {
    await sock.sendMessage(destinationJid, payload);
  } catch (err) {
    return { ok: false, error: `The media was downloaded but could not be sent. (${err.message})` };
  }
  return {
    ok: true,
    where: destination === 'chat' ? 'back to this chat' : 'to your own chat'
  };
}
