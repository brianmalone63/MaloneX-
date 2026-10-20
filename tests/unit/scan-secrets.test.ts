import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function scan(dir: string) {
  return spawnSync("sh", ["scripts/scan-secrets.sh", dir], { encoding: "utf8" });
}

test("scanner passes a clean directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-clean-"));
  try {
    writeFileSync(join(dir, "ok.txt"), "nothing secret here\n");
    const result = scan(dir);
    assert.equal(result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scanner fails on a token-shaped string and does not print it", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-dirty-"));
  try {
    // Built at runtime so this test file itself is not flagged by the scanner.
    const fakeToken = "ghp_" + "a".repeat(36);
    writeFileSync(join(dir, "leak.txt"), `token=${fakeToken}\n`);
    const result = scan(dir);
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes(fakeToken));
    assert.match(result.stdout, /leak\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scanner fails on a private key header", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-key-"));
  try {
    const header = "-----BEGIN " + "OPENSSH PRIVATE KEY-----";
    writeFileSync(join(dir, "id_test"), `${header}\nabc\n`);
    assert.equal(scan(dir).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
