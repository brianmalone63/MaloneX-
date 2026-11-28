// Runtime assembly: config, store, plugin registry, session and web server.
// The web port is bound BEFORE any session work, so a broken session can
// never take the health endpoint down with it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { UserError } from './core/errors.js';
import { FileStore } from './store/filestore.js';
import { PgStore } from './store/pgstore.js';
import { createRegistry, loadPlugins } from './commands/registry.js';
import { Session } from './session/session.js';
import { createWebServer } from './web/server.js';

export async function createRuntime({ env = process.env, pluginDir = null } = {}) {
  const config = loadConfig(env);
  const logger = createLogger('malonex', config.logLevel);

  const store = config.storage === 'postgres'
    ? new PgStore({ connectionString: config.databaseUrl, logger })
    : new FileStore({ dataDir: config.dataDir, logger });
  await store.init();

  const registry = createRegistry();
  const dir = pluginDir || path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugins');
  await loadPlugins({ dir, registry, logger });

  const session = new Session({ config, store, registry, logger });

  const server = createWebServer({ config, session, logger });
  // Bind the port first. EADDRINUSE must be a clear failure with exit code 1.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });
  logger.info(`Web server bound to port ${config.port} (storage: ${config.storage}).`);

  // Decide whether a WhatsApp socket should start at boot:
  // - SESSION configured: restore/import, then connect.
  // - stored credentials already on disk: connect with them.
  // - neither: stay idle; the start page, the built-in pairing page or
  //   PAIR_NUMBER drive pairing. No useless socket is started.
  let storedHasCreds = false;
  try {
    storedHasCreds = Boolean((await store.getAuth(config.sessionId)).creds);
  } catch {
    storedHasCreds = false;
  }

  if (config.session || storedHasCreds) {
    await session.start().catch((err) => {
      // A UserError from session import must stop the process with a clear
      // message; anything else is logged and retried by the session rules.
      throw err;
    });
  } else if (config.pairNumber) {
    // Console pairing fallback: fires in the background; the port is already
    // bound and /health answers meanwhile.
    session.consolePair(config.pairNumber).catch((err) => {
      logger.error(`Console pairing failed: ${err.message}`);
    });
  } else {
    logger.info('No session yet. The start page explains how to get one from the pairing site.');
  }

  return { config, store, registry, session, server, logger };
}

export async function shutdownRuntime(runtime, signal) {
  runtime.logger.info(`${signal} received; shutting down.`);
  const hardExit = setTimeout(() => process.exit(1), 10000);
  hardExit.unref();
  try {
    runtime.server.close();
  } catch {}
  try {
    await runtime.session.shutdown();
  } catch {}
  try {
    await runtime.store.close();
  } catch {}
  process.exit(0);
}
