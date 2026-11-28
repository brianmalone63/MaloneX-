// File storage: one directory per session under DATA_DIR. Writes are atomic
// (temp file + rename). Session ids must be digits-only — the bot uses the
// fixed id "000000000000" until the linked number is known.
import fs from 'node:fs/promises';
import path from 'node:path';

const ID_RE = /^[0-9]{1,20}$/;

export class FileStore {
  constructor({ dataDir, logger } = {}) {
    this.dataDir = path.resolve(dataDir || './data');
    this.logger = logger;
  }

  sessionDir(id) {
    if (!ID_RE.test(id)) throw new Error('Session ids must be digits only.');
    return path.join(this.dataDir, id);
  }

  keysDir(id) {
    return path.join(this.sessionDir(id), 'keys');
  }

  // Atomic write: unique temp file in the same directory, then rename over the
  // target. Writes to the same file are queued, because Baileys fires several
  // creds updates in the same millisecond; with a shared temp name the second
  // rename failed with ENOENT and crashed the process.
  async atomicWrite(file, data) {
    this.writeQueues ??= new Map();
    const prev = this.writeQueues.get(file) || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, file);
    });
    this.writeQueues.set(file, run);
    try {
      await run;
    } finally {
      if (this.writeQueues.get(file) === run) this.writeQueues.delete(file);
    }
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async close() {}

  async getAuth(id) {
    const out = { creds: null, keys: {} };
    let credsText;
    try {
      credsText = await fs.readFile(path.join(this.sessionDir(id), 'creds.json'), 'utf8');
    } catch {
      return out; // No stored session yet.
    }
    out.creds = JSON.parse(credsText);
    let entries;
    try {
      entries = await fs.readdir(this.keysDir(id), { recursive: true });
    } catch {
      return out; // Keys folder absent: creds-only session.
    }
    for (const rel of entries) {
      if (!rel.endsWith('.json')) continue;
      const relPath = rel.split(path.sep).join('/');
      // Layout: keys/<type>/<id>.json → composite "<type>:<id>".
      const withoutExt = relPath.slice(0, -5);
      const sepIdx = withoutExt.indexOf('/');
      if (sepIdx <= 0) continue;
      const composite = `${withoutExt.slice(0, sepIdx)}:${withoutExt.slice(sepIdx + 1)}`;
      const text = await fs.readFile(path.join(this.keysDir(id), rel), 'utf8');
      out.keys[composite] = JSON.parse(text);
    }
    return out;
  }

  // entries: array of [compositeKey, value] pairs, values already run through
  // JSON.stringify with Baileys' BufferJSON replacer by the caller.
  async setAuthBulk(id, entries) {
    for (const [composite, json] of entries) {
      const [type, ...rest] = composite.split(':');
      const keyId = rest.join(':');
      if (!type || !keyId) continue;
      const file = path.join(this.keysDir(id), type, keyId) + '.json';
      await fs.mkdir(path.dirname(file), { recursive: true });
      await this.atomicWrite(file, json);
    }
  }

  async saveCreds(id, credsJson) {
    await fs.mkdir(this.sessionDir(id), { recursive: true });
    await this.atomicWrite(path.join(this.sessionDir(id), 'creds.json'), credsJson);
  }

  async wipeAuth(id) {
    await fs.rm(this.sessionDir(id), { recursive: true, force: true });
    await fs.mkdir(this.sessionDir(id), { recursive: true });
  }

  async getSettings(id) {
    try {
      const text = await fs.readFile(path.join(this.sessionDir(id), 'settings.json'), 'utf8');
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  async setSetting(id, key, value) {
    const current = await this.getSettings(id);
    current[key] = value;
    await fs.mkdir(this.sessionDir(id), { recursive: true });
    await this.atomicWrite(path.join(this.sessionDir(id), 'settings.json'), JSON.stringify(current, null, 2));
  }

  async saveSessionMeta(id, meta) {
    const current = await this.getSettings(id);
    current._meta = { ...(current._meta || {}), ...meta };
    await fs.mkdir(this.sessionDir(id), { recursive: true });
    await this.atomicWrite(path.join(this.sessionDir(id), 'settings.json'), JSON.stringify(current, null, 2));
  }
}
