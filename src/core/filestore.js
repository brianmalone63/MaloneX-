import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// File storage backend for panel servers: one folder per session under DATA_DIR.
// Settings live in <session folder>/settings.json and are written atomically
// (temp file first, then rename). Baileys credentials also live in the folder.
export class FileStore {
  constructor({ dataDir = './data' } = {}) {
    this.dataDir = path.resolve(dataDir);
  }

  assertId(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      throw new Error(`Invalid session id "${String(sessionId)}".`);
    }
    return sessionId;
  }

  sessionDir(sessionId) {
    return path.join(this.dataDir, this.assertId(sessionId));
  }

  settingsPath(sessionId) {
    return path.join(this.sessionDir(sessionId), 'settings.json');
  }

  groupPath(sessionId, groupJid) {
    const safe = String(groupJid).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
    return path.join(this.sessionDir(sessionId), 'groups', `${safe}.json`);
  }

  docPath(sessionId, collection, key) {
    const safeCollection = String(collection).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    const safeKey = String(key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150);
    return path.join(this.sessionDir(sessionId), 'docs', safeCollection, `${safeKey}.json`);
  }

  async readJson(file) {
    try {
      const raw = await fsp.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  metaPath(sessionId) {
    return path.join(this.sessionDir(sessionId), 'session.json');
  }

  async init() {
    await fsp.mkdir(this.dataDir, { recursive: true });
  }

  async has(sessionId) {
    try {
      const stat = await fsp.stat(this.sessionDir(sessionId));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async createSession(sessionId) {
    const dir = this.sessionDir(sessionId);
    if (fs.existsSync(dir)) return false;
    await fsp.mkdir(dir, { recursive: true });
    await this.writeJsonAtomic(this.metaPath(sessionId), {
      id: sessionId,
      createdAt: new Date().toISOString()
    });
    return true;
  }

  async deleteSession(sessionId) {
    await fsp.rm(this.sessionDir(sessionId), { recursive: true, force: true });
    return true;
  }

  async listSessions() {
    await fsp.mkdir(this.dataDir, { recursive: true });
    const entries = await fsp.readdir(this.dataDir, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!SESSION_ID_RE.test(entry.name)) continue;
      const meta = await this.getSession(entry.name);
      sessions.push(meta || { id: entry.name, createdAt: null, phone: null });
    }
    sessions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return sessions;
  }

  async getSession(sessionId) {
    try {
      const raw = await fsp.readFile(this.metaPath(sessionId), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async saveSessionMeta(sessionId, meta = {}) {
    const dir = this.sessionDir(sessionId);
    await fsp.mkdir(dir, { recursive: true });
    const existing = await this.getSession(sessionId) || {};
    const next = { ...existing, ...meta, id: sessionId, updatedAt: new Date().toISOString() };
    await this.writeJsonAtomic(this.metaPath(sessionId), next);
    return next;
  }

  async getSettings(sessionId) {
    try {
      const raw = await fsp.readFile(this.settingsPath(sessionId), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  async setSetting(sessionId, key, value) {
    const dir = this.sessionDir(sessionId);
    await fsp.mkdir(dir, { recursive: true });
    const current = await this.getSettings(sessionId);
    current[key] = value;
    await this.writeJsonAtomic(this.settingsPath(sessionId), current);
    return true;
  }

  // ---- per-group settings (one JSON file per group) ----

  async getGroupSettings(sessionId, groupJid) {
    const data = await this.readJson(this.groupPath(sessionId, groupJid));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  async setGroupSetting(sessionId, groupJid, key, value) {
    const file = this.groupPath(sessionId, groupJid);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const current = (await this.readJson(file)) || {};
    current[key] = value;
    await this.writeJsonAtomic(file, current);
    return true;
  }

  // ---- generic JSON document storage (notes, games, sudo, warnings, tempmail) ----

  async getDoc(sessionId, collection, key) {
    return this.readJson(this.docPath(sessionId, collection, key));
  }

  async setDoc(sessionId, collection, key, value) {
    const file = this.docPath(sessionId, collection, key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await this.writeJsonAtomic(file, value);
    return true;
  }

  async delDoc(sessionId, collection, key) {
    try {
      await fsp.rm(this.docPath(sessionId, collection, key), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async listDocs(sessionId, collection) {
    const dir = path.join(this.sessionDir(sessionId), 'docs', String(collection).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60));
    let names;
    try {
      names = await fsp.readdir(dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const key = name.slice(0, -5);
      const value = await this.readJson(path.join(dir, name));
      if (value !== null) out.push({ key, value });
    }
    return out;
  }

  async delAllDocs(sessionId, collection) {
    const dir = path.join(this.sessionDir(sessionId), 'docs', String(collection).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60));
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  }

  // Remove all Baileys credentials but keep session.json and settings.json so
  // settings survive a re-pair.
  async resetAuth(sessionId) {
    const dir = this.sessionDir(sessionId);
    const meta = await this.getSession(sessionId);
    const settings = await this.getSettings(sessionId);
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });
    if (meta) await this.writeJsonAtomic(this.metaPath(sessionId), meta);
    if (settings && Object.keys(settings).length > 0) {
      await this.writeJsonAtomic(this.settingsPath(sessionId), settings);
    }
    return true;
  }

  async writeJsonAtomic(file, data) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fsp.rename(tmp, file);
  }
}
