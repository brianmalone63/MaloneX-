// In-memory rolling window of recent messages per chat. Powers anti-delete
// and anti-edit: when a message disappears, we still have its content.
const MAX_PER_CHAT = 50;
const MAX_CHATS = 500;
const TTL_MS = 6 * 60 * 60 * 1000;

const chats = new Map(); // jid -> Map(messageId -> entry)
const recentDeletes = new Map(); // chat -> Map(id -> entry) of deleted originals

export function remember(msg, { sender, pushName }) {
  try {
    const jid = msg.key.remoteJid;
    const id = msg.key.id;
    if (!jid || !id) return;
    let chat = chats.get(jid);
    if (!chat) {
      chat = new Map();
      chats.set(jid, chat);
      if (chats.size > MAX_CHATS) {
        const oldest = chats.keys().next().value;
        chats.delete(oldest);
      }
    }
    chat.set(id, {
      message: msg.message,
      key: msg.key,
      sender: sender || msg.key.participant || msg.key.remoteJid,
      pushName: pushName || '',
      at: Date.now()
    });
    if (chat.size > MAX_PER_CHAT) {
      const oldest = chat.keys().next().value;
      chat.delete(oldest);
    }
  } catch {
    // Never let storage of a message break message processing.
  }
}

export function find(jid, id) {
  const chat = chats.get(jid);
  if (!chat) return null;
  const entry = chat.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    chat.delete(id);
    return null;
  }
  return entry;
}

export function forget(jid, id) {
  const chat = chats.get(jid);
  if (chat) chat.delete(id);
}

export function markDeleted(jid, id) {
  const entry = find(jid, id);
  if (!entry) return null;
  let deleted = recentDeletes.get(jid);
  if (!deleted) {
    deleted = new Map();
    recentDeletes.set(jid, deleted);
  }
  deleted.set(id, entry);
  chats.get(jid)?.delete(id);
  return entry;
}

export function takeDeleted(jid, id) {
  const deleted = recentDeletes.get(jid);
  const entry = deleted ? deleted.get(id) || null : null;
  if (deleted && entry) deleted.delete(id);
  return entry;
}

export function size() {
  let total = 0;
  for (const chat of chats.values()) total += chat.size;
  return total;
}

export function clear() {
  chats.clear();
  recentDeletes.clear();
}
