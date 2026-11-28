// Custom Baileys auth state backed by the storage layer (Postgres or files).
// Values cross the boundary as JSON strings produced with Baileys'
// BufferJSON replacer and revived with its reviver, so Buffer fields
// round-trip exactly.
import { BufferJSON, initAuthCreds } from '../baileys.js';

const toStore = (value) => JSON.stringify(value, BufferJSON.replacer);
// FileStore and Postgres return already-parsed objects (the file store uses a
// plain JSON.parse, and jsonb columns are parsed by the driver), so Buffer
// fields arrive as { type: 'Buffer', data: [...] } plain objects. Always run
// the value through BufferJSON.reviver so they become real Buffers again;
// otherwise Baileys fails the handshake with 'The "list[1]" argument must be
// an instance of Buffer or Uint8Array'.
const fromStore = (value) =>
  JSON.parse(typeof value === 'string' ? value : JSON.stringify(value), BufferJSON.reviver);

export async function createStoreAuthState({ store, sessionId }) {
  const rows = await store.getAuth(sessionId);
  const creds = rows.creds ? fromStore(rows.creds) : initAuthCreds();
  // In-memory key cache: Baileys reads keys synchronously per message, and
  // the store is async. All keys are loaded once at boot and written through.
  const cache = new Map();
  for (const [composite, value] of Object.entries(rows.keys)) {
    cache.set(composite, fromStore(value));
  }

  const state = {
    creds,
    keys: {
      get(type, ids) {
        const out = {};
        for (const id of ids) {
          const composite = `${type}:${id}`;
          if (cache.has(composite)) out[id] = cache.get(composite);
        }
        return out;
      },
      set(data) {
        const entries = [];
        for (const type of Object.keys(data)) {
          for (const [id, value] of Object.entries(data[type])) {
            const composite = `${type}:${id}`;
            cache.set(composite, value);
            entries.push([composite, toStore(value)]);
          }
        }
        if (entries.length) {
          store.setAuthBulk(sessionId, entries).catch(() => {
            // Persistence failures are logged by the store layer; the in-memory
            // cache keeps the connection usable meanwhile.
          });
        }
      }
    }
  };

  const saveCreds = async () => {
    try {
      await store.saveCreds(sessionId, toStore(creds));
    } catch (err) {
      // Never let a failed save become an unhandled rejection (it would kill
      // the process); the next creds.update retries with the latest creds.
      console.error(`[malonex] could not save creds: ${err.message}`);
    }
  };

  return { state, saveCreds };
}
