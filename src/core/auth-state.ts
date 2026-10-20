import crypto from 'node:crypto';
import { StorageAdapter } from './types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class AuthStateManager {
  private storage: StorageAdapter;
  private encryptionKey: Buffer;
  private writeTimeout: NodeJS.Timeout | null = null;
  private memoryState: Record<string, unknown> = {};

  constructor(storage: StorageAdapter, hexKey: string) {
    this.storage = storage;
    
    // Validate key length (32 bytes = 64 hex chars)
    this.encryptionKey = Buffer.from(hexKey, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte (64-character) hex string.');
    }
  }

  async load(): Promise<Record<string, unknown>> {
    const encrypted = await this.storage.getAuthState();
    if (!encrypted) {
      this.memoryState = {};
      return this.memoryState;
    }

    const buffer = Buffer.from(encrypted, 'base64');
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    try {
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      this.memoryState = JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
      return this.memoryState;
    } catch (err) {
      throw new Error('Failed to decrypt auth state. Check AUTH_ENCRYPTION_KEY.');
    }
  }

  // Call this whenever the socket triggers a 'creds.update' or 'keys.set' event
  scheduleSave(newState: Record<string, unknown>): void {
    // We merge keys rather than replace, because Baileys updates keys incrementally
    this.memoryState = { ...this.memoryState, ...newState };

    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
    }

    // Debounce DB writes to avoid blowing out Heroku connections
    this.writeTimeout = setTimeout(() => {
      void this.flush();
    }, 5000);
  }

  private async flush(): Promise<void> {
    if (Object.keys(this.memoryState).length === 0) return;

    const text = JSON.stringify(this.memoryState);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    // Format: [IV (12b)] + [TAG (16b)] + [Ciphertext]
    const combined = Buffer.concat([iv, tag, ciphertext]);
    
    await this.storage.saveAuthState(combined.toString('base64'));
  }
  }
