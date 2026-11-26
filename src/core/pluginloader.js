import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DEFAULT_ACCESS = 'public';
const VALID_ACCESS = new Set(['public', 'owner', 'admin']);
const DEFAULT_CATEGORY = 'General';

export function normalizeCommandName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/^\./, '');
}

// Keeps commands (with aliases) and message hooks collected from src/plugins.
export class PluginRegistry {
  constructor({ logger } = {}) {
    this.logger = logger || console;
    this.commands = [];
    this.hooks = [];
    this.byName = new Map();
  }

  registerCommand(cmd) {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) {
      this.logger.warn('plugin export is not a command object; skipped');
      return false;
    }
    const name = normalizeCommandName(cmd.name);
    if (!name || typeof cmd.run !== 'function') {
      this.logger.warn(`plugin command "${name || 'unnamed'}" is missing a name or run function; skipped`);
      return false;
    }
    const command = {
      name,
      aliases: Array.isArray(cmd.aliases) ? cmd.aliases.map(normalizeCommandName).filter(Boolean) : [],
      description: typeof cmd.description === 'string' ? cmd.description : '',
      category: typeof cmd.category === 'string' && cmd.category.length > 0 ? cmd.category : DEFAULT_CATEGORY,
      access: VALID_ACCESS.has(cmd.access) ? cmd.access : DEFAULT_ACCESS,
      groupOnly: cmd.groupOnly === true,
      dontList: cmd.dontList === true,
      sourceFile: cmd.__sourceFile || null,
      run: cmd.run
    };
    this.commands.push(command);
    const names = [command.name, ...command.aliases];
    for (const n of names) {
      if (this.byName.has(n)) {
        this.logger.warn(`plugin command name or alias "${n}" is registered more than once; first wins`);
        continue;
      }
      this.byName.set(n, command);
    }
    return true;
  }

  registerHook(hook) {
    if (!hook || typeof hook !== 'object' || hook.hook !== 'message' || typeof hook.run !== 'function') {
      this.logger.warn('plugin hook export is invalid; skipped');
      return false;
    }
    this.hooks.push(hook);
    return true;
  }

  find(name) {
    return this.byName.get(normalizeCommandName(name)) || null;
  }
}

export async function loadPlugins({ dir, logger } = {}) {
  const resolved = dir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins');
  const registry = new PluginRegistry({ logger });
  const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.js')).sort();
  for (const file of files) {
    const url = pathToFileURL(path.join(resolved, file)).href;
    try {
      const mod = await import(url);
      const exported = mod.default;
      const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
      const relative = path.relative(process.cwd(), path.join(resolved, file));
      for (const cmd of list) registry.registerCommand({ ...cmd, __sourceFile: relative });
      if (mod.hook) registry.registerHook(mod.hook);
    } catch (err) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`plugin "${file}" failed to load: ${err.message}`);
      }
    }
  }
  registry.commands.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return registry;
}
