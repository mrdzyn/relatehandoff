import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateHandoffPayload } from "../src/schema.mjs";

const VALID_SHA = "7f96e006e768524e2f4064493fb77cb85bf6fd1b";

function basePayload(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    handoffId: "RH-P1-SEC-1",
    taskId: "RH-P1",
    repository: "mrdzyn/relatehandoff-synthetic",
    branch: "phase-1/relate-handoff-mvp",
    sourceAgent: "codex",
    targetAgent: "claude",
    headSha: VALID_SHA,
    summary: "Synthetic security test payload",
    nextAction: "Validate negative cases",
    artifacts: ["README.md"],
    evidence: [
      {
        id: "EV-1",
        kind: "test",
        command: "npm run test:security",
        status: "PASS",
        headSha: VALID_SHA,
        observedAt: "2026-11-15T17:00:00Z",
      },
    ],
    ...overrides,
  };
}

test("Security negative: rejects malformed payloads and invalid Git SHAs", () => {
  const repoRoot = process.cwd();
  assert.throws(() => validateHandoffPayload(null, repoRoot), /JSON object/);
  assert.throws(() => validateHandoffPayload([], repoRoot), /JSON object/);
  assert.throws(
    () => validateHandoffPayload(basePayload({ headSha: "7f96e00" }), repoRoot),
    /40-character lowercase hex/
  );
  assert.throws(
    () => validateHandoffPayload(basePayload({ schemaVersion: "9.9.9" }), repoRoot),
    /Unsupported schemaVersion/
  );
  assert.throws(
    () => validateHandoffPayload(basePayload({ handoffId: "bad id with spaces" }), repoRoot),
    /handoffId/
  );
});

test("Security negative: rejects path traversal, absolute paths, null bytes, and symlink escapes", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-sec-"));
  const repoDir = path.join(tmpRoot, "repo");
  const outsideFile = path.join(tmpRoot, "outside-secret.txt");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(outsideFile, "do not read\n", "utf8");
  fs.symlinkSync(outsideFile, path.join(repoDir, "escape-link.txt"));

  try {
    for (const badPath of [
      "../outside-secret.txt",
      "a/../../outside-secret.txt",
      "/etc/passwd",
      "foo\0bar.txt",
      "escape-link.txt",
    ]) {
      assert.throws(
        () => validateHandoffPayload(basePayload({ artifacts: [badPath] }), repoDir),
        /escapes repository root|must be relative|null byte|outside repository root/i,
        `Expected rejection for path: ${badPath}`
      );
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("Security negative: rejects secret patterns and sensitive artifact filenames", () => {
  const repoRoot = process.cwd();
  const fakeGithubToken = ["ghp", "_1234567890abcdefghijklmnop"].join("");
  const fakePrivateKey = ["-----BEGIN ", "RSA PRIVATE KEY-----"].join("");

  assert.throws(
    () => validateHandoffPayload(basePayload({ summary: `Token: ${fakeGithubToken}` }), repoRoot),
    /secret\/token pattern/
  );
  assert.throws(
    () => validateHandoffPayload(basePayload({ nextAction: fakePrivateKey }), repoRoot),
    /secret\/token pattern/
  );
  assert.throws(
    () => validateHandoffPayload(basePayload({ artifacts: [".env"] }), repoRoot),
    /sensitive artifact filename/
  );
  assert.throws(
    () => validateHandoffPayload(basePayload({ artifacts: ["keys/id_ed25519"] }), repoRoot),
    /sensitive artifact filename/
  );
});
