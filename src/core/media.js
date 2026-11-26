import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(os.tmpdir(), 'malonex-media');

async function ensureTemp() {
  await fsp.mkdir(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

let tempSeq = 0;
export async function tempFile(buffer, ext) {
  const dir = await ensureTemp();
  tempSeq = (tempSeq + 1) % 100000;
  const file = path.join(dir, `${Date.now()}_${process.pid}_${tempSeq}${ext || ''}`);
  await fsp.writeFile(file, buffer);
  return file;
}

export async function withTemp(buffer, ext, fn) {
  const input = await tempFile(buffer, ext);
  try {
    return await fn(input);
  } finally {
    fsp.unlink(input).catch(() => {});
  }
}

function execFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).slice(0, 400)));
      else resolve({ stdout, stderr });
    });
  });
}

// ---------- HTTP helpers (native fetch, no extra dependency) ----------

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MaloneX/1.0';

export async function fetchBuffer(url, { maxBytes = 400 * 1024 * 1024, timeoutMs = 120000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'DNT': '1', ...headers }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) throw new Error('Empty response');
    if (arrayBuffer.byteLength > maxBytes) throw new Error(`Response exceeds ${Math.floor(maxBytes / (1024 * 1024))} MB`);
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { timeoutMs = 45000, headers = {}, method = 'GET', body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = text;
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- formatting helpers ----------

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} bytes`;
}

export function runtime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isUrl(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/i);
  return match ? match[0] : null;
}

export function randomId(prefix = 'mx') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const MIME_MAP = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf', zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
  apk: 'application/vnd.android.package-archive', txt: 'text/plain', json: 'application/json', html: 'text/html', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  vcf: 'text/vcard'
};

export function getMimeFromUrl(url) {
  try {
    const clean = String(url).split('?')[0].split('#')[0];
    const ext = clean.split('.').pop().toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

export function getExtensionFromMime(contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_MAP)) {
    if (mime === base) return `.${ext}`;
  }
  if (base.startsWith('text/')) return '.txt';
  if (base.startsWith('image/')) return '.bin';
  if (base.startsWith('audio/')) return '.bin';
  if (base.startsWith('video/')) return '.bin';
  return '.bin';
}

export function isTextMime(contentType) {
  const base = String(contentType || '').toLowerCase();
  return ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/yaml', 'application/toml', '+json', '+xml']
    .some((t) => base.includes(t));
}

function mimeCategory(mimetype) {
  const base = String(mimetype || '');
  if (base.startsWith('audio/')) return 'audio';
  if (base.startsWith('video/')) return 'video';
  if (base.startsWith('image/')) return 'image';
  return 'document';
}

export { mimeCategory };

// ---------- ffmpeg conversions ----------

export async function toAudio(buffer) {
  return withTemp(buffer, '.in', async (input) => {
    // Probe first so "video without sound" fails with a clear message.
    await execFfmpeg(['-i', input, '-t', '1', '-f', 'null', '-'], 60000).catch(() => {
      throw new Error('The file could not be read as media.');
    });
    const output = input.replace(/\.in$/, '.mp3');
    await execFfmpeg(['-i', input, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-ac', '2', output]);
    const out = await fsp.readFile(output).catch(() => null);
    if (!out || out.length === 0) throw new Error('This media has no audio track to extract.');
    fsp.unlink(output).catch(() => {});
    return out;
  });
}

export async function toPtt(buffer) {
  return withTemp(buffer, '.in', async (input) => {
    const output = input.replace(/\.in$/, '.ogg');
    await execFfmpeg(['-i', input, '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-f', 'ogg', output]);
    const out = await fsp.readFile(output);
    fsp.unlink(output).catch(() => {});
    return out;
  });
}

export async function toVideo(buffer) {
  return withTemp(buffer, '.in', async (input) => {
    const output = input.replace(/\.in$/, '.mp4');
    await execFfmpeg([
      '-f', 'lavfi', '-i', 'color=black:s=640x360:r=1',
      '-i', input, '-shortest', '-preset', 'ultrafast', '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', output
    ], 300000);
    const out = await fsp.readFile(output);
    fsp.unlink(output).catch(() => {});
    return out;
  });
}

export async function getVideoDuration(inputPath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-i', inputPath], { timeout: 30000 }, (_err, _stdout, stderr) => {
      const match = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (match) {
        const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        resolve(Number.isFinite(seconds) ? seconds : 8);
      } else {
        resolve(8);
      }
    });
  });
}

// Convert any media into an animated (or still) webp ready for stickers.
export async function mediaToWebp(buffer, { fps = 15, maxDuration = 10, size = 512 } = {}) {
  return withTemp(buffer, '.in', async (input) => {
    let duration = await getVideoDuration(input);
    if (!Number.isFinite(duration) || duration <= 0) duration = 8;
    if (duration > maxDuration) duration = maxDuration;
    const output = input.replace(/\.in$/, '.webp');
    await execFfmpeg([
      '-i', input, '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:-1:-1:color=black@0x0,fps=${fps}`,
      '-t', String(Math.max(1, duration)), '-an', '-vcodec', 'libwebp', '-loop', '0', '-preset', 'default', output
    ], 300000);
    const out = await fsp.readFile(output);
    fsp.unlink(output).catch(() => {});
    return out;
  });
}

// Extract a plain image (png) or animation (gif) from a sticker file.
export async function stickerToImage(buffer) {
  return withTemp(buffer, '.webp', async (input) => {
    const png = input.replace(/\.webp$/, '.png');
    await execFfmpeg(['-i', input, png]);
    const out = await fsp.readFile(png).catch(async () => {
      const gif = input.replace(/\.webp$/, '.gif');
      await execFfmpeg(['-i', input, gif]);
      const gifBuf = await fsp.readFile(gif);
      fsp.unlink(gif).catch(() => {});
      return gifBuf;
    });
    fsp.unlink(png).catch(() => {});
    return out;
  });
}

// Build a WhatsApp sticker (webp with pack metadata) from an image, video or
// an existing sticker. `crop` cuts the media into a square.
export async function makeSticker(buffer, { pack = 'MaloneX', author = 'Brian Malone', crop = false } = {}) {
  const webp = await mediaToWebp(buffer, { size: 512 });
  const sticker = new Sticker(webp, {
    pack,
    author,
    type: crop ? StickerTypes.CROPPED : StickerTypes.FULL,
    quality: 80,
    categories: ['MALX']
  });
  return sticker.toBuffer();
}

// Render an SVG string to PNG. Used by text-to-sticker and local text logos.
export async function renderSvg(svg, { width = 512, height = 512 } = {}) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    throw new Error('Image processing is unavailable: sharp could not be loaded.');
  }
  return sharp(Buffer.from(svg)).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

// ---------- text transforms ----------

const MONOSPACE_MAP = {
  A: '𝙰', B: '𝙱', C: '𝙲', D: '𝙳', E: '𝙴', F: '𝙵', G: '𝙶', H: '𝙷', I: '𝙸', J: '𝙹', K: '𝙺', L: '𝙻', M: '𝙼',
  N: '𝙽', O: '𝙾', P: '𝙿', Q: '𝚀', R: '𝚁', S: '𝚂', T: '𝚃', U: '𝚄', V: '𝚅', W: '𝚆', X: '𝚇', Y: '𝚈', Z: '𝚉',
  a: '𝚊', b: '𝚋', c: '𝚌', d: '𝚍', e: '𝚎', f: '𝚏', g: '𝚐', h: '𝚑', i: '𝚒', j: '𝚓', k: '𝚔', l: '𝚕', m: '𝚖',
  n: '𝚗', o: '𝚘', p: '𝚙', q: '𝚚', r: '𝚛', s: '𝚜', t: '𝚝', u: '𝚞', v: '𝚟', w: '𝚠', x: '𝚡', y: '𝚢', z: '𝚣',
  0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕', 8: '𝟖', 9: '𝟗'
};

export function monospace(text) {
  return String(text || '').split('').map((c) => MONOSPACE_MAP[c] || c).join('');
}

const FANCY_MAPS = [
  { name: 'bold', map: { a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡', i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦', n: '𝐧', o: '𝐨', p: '𝐩', q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱', y: '𝐲', z: '𝐳', A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌', N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙', 0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕', 8: '𝟖', 9: '𝟗' } },
  { name: 'italic', map: { a: '𝘢', b: '𝘣', c: '𝘤', d: '𝘥', e: '𝘦', f: '𝘧', g: '𝘨', h: '𝘩', i: '𝘪', j: '𝘫', k: '𝘬', l: '𝘭', m: '𝘮', n: '𝘯', o: '𝘰', p: '𝘱', q: '𝘲', r: '𝘳', s: '𝘴', t: '𝘵', u: '𝘶', v: '𝘷', w: '𝘸', x: '𝘹', y: '𝘺', z: '𝘻', A: '𝘈', B: '𝘉', C: '𝘊', D: '𝘋', E: '𝘌', F: '𝘍', G: '𝘎', H: '𝘏', I: '𝘐', J: '𝘑', K: '𝘒', L: '𝘓', M: '𝘔', N: '𝘕', O: '𝘖', P: '𝘗', Q: '𝘘', R: '𝘙', S: '𝘚', T: '𝘛', U: '𝘜', V: '𝘝', W: '𝘞', X: '𝘟', Y: '𝘠', Z: '𝘡' } },
  { name: 'double', map: { a: '𝕒', b: '𝕓', c: '𝕔', d: '𝕕', e: '𝕖', f: '𝕗', g: '𝕘', h: '𝕙', i: '𝕚', j: '𝕛', k: '𝕜', l: '𝕝', m: '𝕞', n: '𝕟', o: '𝕠', p: '𝕡', q: '𝕢', r: '𝕣', s: '𝕤', t: '𝕥', u: '𝕦', v: '𝕧', w: '𝕨', x: '𝕩', y: '𝕪', z: '𝕫', A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ', Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏', Y: '𝕐', Z: 'ℤ', 0: '𝟘', 1: '𝟙', 2: '𝟚', 3: '𝟛', 4: '𝟜', 5: '𝟝', 6: '𝟞', 7: '𝟟', 8: '𝟠', 9: '𝟡' } },
  { name: 'script', map: { a: '𝓪', b: '𝓫', c: '𝓬', d: '𝓭', e: '𝓮', f: '𝓯', g: '𝓰', h: '𝓱', i: '𝓲', j: '𝓳', k: '𝓴', l: '𝓵', m: '𝓶', n: '𝓷', o: '𝓸', p: '𝓹', q: '𝓺', r: '𝓻', s: '𝓼', t: '𝓽', u: '𝓾', v: '𝓿', w: '𝔀', x: '𝔁', y: '𝔂', z: '𝔃', A: '𝓐', B: '𝓑', C: '𝓒', D: '𝓓', E: '𝓔', F: '𝓕', G: '𝓖', H: '𝓗', I: '𝓘', J: '𝓙', K: '𝓚', L: '𝓛', M: '𝓜', N: '𝓝', O: '𝓞', P: '𝓟', Q: '𝓠', R: '𝓡', S: '𝓢', T: '𝓣', U: '𝓤', V: '𝓥', W: '𝓦', X: '𝓧', Y: '𝓨', Z: '𝓩' } },
  { name: 'boxed', map: { a: '🄰', b: '🄱', c: '🄲', d: '🄳', e: '🄴', f: '🄵', g: '🄶', h: '🄷', i: '🄸', j: '🄹', k: '🄺', l: '🄻', m: '🄼', n: '🄽', o: '🄾', p: '🄿', q: '🅀', r: '🅁', s: '🅂', t: '🅃', u: '🅄', v: '🅅', w: '🅆', x: '🅇', y: '🅈', z: '🄉' } },
  { name: 'circled', map: { a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ', i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ', q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ', y: 'ⓨ', z: 'ⓩ', A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ', I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ', P: 'Ⓟ', Q: 'Ⓠ', R: 'Ⓡ', S: 'Ⓢ', T: 'Ⓣ', U: 'Ⓤ', V: 'Ⓥ', W: 'Ⓦ', X: 'Ⓧ', Y: 'Ⓨ', Z: 'Ⓩ', 0: '⓪', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧', 9: '⑨' } }
];

// Local font converter used by the .fancy command. Transforms apply to letters
// that have a mapping; other characters pass through unchanged.
export function fancyLocal(text) {
  return FANCY_MAPS.map((variant) => ({
    name: variant.name,
    result: String(text || '').split('').map((c) => variant.map[c] || c).join('')
  }));
}

export function encodeBinary(text) {
  return String(text || '').split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

export function decodeBinary(text) {
  const parts = String(text || '').trim().split(/\s+/);
  if (parts.some((p) => !/^[01]{1,16}$/.test(p))) throw new Error('Not valid binary.');
  return parts.map((p) => String.fromCharCode(Number.parseInt(p, 2))).join('');
}

export function encodeBase64(text) {
  return Buffer.from(String(text || ''), 'utf8').toString('base64');
}

export function decodeBase64(text) {
  const clean = String(text || '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]*$/.test(clean) || clean.length === 0) throw new Error('Not valid Base64.');
  const buf = Buffer.from(clean, 'base64');
  const decoded = buf.toString('utf8');
  if (buf.length > 0 && decoded.includes('\uFFFD')) throw new Error('Not valid Base64.');
  return decoded;
}
