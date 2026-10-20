export interface IncomingMessage {
  id: string;
  chatJid: string;
  senderJid: string;
  senderLid?: string;
  isGroup: boolean;
  timestamp: number;
  text?: string;
}

export interface GroupParticipant {
  jid: string;
  lid?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface GroupMetadata {
  id: string;
  subject: string;
  owner?: string;   // LID
  ownerPn?: string; // Phone number JID
  participants: GroupParticipant[];
}

export interface WhatsAppAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendText(chatJid: string, text: string): Promise<void>;
  getGroupMetadata(groupJid: string): Promise<GroupMetadata>;
  kickParticipant(groupJid: string, participantJid: string): Promise<void>;
  deleteMessage(chatJid: string, messageId: string, senderJid: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
}

export interface StorageAdapter {
  init(): Promise<void>;
  getAuthState(): Promise<string | null>;
  saveAuthState(encryptedData: string): Promise<void>;
  close(): Promise<void>;
  }
