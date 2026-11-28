// Disconnect classification and backoff maths. Pure functions, fully tested.
// The mapping mirrors Baileys' DisconnectReason codes:
//   401 loggedOut, 403 forbidden, 408 timedOut, 428 connectionClosed,
//   440 connectionReplaced, 500 (WhatsApp internal), 503 serviceUnavailable,
//   515 restartRequired.

export const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const BACKOFF_BASE_MS = 1000;
export const MAX_CONSECUTIVE_FAILURES = 3;

// Exponential backoff: 1s doubling, capped at 5 minutes, with 20% jitter on
// either side (0.8x..1.2x). rng lets tests make it deterministic.
export function backoffDelay(attempt, rng = Math.random) {
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(attempt - 1, 0)), MAX_BACKOFF_MS);
  return Math.round(base * (0.8 + rng() * 0.4));
}

// Classifies a disconnect into an action for the Session state machine.
// registered tells the classifier whether the device had ever completed
// registration (creds.registered === true at boot).
export function classifyDisconnect(code, { registered = true } = {}) {
  // A connection that closes before the device ever registered with
  // WhatsApp cannot be fixed by retrying: the session data is missing or
  // incomplete. 401/440/515 keep their own semantics.
  if (!registered && code !== 401 && code !== 440 && code !== 515) {
    return {
      action: 'stop',
      reason: `The connection closed before the session was registered (code ${code ?? 'unknown'}).`,
      advice: 'There is no usable session yet. Get a session from the pairing site, paste it into the SESSION variable and restart, or use the built-in pairing page.'
    };
  }
  switch (code) {
    case 401:
      return {
        action: 'wipe',
        reason: 'WhatsApp logged this session out (401).',
        advice: 'The stored session is no longer valid. Get a new session from the pairing site and paste it into the SESSION variable, then restart. The bot will not reconnect on its own.'
      };
    case 440:
      return {
        action: 'stop-keep',
        reason: 'This session is running somewhere else (440, connection replaced).',
        advice: 'Stop the duplicate deployment (another server or container using the same session string), then restart this one. Credentials were kept, so no re-pairing is needed.'
      };
    case 515:
      // WhatsApp asks for a clean restart; normal operation, not a failure.
      return {
        action: 'quick-reconnect',
        reason: 'WhatsApp requested a restart (515).',
        advice: 'None needed; the bot reconnects automatically in 500 ms.'
      };
    case 500:
      return {
        action: 'reconnect',
        reason: 'WhatsApp reported an internal server error (500).',
        advice: 'Usually temporary. The bot retries automatically and stops after three consecutive failures.'
      };
    case 408:
    case 428:
    case 503:
      return {
        action: 'reconnect',
        reason: `Connection dropped (${code}).`,
        advice: 'Usually a network hiccup. The bot reconnects with increasing waits between attempts.'
      };
    default:
      return {
        action: 'reconnect',
        reason: `Unknown disconnect (code ${code ?? 'unknown'}).`,
        advice: 'The bot reconnects with increasing waits between attempts.'
      };
  }
}
