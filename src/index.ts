import { BaileysAdapter } from './adapters/whatsapp.js';
import { MemoryStorageAdapter } from './adapters/storage-memory.js';
import { AuthStateManager } from './core/auth-state.js';

async function main() {
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY;
  
  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('ERROR: AUTH_ENCRYPTION_KEY must be set in .env as a 64-character hex string.');
    process.exit(1);
  }

  const storage = new MemoryStorageAdapter();
  await storage.init();

  const authManager = new AuthStateManager(storage, encryptionKey);
  const adapter = new BaileysAdapter(authManager);

  // Temporary handler just to prove messages arrive
  adapter.onMessage(async (msg) => {
    console.log(`\n--- NEW MESSAGE ---`);
    console.log(`From: ${msg.senderJid}`);
    console.log(`Text: ${msg.text}`);
    
    // Simple echo for testing
    if (msg.text === '.ping') {
      await adapter.sendText(msg.chatJid, 'pong');
    }
  });

  console.log('Starting MaloneX...');
  await adapter.connect();

  // Handle graceful shutdown
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
