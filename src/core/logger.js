// Structured console logger. Rules enforced here:
// - only string / number arguments are printed; objects are dropped except
//   for a contained error's name and message, so a stray object with message
//   contents or session values can never reach the console through this
//   module;
// - below the configured level nothing is printed at all (Baileys logs
//   credentials at trace level; the default level hides them).
const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

// Pino-style calls (object first, message second) are common: Baileys logs
// like logger.error({ err }, 'error in validating connection'). Objects are
// still never printed - only an error's name and message are extracted, which
// keeps chat contents and session values out of the console while keeping
// the one detail that matters for diagnosis. The message reads first; the
// error detail is appended after it.
function splitArgs(args) {
  const parts = [];
  let errText = '';
  const appendErr = (err) => {
    errText = errText ? `${errText} (${err.name}: ${err.message})` : `(${err.name}: ${err.message})`;
  };
  for (const arg of args) {
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      parts.push(String(arg));
    } else if (arg instanceof Error) {
      appendErr(arg);
    } else if (arg && typeof arg === 'object') {
      const err = arg.err ?? arg.error;
      if (err instanceof Error) appendErr(err);
      // Other objects are dropped: raw payloads never reach the console.
    }
  }
  return [...parts, errText].filter((part) => part.length > 0).join(' ');
}

export function createLogger(scope, level = 'info', sink = console) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (thresholdLevel) => (...args) => {
    if (LEVELS[thresholdLevel] > threshold) return;
    const line = splitArgs(args);
    if (line.length === 0) return;
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
