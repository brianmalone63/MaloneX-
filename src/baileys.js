// The only module in the project that imports Baileys directly.
// Everything else imports the re-exports below.
import * as baileysModule from '@whiskeysockets/baileys';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  jidNormalizedUser,
  getContentType,
  DisconnectReason
} = baileysModule;

export {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  jidNormalizedUser,
  getContentType,
  DisconnectReason
};
