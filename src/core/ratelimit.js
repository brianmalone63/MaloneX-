// Per-sender, per-command cooldown. Super users bypass the limit so owner
// tooling never gets in the way of admin work.
const buckets = new Map(); // `${chat}:${sender}:${command}` -> last ms

let DEFAULT_COOLDOWN_MS = 3000;

// Environment override so operators can tune the limiter without code changes.
const envCooldown = Number.parseInt(process.env.RATE_LIMIT_MS || '', 10);
if (Number.isFinite(envCooldown) && envCooldown >= 0) DEFAULT_COOLDOWN_MS = envCooldown;

export function configure({ cooldownMs } = {}) {
  if (Number.isFinite(cooldownMs) && cooldownMs >= 0) DEFAULT_COOLDOWN_MS = cooldownMs;
}

export function check({ chat, sender, command, cooldownMs = null, bypass = false }) {
  if (bypass) return { ok: true };
  const key = `${chat}:${sender}:${command}`;
  const limit = cooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (limit <= 0) return { ok: true };
  const now = Date.now();
  const last = buckets.get(key) || 0;
  if (now - last < limit) {
    const wait = Math.ceil((limit - (now - last)) / 1000);
    return { ok: false, waitSeconds: wait };
  }
  buckets.set(key, now);
  return { ok: true };
}

export function reset(chat = null) {
  if (!chat) buckets.clear();
  else for (const key of [...buckets.keys()]) if (key.startsWith(`${chat}:`)) buckets.delete(key);
}

export function size() {
  return buckets.size;
}
