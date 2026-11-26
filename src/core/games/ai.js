// Game AI helpers. Word lookups go through Datamuse (free, keyless); a local
// fallback list keeps the AI playable when the network is unavailable.
import { fetchJson, sleep } from '../media.js';

export const AI_PLAYER = 'malonex-ai@s.whatsapp.net';

const wordCache = new Map();

export async function findWcgWord(lastWord, usedWords, { fetcher = null } = {}) {
  const startLetter = lastWord ? lastWord.slice(-1).toLowerCase() : null;
  const doFetch = fetcher || fetchJson;
  try {
    const cacheKey = startLetter || 'all';
    let words = wordCache.get(cacheKey);
    if (!words) {
      const query = startLetter ? `sp=${startLetter}*&max=200` : 'max=200';
      const data = await doFetch(`https://api.datamuse.com/words?${query}`, { timeoutMs: 6000 });
      words = (Array.isArray(data) ? data : [])
        .map((w) => String(w.word || '').toLowerCase())
        .filter((w) => w.length >= 3 && /^[a-z]+$/.test(w));
      wordCache.set(cacheKey, words);
    }
    const available = words.filter((w) => !(usedWords || []).includes(w));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * Math.min(available.length, 50))];
    }
    return fallbackWord(startLetter, usedWords);
  } catch {
    return fallbackWord(startLetter, usedWords);
  }
}

const FALLBACK_WORDS = [
  'apple', 'elephant', 'tiger', 'rabbit', 'table', 'eagle', 'earth', 'house', 'snake', 'engine',
  'river', 'rocket', 'train', 'night', 'tower', 'radio', 'orange', 'energy', 'yellow', 'window',
  'water', 'mother', 'turtle', 'escape', 'tree', 'east', 'tennis', 'storm', 'music', 'castle'
];

function fallbackWord(startLetter, usedWords) {
  const pool = FALLBACK_WORDS.filter((w) => !(usedWords || []).includes(w) && (!startLetter || w[0] === startLetter));
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  return null;
}

export async function aiThinkingDelay(base = 1000) {
  await sleep(base + Math.floor(Math.random() * 500));
}
