// Plugin registry. One file per command in src/plugins, each exporting:
//   { name, aliases?, description, category, access, run(ctx), hook?, runHook? }
// Duplicate names or aliases throw at load time, so conflicts surface at
// boot rather than at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function createRegistry() {
  const commands = new Map();
  const aliases = new Map();
  const hooks = [];

  function assertFree(plugin) {
    if (commands.has(plugin.name)) {
      throw new Error(`Duplicate command name "${plugin.name}".`);
    }
    for (const alias of plugin.aliases || []) {
      if (aliases.has(alias) || commands.has(alias)) {
        throw new Error(`Duplicate alias "${alias}" from command "${plugin.name}".`);
      }
    }
  }

  function validate(plugin, source) {
    const where = source || plugin.name;
    if (typeof plugin.name !== 'string' || !plugin.name) throw new Error(`${where}: missing "name".`);
    if (!/^[a-z0-9_-]+$/.test(plugin.name)) throw new Error(`${where}: "name" must be lowercase letters, digits, "-" or "_".`);
    if (typeof plugin.run !== 'function') throw new Error(`${where}: missing "run(ctx)".`);
    if (typeof plugin.description !== 'string' || !plugin.description) throw new Error(`${where}: missing "description".`);
    if (typeof plugin.category !== 'string' || !plugin.category) throw new Error(`${where}: missing "category".`);
    if (plugin.access !== 'owner' && plugin.access !== 'public') throw new Error(`${where}: "access" must be "owner" or "public".`);
  }

  return {
    register(plugin, source) {
      validate(plugin, source);
      assertFree(plugin);
      commands.set(plugin.name, plugin);
      for (const alias of plugin.aliases || []) aliases.set(alias, plugin.name);
      if (plugin.hook) {
        if (typeof plugin.runHook !== 'function') throw new Error(`${source || plugin.name}: hook declared but no "runHook(ctx)".`);
        hooks.push(plugin);
      }
      return plugin;
    },

    resolve(name) {
      if (commands.has(name)) return commands.get(name);
      const alias = aliases.get(name);
      return alias ? commands.get(alias) : null;
    },

    all() {
      return [...commands.values()];
    },

    get hookPlugins() {
      return hooks;
    },

    get size() {
      return commands.size;
    }
  };
}

export async function loadPlugins({ dir, registry, logger } = {}) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js').sort();
  } catch (err) {
    if (logger) logger.warn(`plugin directory "${dir}" unreadable: ${err.message}`);
    return registry;
  }
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const mod = await import(pathToFileURL(full).href);
      const plugin = mod.default || mod;
      registry.register(plugin, file);
      if (logger) logger.debug(`plugin loaded: ${plugin.name} (${file})`);
    } catch (err) {
      // A broken plugin must not stop the bot; the conflict is loud.
      if (logger) logger.error(`plugin "${file}" failed to load: ${err.message}`);
      throw err;
    }
  }
  return registry;
}
