import express from 'express';
import { BaileysAdapter } from './adapters/whatsapp.js';
import { PostgresStorageAdapter } from './adapters/storage-postgres.js';
import { AuthStateManager } from './core/auth-state.js';
import { Pipeline } from './core/pipeline.js';
import { registerCommands } from './commands/index.js';

const app = express();
app.use(express.urlencoded({ extended: true }));

async function main() {
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY;
  const pairingSecret = process.env.PAIRING_SECRET;
  
  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('ERROR: AUTH_ENCRYPTION_KEY must be set as a 64-character hex string.');
    process.exit(1);
  }

  if (!pairingSecret) {
    console.error('ERROR: PAIRING_SECRET must be set.');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set.');
    process.exit(1);
  }

  // 1. Initialize Storage & Auth
  const storage = new PostgresStorageAdapter();
  await storage.init();

  const authManager = new AuthStateManager(storage, encryptionKey);
  const adapter = new BaileysAdapter(authManager);

  // 2. Initialize Command Pipeline
  const pipeline = new Pipeline();
  registerCommands(pipeline);

  // 3. Wire Adapter to Pipeline
  adapter.onMessage(async (msg) => {
    await pipeline.process(msg, adapter);
  });

  // 4. Connect to WhatsApp IMMEDIATELY on startup
  console.log('Starting MaloneX...');
  try {
    await adapter.connect();
  } catch (err) {
    console.error('Failed to connect on startup:', err);
  }

  // 5. Start Express Server (for Heroku health checks and pairing fallback)
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>MaloneX</title></head>
      <body style="background: #121212; color: #fff; font-family: system-ui; text-align: center; padding: 50px;">
        <h1>MaloneX is running.</h1>
        <p>Check your Heroku logs for the pairing code if not connected.</p>
      </body>
      </html>
    `);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
  });

  // 6. Graceful Shutdown (Handles SIGTERM for Heroku)
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await adapter.disconnect();
    await storage.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
