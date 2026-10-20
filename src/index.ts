import { BaileysAdapter } from './adapters/whatsapp.js';
import { PostgresStorageAdapter } from './adapters/storage-postgres.js';
import { AuthStateManager } from './core/auth-state.js';

async function main() {
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY;
  const phoneNumber = process.env.BOT_PHONE_NUMBER;

  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('ERROR: AUTH_ENCRYPTION_KEY must be set as a 64-character hex string.');
    process.exit(1);
  }

  if (!phoneNumber) {
    console.error('ERROR: BOT_PHONE_NUMBER must be set (country code + number, no +).');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set.');
    process.exit(1);
  }

  const storage = new PostgresStorageAdapter();
  await storage.init();

  const authManager = new AuthStateManager(storage, encryptionKey);
  const adapter = new BaileysAdapter(authManager);

  adapter.onMessage(async (msg) => {
    console.log(`\n--- NEW MESSAGE ---`);
    console.log(`From: ${msg.senderJid}`);
    console.log(`Text: ${msg.text}`);
    
    if (msg.text === '.ping') {
      await adapter.sendText(msg.chatJid, 'pong');
    }
  });

  console.log('Starting MaloneX...');
  await adapter.connectWithPairingCode(phoneNumber);

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await adapter.disconnect();
    await storage.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
