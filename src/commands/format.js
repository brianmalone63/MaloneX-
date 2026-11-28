// Reply formatting. Clean and professional panels, no emojis. WhatsApp
// markdown (bold, monospace) is used sparingly.

export function panel(title, rows) {
  const lines = [`*MaloneX* - ${title}`];
  for (const row of rows) {
    if (typeof row === 'string') {
      lines.push(row);
    } else {
      lines.push(`${row.label}: ${row.value}`);
    }
  }
  return lines.join('\n');
}

export function errorPanel(message) {
  return `*MaloneX* - Problem\n${message}`;
}

// HTML escaping for web pages. Brand text and any user-derived value that
// reaches a page goes through this.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function commandReference(registry) {
  const groups = new Map();
  for (const plugin of registry.all()) {
    if (!groups.has(plugin.category)) groups.set(plugin.category, []);
    groups.get(plugin.category).push(plugin);
  }
  const lines = ['*MaloneX* - Commands'];
  for (const [category, plugins] of groups) {
    lines.push('');
    lines.push(`*${category}*`);
    for (const plugin of plugins) {
      const aliases = plugin.aliases?.length ? ` (or ${plugin.aliases.join(', ')})` : '';
      const access = plugin.access === 'owner' ? ' - owner only' : '';
      lines.push(`- ${plugin.name}${aliases}: ${plugin.description}${access}`);
    }
  }
  return lines.join('\n');
}
