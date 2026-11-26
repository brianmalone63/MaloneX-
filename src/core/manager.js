import path from 'node:path';
import { Session } from './session.js';
import { loadConfig } from './config.js';
import { loadPlugins } from './pluginloader.js';
import { FileStore } from './filestore.js';
import { PgStore } from './pgstore.js';
import { createLogger } from './logger.js';

// Runtime owns the config, the storage backend, the plugin registry and all
// running sessions.
export async function createRuntime({ env = process.env, pluginDir } = {}) {
  const config = loadConfig(env);
  const logger = createLogger('runtime');
  const store = config.storage === 'postgres'
    ? new PgStore({ connectionString: config.databaseUrl, dataDir: config.dataDir })
    : new FileStore({ dataDir: config.dataDir });
  await store.init();
  const registry = await loadPlugins({ dir: pluginDir, logger });
  const sessions = new Map();

  const runtime = {
    config,
    store,
    registry,
    logger,
    sessions,
    get(id) {
      return sessions.get(id) || null;
    },
    async startSession(id) {
      let session = sessions.get(id);
      if (!session) {
        session = new Session({ id, store, config, registry });
        sessions.set(id, session);
      }
      await session.start();
      return session;
    },
    async stopSession(id) {
      const session = sessions.get(id);
      if (!session) return false;
      await session.stop();
      sessions.delete(id);
      return true;
    },
    async startAll() {
      const list = await store.listSessions();
      for (const meta of list) {
        try {
          await runtime.startSession(meta.id);
        } catch (err) {
          logger.error(`session "${path.basename(meta.id)}" failed to start: ${err.message}`);
        }
      }
      return list.length;
    },
    async stopAll() {
      for (const session of sessions.values()) {
        try {
          await session.stop();
        } catch {
          // Ignore shutdown failures.
        }
      }
      sessions.clear();
    }
  };

  return runtime;
}
