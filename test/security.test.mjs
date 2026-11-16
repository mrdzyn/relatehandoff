import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_DETAIL_ROWS, validateHandoffPayload } from "../src/schema.mjs";

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

test("Security negative: rejects malformed payloads, invalid Git SHAs, and duplicate IDs", () => {
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
  assert.throws(
    () =>
      validateHandoffPayload(
        basePayload({
          decisions: [
            { id: "DEC-1", summary: "First" },
            { id: "DEC-1", summary: "Duplicate" },
          ],
        }),
        repoRoot
      ),
    /Duplicate decision id/
  );
  assert.throws(
    () =>
      validateHandoffPayload(
        basePayload({
          evidence: [
            {
              id: "EV-DUP",
              kind: "test",
              command: "npm test",
              status: "PASS",
              headSha: VALID_SHA,
              observedAt: "2026-11-15T17:00:00Z",
            },
            {
              id: "EV-DUP",
              kind: "test",
              command: "npm test",
              status: "FAIL",
              headSha: VALID_SHA,
              observedAt: "2026-11-15T17:01:00Z",
            },
          ],
        }),
        repoRoot
      ),
    /Duplicate evidence id/
  );
});

test("Security negative: rejects path traversal, Windows drive/UNC, symlink and symlink-parent escapes", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-sec-"));
  const repoDir = path.join(tmpRoot, "repo");
  const outsideDir = path.join(tmpRoot, "outside-dir");
  const outsideFile = path.join(tmpRoot, "outside-secret.txt");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(outsideFile, "do not read\n", "utf8");
  fs.symlinkSync(outsideFile, path.join(repoDir, "escape-link.txt"));
  fs.symlinkSync(outsideDir, path.join(repoDir, "escape-dir"));

  try {
    for (const badPath of [
      "../outside-secret.txt",
      "a/../../outside-secret.txt",
      "/etc/passwd",
      "C:\\Windows\\System32\\drivers\\etc\\hosts",
      "D:/secret.txt",
      "\\\\server\\share\\secret.txt",
      "//server/share/secret.txt",
      "foo\0bar.txt",
      "escape-link.txt",
      "escape-dir/nonexistent-leaf.txt",
    ]) {
      assert.throws(
        () => validateHandoffPayload(basePayload({ artifacts: [badPath] }), repoDir),
        /escapes repository root|must be relative|drive\/UNC|null byte|outside repository root/i,
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
  for (const sensitivePath of [
    ".env",
    "keys/id_ed25519",
    ".aws/credentials",
    ".npmrc",
    "config/secrets.json",
  ]) {
    assert.throws(
      () => validateHandoffPayload(basePayload({ artifacts: [sensitivePath] }), repoRoot),
      /sensitive artifact filename/,
      `Expected rejection for sensitive artifact: ${sensitivePath}`
    );
  }
});

test("Security negative: rejects client-supplied runner/trust evidence fields", () => {
  const repoRoot = process.cwd();
  const baseEv = basePayload().evidence[0];

  for (const overrides of [
    { executionMode: "TRUSTED_LOCAL_RUNNER" },
    { executionMode: "RUNNER_RECORDED_UNSIGNED" },
    { validationProfile: "node-test-suite" },
    { exitCode: 0 },
    { attestationSha256: "a".repeat(64) },
  ]) {
    assert.throws(
      () => validateHandoffPayload(basePayload({ evidence: [{ ...baseEv, ...overrides }] }), repoRoot),
      /Security rejection/
    );
  }
});

test("Security bounds: validateHandoffPayload allows 100 detail rows and rejects 101", () => {
  const repoRoot = process.cwd();
  assert.equal(MAX_DETAIL_ROWS, 100);

  const okDecisions = Array.from({ length: 100 }, (_, i) => ({ id: `D-${i}`, summary: "ok" }));
  const ok = validateHandoffPayload(basePayload({ decisions: okDecisions }), repoRoot);
  assert.equal(ok.decisions.length, 100);

  const tooManyDecisions = Array.from({ length: 101 }, (_, i) => ({ id: `D-${i}`, summary: "no" }));
  assert.throws(
    () => validateHandoffPayload(basePayload({ decisions: tooManyDecisions }), repoRoot),
    /BoundExceededError/
  );

  const tooManyArtifacts = Array.from({ length: 101 }, () => "README.md");
  assert.throws(
    () => validateHandoffPayload(basePayload({ artifacts: tooManyArtifacts }), repoRoot),
    /BoundExceededError/
  );

  const baseEv = basePayload().evidence[0];
  const tooManyEvidence = Array.from({ length: 101 }, (_, i) => ({ ...baseEv, id: `EV-${i}` }));
  assert.throws(
    () => validateHandoffPayload(basePayload({ evidence: tooManyEvidence }), repoRoot),
    /BoundExceededError/
  );
});
