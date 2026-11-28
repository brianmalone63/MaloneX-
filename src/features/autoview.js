// Auto-view statuses: reads other people's statuses after a random 1-4 s
// delay. Off by default; per-session setting; never touches own statuses.
export function createAutoView({ rng = Math.random, schedule = setTimeout } = {}) {
  return async function autoView(session, sock, msg) {
    const settings = session.settings || {};
    if (!settings.autoview) return;
    if (!msg?.key || msg.key.remoteJid !== 'status@broadcast') return;
    if (msg.key.fromMe) return;
    if (typeof sock?.readMessages !== 'function') return;
    const delay = 1000 + Math.floor(rng() * 3001); // 1000..4000 ms
    schedule(() => {
      try {
        sock.readMessages([{ key: msg.key }]);
      } catch {
        // A read failure is never fatal.
      }
    }, delay);
  };
}
