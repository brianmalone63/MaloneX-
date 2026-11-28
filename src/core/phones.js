// Phone number helpers. Everything user-facing or logged goes through
// maskPhone: full numbers never appear in replies, pages or logs.

// E.164 without the plus sign: 7 to 15 digits. Accepts "+", spaces, dashes
// and parentheses in the input and strips everything else.
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s().-]/g, '').replace(/^\+/, '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (!/^[1-9]/.test(digits)) return null;
  return digits;
}

// +254****678 style: keeps the first three and last three digits for normal
// numbers; short inputs are fully masked.
export function maskPhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length <= 8) return '+' + '*'.repeat(Math.max(digits.length, 4));
  return `+${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

// Extracts the digits part of a WhatsApp JID ("254712...@s.whatsapp.net" or
// "254712...:12@s.whatsapp.net").
export function jidToPhone(jid) {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0] || null;
}
