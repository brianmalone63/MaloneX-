import { jidNormalizedUser } from '../baileys.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const metadataCache = new Map(); // jid -> { data, at }

export function invalidateGroup(jid) {
  metadataCache.delete(jid);
}

export function clearGroupCache() {
  metadataCache.clear();
}

export function digits(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function toUserJid(input) {
  if (!input) return null;
  let jid = String(input).trim();
  if (jid.includes('@')) return jidNormalizedUser(jid);
  const num = jid.replace(/\D/g, '');
  if (num.length < 6) return null;
  return `${num}@s.whatsapp.net`;
}

// Group metadata with a short TTL cache. Falls back to a direct call.
export async function getGroupMeta(sock, jid) {
  const cached = metadataCache.get(jid);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await sock.groupMetadata(jid);
  if (data) metadataCache.set(jid, { data, at: Date.now() });
  return data;
}

// Resolve the permission surface a command needs for a message context.
export function resolveGroupContext(meta, { jid, sender, botJid }) {
  const participants = meta && Array.isArray(meta.participants) ? meta.participants : [];
  const admins = [];
  const superAdmins = [];
  for (const p of participants) {
    const canonical = p.pn || p.phoneNumber || p.id;
    const num = digits(canonical);
    if (!num) continue;
    if (p.admin === 'admin') admins.push(num);
    if (p.admin === 'superadmin') superAdmins.push(num);
  }
  const senderNum = digits(sender);
  const botNum = digits(botJid);
  return {
    meta,
    participants,
    groupName: meta?.subject || '',
    adminNums: [...admins, ...superAdmins],
    senderIsAdmin: admins.includes(senderNum) || superAdmins.includes(senderNum),
    senderIsSuperAdmin: superAdmins.includes(senderNum),
    botIsAdmin: admins.includes(botNum) || superAdmins.includes(botNum)
  };
}

// Super users: owner numbers from config, the linked account itself and any
// numbers configured through the SUDO_NUMBERS setting.
export function superUserNumbers(session, botJid) {
  const set = new Set();
  if (botJid) set.add(digits(botJid));
  for (const owner of session.config.owners || []) set.add(String(owner).replace(/\D/g, ''));
  const sudo = String(session.settings?.SUDO_NUMBERS || '');
  for (const num of sudo.split(',')) {
    const cleaned = num.replace(/\D/g, '');
    if (cleaned.length >= 9) set.add(cleaned);
  }
  return set;
}

export function isSuperUser(session, sender, botJid) {
  if (!sender) return false;
  const num = digits(sender);
  if (!num) return false;
  return superUserNumbers(session, botJid).has(num);
}
