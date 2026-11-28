// Health maths, kept pure so tests can verify the numbers exactly.

export function availabilityPct(connectedMs, uptimeMs) {
  if (!Number.isFinite(connectedMs) || !Number.isFinite(uptimeMs) || uptimeMs <= 0) return 0;
  const pct = (Math.max(connectedMs, 0) / uptimeMs) * 100;
  return Math.round(Math.min(pct, 100) * 100) / 100;
}

export function formatDuration(seconds) {
  const s = Math.max(Math.floor(seconds), 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}
