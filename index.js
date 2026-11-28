// MaloneX entry point. Order matters:
// 1. Load .env (real environment variables always win).
// 2. Create the runtime: the web port is bound before any session work.
// 3. Wire SIGTERM/SIGINT to a graceful shutdown with a 10 s hard exit.
import { loadDotenv } from './src/core/env.js';
loadDotenv();

import { createRuntime, shutdownRuntime } from './src/runtime.js';
import { UserError } from './src/core/errors.js';

try {
  const runtime = await createRuntime();

  let shuttingDown = false;
  const onSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownRuntime(runtime, signal);
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
} catch (err) {
  if (err instanceof UserError || err?.safe) {
    console.error(`Startup failed: ${err.message}`);
  } else if (err?.code === 'EADDRINUSE') {
    console.error(`Startup failed: port ${err.port ?? ''} is already in use. Stop the other process or change SERVER_PORT.`);
  } else if (err?.code === 'EACCES') {
    console.error(`Startup failed: port ${err.port ?? ''} cannot be bound on this host (permission denied). Choose a port above 1024.`);
  } else {
    console.error(`Startup failed: ${err.message}`);
  }
  process.exit(1);
}
