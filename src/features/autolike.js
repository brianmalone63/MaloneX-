// Auto-like statuses: reacts after a random 3-8 s delay with one
// configurable emoji, at most once per status id (LRU of 500 ids), never on
// own statuses, capped at 60 reactions per hour. Off by default.
const LRU_SIZE = 500;
const HOURLY_CAP = 60;
const HOUR_MS = 60 * 60 * 1000;

export function createLruSet(size = LRU_SIZE) {
  const map = new Map();
  return {
    has(key) {
      return map.has(key);
    },
    add(key) {
      if (map.has(key)) {
        map.delete(key);
      } else if (map.size >= size) {
        map.delete(map.keys().next().value);
      }
      map.set(key, key);
    },
    get size() {
      return map.size;
    }
  };
}

export function createHourlyCounter(cap = HOURLY_CAP, nowFn = Date.now) {
  let timestamps = [];
  return function trySpend() {
    const now = nowFn();
    timestamps = timestamps.filter((t) => now - t < HOUR_MS);
    if (timestamps.length >= cap) return false;
    timestamps.push(now);
    return true;
  };
}

export function createAutoLike({ rng = Math.random, schedule = setTimeout, lru = null, hourly = null } = {}) {
  const seen = lru || createLruSet();
  const trySpend = hourly || createHourlyCounter();
  return async function autoLike(session, sock, msg) {
    const settings = session.settings || {};
    if (!settings.autolike) return;
    if (!msg?.key || msg.key.remoteJid !== 'status@broadcast') return;
    if (msg.key.fromMe) return;
    // Never react to own statuses relayed through the broadcast JID.
    const ownPhone = session.ownJid ? String(session.ownJid).split('@')[0] : null;
    const participant = msg.key.participant ? String(msg.key.participant).split('@')[0] : null;
    if (ownPhone && participant && participant === ownPhone) return;
    if (typeof sock?.sendMessage !== 'function') return;
    const statusId = msg.key.id;
    if (!statusId || seen.has(statusId)) return;
    if (!trySpend()) return;
    seen.add(statusId);
    const emoji = settings.autolike_emoji || '\u2764\uFE0F';
    const delay = 3000 + Math.floor(rng() * 5001); // 3000..8000 ms
    schedule(() => {
      Promise.resolve(
        sock.sendMessage('status@broadcast', { react: { text: emoji, key: msg.key } })
      ).catch(() => {
        // A failed reaction is never fatal.
      });
    }, delay);
  };
}
