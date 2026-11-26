// All bot replies are rendered here: panels, notices, usage and error blocks.
// No emojis anywhere in these outputs - clean, professional, premium tone.

const DIVIDER = '──────────────────────────';

export function heading(text) {
  return `*${String(text).toUpperCase()}*`;
}

export function panel(title, rows, footer = null) {
  const lines = [heading(title), DIVIDER];
  for (const row of rows) {
    if (typeof row === 'string') lines.push(row);
    else if (row && typeof row === 'object') lines.push(`${row.label} : ${row.value}`);
  }
  lines.push(DIVIDER);
  if (footer) lines.push(String(footer));
  return lines.join('\n');
}

export function notice(text) {
  return [heading('Notice'), DIVIDER, String(text), DIVIDER].join('\n');
}

export function usage(text) {
  return [heading('Usage'), DIVIDER, String(text), DIVIDER].join('\n');
}

export function error(text) {
  return [heading('Error'), DIVIDER, String(text), DIVIDER].join('\n');
}

export function onOff(value) {
  return value ? 'ON' : 'OFF';
}

// Short caption attached to media delivered by the .vv command.
export function caption(text) {
  return `*View-once retrieved* — ${String(text)}`;
}
