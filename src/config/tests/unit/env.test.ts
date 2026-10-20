import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, parseEnv, safeSummary } from "../../src/config/env.js";

// 32 bytes of 0x01, base64-encoded. A test fixture, not a real key.
const GOOD_KEY = Buffer.alloc(32, 1).toString("base64");

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    OWNER_IDS: "254700000000",
    AUTH_ENCRYPTION_KEY: GOOD_KEY,
    ...overrides,
  };
}

function expectConfigError(env: Record<string, string | undefined>): ConfigError {
  try {
    parseEnv(env);
  } catch (error) {
    assert.ok(error instanceof ConfigError, "expected a ConfigError");
    return error;
  }
  assert.fail("expected parseEnv to throw");
}

test("valid minimal env parses with safe defaults", () => {
  const config = parseEnv(validEnv());
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.logLevel, "info");
  assert.equal(config.commandPrefix, ".");
  assert.equal(config.databaseUrl, undefined);
  assert.deepEqual([...config.ownerIds], ["254700000000@s.whatsapp.net"]);
  assert.equal(config.authEncryptionKey.length, 32);
});

test("config object is frozen", () => {
  const config = parseEnv(validEnv());
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.ownerIds));
});

test("missing OWNER_IDS is rejected", () => {
  const error = expectConfigError(validEnv({ OWNER_IDS: undefined }));
  assert.match(error.message, /OWNER_IDS is required/);
});

test("blank OWNER_IDS is rejected", () => {
  expectConfigError(validEnv({ OWNER_IDS: " , ," }));
});

test("malformed owner IDs are rejected", () => {
  for (const bad of ["not-a-number", "123", "2547; DROP TABLE users", "254700000000@evil.com", "+254700000000"]) {
    expectConfigError(validEnv({ OWNER_IDS: bad }));
  }
});

test("owner IDs are trimmed, lowercased, normalised and deduplicated", () => {
  const config = parseEnv(
    validEnv({ OWNER_IDS: " 254700000000 , 254700000000@S.WHATSAPP.NET, 99887766554433@lid " }),
  );
  assert.deepEqual([...config.ownerIds], [
    "254700000000@s.whatsapp.net",
    "99887766554433@lid",
  ]);
});

test("missing encryption key is rejected", () => {
  const error = expectConfigError(validEnv({ AUTH_ENCRYPTION_KEY: undefined }));
  assert.match(error.message, /AUTH_ENCRYPTION_KEY is required/);
});

test("wrong-length key is rejected and the key value is never echoed", () => {
  const shortKey = Buffer.alloc(16, 7).toString("base64");
  const error = expectConfigError(validEnv({ AUTH_ENCRYPTION_KEY: shortKey }));
  assert.match(error.message, /exactly 32 bytes/);
  assert.ok(!error.message.includes(shortKey));
});

test("non-base64 key is rejected and not echoed", () => {
  const junk = "this is not base64 !!!";
  const error = expectConfigError(validEnv({ AUTH_ENCRYPTION_KEY: junk }));
  assert.match(error.message, /valid base64/);
  assert.ok(!error.message.includes(junk));
});

test("production requires DATABASE_URL", () => {
  const error = expectConfigError(validEnv({ NODE_ENV: "production" }));
  assert.match(error.message, /DATABASE_URL is required/);
});

test("production accepts a postgres URL", () => {
  const url = "postgres://user:pw@host:5432/db";
  const config = parseEnv(validEnv({ NODE_ENV: "production", DATABASE_URL: url }));
  assert.equal(config.databaseUrl, url);
});

test("non-postgres DATABASE_URL is rejected and its credentials are not echoed", () => {
  const url = "mysql://admin:supersecretpw@host/db";
  const error = expectConfigError(validEnv({ DATABASE_URL: url }));
  assert.match(error.message, /postgres/);
  assert.ok(!error.message.includes("supersecretpw"));
});

test("invalid NODE_ENV and LOG_LEVEL are rejected", () => {
  const error = expectConfigError(validEnv({ NODE_ENV: "staging", LOG_LEVEL: "verbose" }));
  assert.match(error.message, /NODE_ENV/);
  assert.match(error.message, /LOG_LEVEL/);
});

test("command prefix must be one non-alphanumeric, non-space character", () => {
  assert.equal(parseEnv(validEnv({ COMMAND_PREFIX: "!" })).commandPrefix, "!");
  for (const bad of ["ab", "a", " ", "..", "1"]) {
    expectConfigError(validEnv({ COMMAND_PREFIX: bad }));
  }
});

test("all problems are reported together", () => {
  const error = expectConfigError({});
  assert.ok(error.problems.length >= 2);
});

test("safeSummary contains no secrets", () => {
  const config = parseEnv(
    validEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://user:pw@host/db" }),
  );
  const text = JSON.stringify(safeSummary(config));
  assert.ok(!text.includes(GOOD_KEY));
  assert.ok(!text.includes("pw@host"));
  assert.ok(!text.includes("254700000000"));
  assert.match(text, /"ownerCount":1/);
});
