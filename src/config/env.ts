/**
 * Fail-fast configuration loader.
 *
 * Rules:
 *  - Every value comes from environment variables. Nothing is hardcoded.
 *  - Invalid config throws ConfigError at startup, before the bot connects.
 *  - Error messages name the variable and the rule, NEVER the value,
 *    so secrets cannot leak into logs.
 */

export type NodeEnv = "development" | "test" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  /** Normalised owner IDs, e.g. "254700000000@s.whatsapp.net". Set via env only. */
  readonly ownerIds: readonly string[];
  /** 32-byte key for encrypting stored session credentials. Never log this. */
  readonly authEncryptionKey: Buffer;
  readonly databaseUrl: string | undefined;
  readonly commandPrefix: string;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

type Env = Record<string, string | undefined>;

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

// Digits only (country code included), optionally followed by a WhatsApp server suffix.
const OWNER_ID_PATTERN = /^(\d{5,20})(?:@(s\.whatsapp\.net|lid))?$/;
// Accept only standard base64 characters; Buffer.from would silently skip junk.
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const DB_URL_PATTERN = /^postgres(?:ql)?:\/\/\S+$/;
const PREFIX_PATTERN = /^[^\sA-Za-z0-9]$/u;

function parseOwnerIds(raw: string | undefined, problems: string[]): string[] {
  if (raw === undefined || raw.trim() === "") {
    problems.push("OWNER_IDS is required (comma-separated WhatsApp IDs)");
    return [];
  }

  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    const candidate = part.trim().toLowerCase();
    if (candidate === "") continue;
    const match = OWNER_ID_PATTERN.exec(candidate);
    if (!match) {
      problems.push("OWNER_IDS contains an entry that is not a valid WhatsApp ID");
      return [];
    }
    ids.add(`${match[1]}@${match[2] ?? "s.whatsapp.net"}`);
  }

  if (ids.size === 0) {
    problems.push("OWNER_IDS must contain at least one ID");
  }
  return [...ids];
}

function parseEncryptionKey(raw: string | undefined, problems: string[]): Buffer {
  const empty = Buffer.alloc(0);
  if (raw === undefined || raw.trim() === "") {
    problems.push("AUTH_ENCRYPTION_KEY is required (32 random bytes, base64)");
    return empty;
  }
  const value = raw.trim();
  if (!BASE64_PATTERN.test(value)) {
    problems.push("AUTH_ENCRYPTION_KEY must be valid base64");
    return empty;
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    problems.push("AUTH_ENCRYPTION_KEY must decode to exactly 32 bytes");
    return empty;
  }
  return key;
}

function parseEnumValue<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  problems: string[],
): T {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  const found = allowed.find((item) => item === value);
  if (found === undefined) {
    problems.push(`${name} must be one of: ${allowed.join(", ")}`);
    return fallback;
  }
  return found;
}

export function parseEnv(env: Env): Config {
  const problems: string[] = [];

  const nodeEnv = parseEnumValue("NODE_ENV", env["NODE_ENV"], NODE_ENVS, "development", problems);
  const logLevel = parseEnumValue("LOG_LEVEL", env["LOG_LEVEL"], LOG_LEVELS, "info", problems);
  const ownerIds = parseOwnerIds(env["OWNER_IDS"], problems);
  const authEncryptionKey = parseEncryptionKey(env["AUTH_ENCRYPTION_KEY"], problems);

  let databaseUrl: string | undefined;
  const rawDb = env["DATABASE_URL"]?.trim();
  if (rawDb === undefined || rawDb === "") {
    if (nodeEnv === "production") {
      problems.push("DATABASE_URL is required when NODE_ENV=production");
    }
  } else if (!DB_URL_PATTERN.test(rawDb)) {
    problems.push("DATABASE_URL must be a postgres:// or postgresql:// URL");
  } else {
    databaseUrl = rawDb;
  }

  const rawPrefix = env["COMMAND_PREFIX"];
  let commandPrefix = ".";
  if (rawPrefix !== undefined && rawPrefix !== "") {
    if (PREFIX_PATTERN.test(rawPrefix)) {
      commandPrefix = rawPrefix;
    } else {
      problems.push("COMMAND_PREFIX must be a single non-alphanumeric, non-space character");
    }
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return Object.freeze({
    nodeEnv,
    logLevel,
    ownerIds: Object.freeze(ownerIds),
    authEncryptionKey,
    databaseUrl,
    commandPrefix,
  });
}

export function loadConfig(): Config {
  return parseEnv(process.env);
}

/** Safe-to-log view of the config. Contains no secrets. */
export function safeSummary(config: Config): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    ownerCount: config.ownerIds.length,
    databaseConfigured: config.databaseUrl !== undefined,
    commandPrefix: config.commandPrefix,
  };
  }
