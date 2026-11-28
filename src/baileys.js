// The only module in the project that imports Baileys directly.
// Everything else imports the re-exports below, so a library upgrade is a
// one-file change.
import * as baileysModule from '@whiskeysockets/baileys';

const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidNormalizedUser,
  DisconnectReason,
  Browsers,
  BufferJSON,
  initAuthCreds
} = baileysModule;

export {
  makeWASocket,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidNormalizedUser,
  DisconnectReason,
  Browsers,
  BufferJSON,
  initAuthCreds
};

// WhatsApp Web version cache (1 hour). The version probe is a network call;
// caching keeps reconnects cheap and keeps boot working offline with the
// bundled default.
const VERSION_TTL_MS = 60 * 60 * 1000;
let versionCache = { version: null, at: 0 };

export async function getWaVersion(logger) {
  const fresh = versionCache.version && Date.now() - versionCache.at < VERSION_TTL_MS;
  if (fresh) return versionCache.version;
  try {
    const result = await fetchLatestBaileysVersion();
    versionCache = { version: result.version, at: Date.now() };
    if (logger) logger.info(`Using WhatsApp Web version ${result.version.join('.')}.`);
    return versionCache.version;
  } catch (err) {
    // Offline or blocked: keep whatever we have (Baileys falls back to its
    // bundled default when no version is passed).
    if (logger) logger.warn(`could not fetch the WhatsApp version, using the bundled default: ${err.message}`);
    return versionCache.version;
  }
}
