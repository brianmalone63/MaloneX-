// Custom Baileys auth state backed by the storage layer (Postgres or files).
// Values cross the boundary as JSON strings produced with Baileys'
// BufferJSON replacer and revived with its reviver, so Buffer fields
// round-trip exactly.
import { BufferJSON, initAuthCreds } from '../baileys.js';

const toStore = (value) => JSON.stringify(value, BufferJSON.replacer);
// FileStore and Postgres return already-parsed objects (jsonb columns are
// parsed by the driver); strings are revived through BufferJSON. Both shapes
// arrive here, so accept either.
const fromStore = (value) => (typeof value === 'string' ? JSON.parse(value, BufferJSON.reviver) : value);

export async function createStoreAuthState({ store, sessionId }) {
  const rows = await store.getAuth(sessionId);
  const creds = rows.creds ? fromStore(rows.creds) : initAuthCreds();
  // In-memory key cache: Baileys reads keys synchronously per message, and
  // the store is async. All keys are loaded once at boot and written through.
  const cache = new Map();
  for (const [composite, value] of Object.entries(rows.keys)) {
    cache.set(composite, typeof value === 'string' ? fromStore(value) : value);
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

  const saveCreds = () => store.saveCreds(sessionId, toStore(creds));

  return { state, saveCreds };
}
