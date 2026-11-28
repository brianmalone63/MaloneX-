// Structured console logger. Rules enforced here:
// - only string / number arguments are printed, objects are replaced by a
//   placeholder, so a stray object with message contents or session values
//   can never reach the console through this module;
// - below the configured level nothing is printed at all (Baileys logs
//   credentials at trace level; the default level hides them).
const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

function stringify(arg) {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  return '[object]';
}

export function createLogger(scope, level = 'info', sink = console) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (thresholdLevel) => (...args) => {
    if (LEVELS[thresholdLevel] > threshold) return;
    const line = args.map(stringify).filter((part) => part.length > 0).join(' ');
    const stamp = new Date().toISOString();
    const method = thresholdLevel === 'error' || thresholdLevel === 'fatal' ? 'error' : thresholdLevel === 'warn' ? 'warn' : 'log';
    sink[method](`${stamp} [${scope}] ${line}`);
  };
  return {
    level,
    child(subScope) {
      return createLogger(`${scope}:${subScope}`, level, sink);
    },
    fatal: write('fatal'),
    error: write('error'),
    warn: write('warn'),
    info: write('info'),
    debug: write('debug'),
    trace: write('trace')
  };
}
