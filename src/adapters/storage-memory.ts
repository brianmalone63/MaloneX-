import { StorageAdapter } from '../core/types.js';

export class MemoryStorageAdapter implements StorageAdapter {
  private authState: string | null = null;

  async init(): Promise<void> {
    // No initialization needed for memory
  }

  async getAuthState(): Promise<string | null> {
    return this.authState;
  }

  async saveAuthState(encryptedData: string): Promise<void> {
    this.authState = encryptedData;
  }

  async close(): Promise<void> {
    this.authState = null;
  }
  }
