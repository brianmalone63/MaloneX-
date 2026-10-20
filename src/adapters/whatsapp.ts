import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  type AuthenticationState,
  type AuthenticationCreds,
  type SignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { WhatsAppAdapter, IncomingMessage, GroupMetadata } from '../core/types.js';
import { AuthStateManager } from '../core/auth-state.js';

export class BaileysAdapter implements WhatsAppAdapter {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private authManager: AuthStateManager;
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  constructor(authManager: AuthStateManager) {
    this.authManager = authManager;
  }

  private async getAuthState(): Promise<AuthenticationState> {
    const loaded = await this.authManager.load();
    
    let creds = loaded.creds as AuthenticationCreds;
    if (!creds) {
      creds = initAuthCreds();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keysData = (loaded.keys || {}) as Record<string, Record<string, any>>;

    const keys: SignalKeyStore = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: async (type, ids) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: Record<string, any> = {};
        for (const id of ids) {
          if (keysData[type] && keysData[type][id]) {
            data[id] = keysData[type][id];
          }
        }
        return data;
      },
      set: async (data) => {
        for (const category in data) {
          const categoryData = data[category as keyof typeof data];
          if (!categoryData) continue;
          for (const id in categoryData) {
            const value = categoryData[id];
            if (!keysData[category]) keysData[category] = {};
            if (value === null || value === undefined) {
              delete keysData[category][id];
            } else {
              keysData[category][id] = value;
            }
          }
        }
        this.authManager.scheduleSave({ keys: keysData });
      },
      clear: async () => {
        // Not implemented
      }
    };

    return { creds, keys };
  }

  async connect(): Promise<void> {
    const state = await this.getAuthState();

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on('creds.update', (creds) => {
      this.authManager.scheduleSave({ creds });
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          void this.connect();
        }
      }
    });

    this.sock.ev.on('messages.upsert', async (m) => {
      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) continue;

        const incoming: IncomingMessage = {
          id: msg.key.id || '',
          chatJid: msg.key.remoteJid || '',
          senderJid: msg.key.participant || msg.key.remoteJid || '',
          isGroup: msg.key.remoteJid?.endsWith('@g.us') || false,
          timestamp: Number(msg.messageTimestamp) * 1000,
          text,
        };

        if (this.messageHandler) {
          await this.messageHandler(incoming);
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    this.sock?.end(undefined);
  }

  async sendText(chatJid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('Not connected');
    await this.sock.sendMessage(chatJid, { text });
  }

  async getGroupMetadata(groupJid: string): Promise<GroupMetadata> {
    if (!this.sock) throw new Error('Not connected');
    
    // Cast raw metadata to bypass strict v6 type mismatches at the adapter boundary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = await this.sock.groupMetadata(groupJid) as any;
    
    return {
      id: metadata.id,
      subject: metadata.subject,
      owner: metadata.owner || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participants: (metadata.participants || []).map((p: any) => ({
        jid: p.id,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
        isSuperAdmin: p.admin === 'superadmin',
      })),
    };
  }

  async kickParticipant(groupJid: string, participantJid: string): Promise<void> {
    if (!this.sock) throw new Error('Not connected');
    await this.sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
  }

  async deleteMessage(chatJid: string, messageId: string, senderJid: string): Promise<void> {
    if (!this.sock) throw new Error('Not connected');
    await this.sock.sendMessage(chatJid, { 
      delete: { remoteJid: chatJid, fromMe: false, id: messageId, participant: senderJid } 
    });
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }
  }
