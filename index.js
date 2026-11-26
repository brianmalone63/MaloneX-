import { createRuntime } from './src/core/manager.js';
import { createWebServer } from './src/web/server.js';

const runtime = await createRuntime();
const server = createWebServer({ runtime });

server.listen(runtime.config.port, () => {
  runtime.logger.info(`pairing server listening on port ${runtime.config.port} (storage: ${runtime.config.storage})`);
});

await runtime.startAll();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  runtime.logger.info(`${signal} received; shutting down`);
  server.close();
  await runtime.stopAll();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
