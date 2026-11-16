import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  callRelateMcpBatch,
  resolveRelateCli,
  resumeTaskViaReadOnlyMcp,
} from "../src/mcp_client.mjs";
import { recordHandoff } from "../src/recorder.mjs";

function initTempGitRepo(rootDir) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  git(["init"]);
  git(["config", "user.name", "RelateHandoff Test"]);
  git(["config", "user.email", "test@example.invalid"]);
  fs.writeFileSync(path.join(rootDir, "README.md"), "# Synthetic Repo\n", "utf8");
  git(["add", "README.md"]);
  git(["commit", "-m", "chore: initial synthetic commit (SHA-A)"]);
  const shaA = git(["rev-parse", "HEAD"]);
  return { git, shaA };
}

test("RH-P1 E2E: schema-validated write, real read-only MCP resume, dirty/SHA-B stale detection, and write refusal", () => {
  // Fail closed if no runnable relate CLI is available — skipped MCP tests never pass.
  const cli = resolveRelateCli();
  assert.ok(cli.bin, "Expected runnable relate CLI");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-e2e-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  const inputJson = path.join(tmpRoot, "handoff.json");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    const { git, shaA } = initTempGitRepo(repoDir);

    const payloadA = {
      schemaVersion: "1.0.0",
      handoffId: "RH-P1-SYNTH-1",
      taskId: "RH-P1",
      repository: "mrdzyn/relatehandoff-synthetic",
      branch: "main",
      sourceAgent: "codex-writer",
      targetAgent: "claude-reviewer",
      headSha: shaA,
      summary: "Implemented synthetic handoff recorder at SHA-A",
      nextAction: "Verify freshness at exact SHA-A via read-only MCP",
      decisions: [{ id: "DEC-1", summary: "Use directory store with read-only stdio MCP" }],
      artifacts: ["README.md"],
      evidence: [
        {
          id: "EV-1",
          kind: "unit-test",
          command: "npm run test:all",
          status: "PASS",
          headSha: shaA,
          observedAt: "2026-11-15T17:00:00Z",
        },
      ],
      createdAt: "2026-11-15T17:00:00Z",
    };
    fs.writeFileSync(inputJson, JSON.stringify(payloadA, null, 2), "utf8");

    // 1. Record via CLI subprocess (separate writer process)
    const recRes = spawnSync(
      process.execPath,
      ["src/cli.mjs", "record", "--store", storeDir, "--repo", repoDir, "--input", inputJson],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(recRes.status, 0, `CLI record failed: ${recRes.stderr}`);

    // 2. Resume via CLI subprocess (uses real relate serve --mcp stdio --read-only)
    const res1 = spawnSync(
      process.execPath,
      ["src/cli.mjs", "resume", "--store", storeDir, "--repo", repoDir, "--task", "RH-P1"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(res1.status, 0, `CLI resume failed: ${res1.stderr}`);
    const parsed1 = JSON.parse(res1.stdout);

    assert.deepEqual(parsed1.tools, ["read_cypher", "get_schema"]);
    assert.equal(parsed1.handoff.handoffId, "RH-P1-SYNTH-1");
    assert.equal(parsed1.handoff.headSha, shaA);
    assert.equal(parsed1.handoff.sourceAgent, "codex-writer");
    assert.equal(parsed1.handoff.targetAgent, "claude-reviewer");
    assert.deepEqual(parsed1.artifacts, ["README.md"]);
    assert.equal(parsed1.decisions.length, 1);
    assert.equal(parsed1.evidence.length, 1);
    assert.equal(parsed1.freshness.status, "VERIFIED");
    assert.equal(parsed1.freshness.remoteStatus, "UNVERIFIED");

    // Deterministic re-run check
    const parsed2 = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.deepEqual(parsed2, parsed1);

    // 3. Dirty worktree at SHA-A must NOT report VERIFIED
    fs.appendFileSync(path.join(repoDir, "README.md"), "uncommitted edit\n", "utf8");
    const dirtyRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(dirtyRes.freshness.status, "STALE");
    assert.ok(dirtyRes.freshness.reasons.includes("DIRTY_WORKTREE"));

    // 4. Commit SHA-B -> clean worktree at SHA-B, evidence at SHA-A must report STALE
    git(["add", "README.md"]);
    git(["commit", "-m", "feat: advance to SHA-B"]);
    const shaB = git(["rev-parse", "HEAD"]);
    assert.notEqual(shaB, shaA);

    const staleRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(staleRes.freshness.status, "STALE");
    assert.equal(staleRes.freshness.handoffSha, shaA);
    assert.equal(staleRes.freshness.currentHeadSha, shaB);
    assert.ok(staleRes.freshness.reasons.some((r) => r.startsWith("HEAD_SHA_MISMATCH")));
    assert.ok(staleRes.freshness.reasons.some((r) => r.startsWith("EVIDENCE_SHA_MISMATCH")));

    // 5. Missing evidence at SHA-B must report UNVERIFIED
    const inputJson2 = path.join(tmpRoot, "handoff-2.json");
    fs.writeFileSync(
      inputJson2,
      JSON.stringify({
        ...payloadA,
        handoffId: "RH-P1-SYNTH-2",
        headSha: shaB,
        evidence: [],
        createdAt: "2026-11-15T17:05:00Z",
      }),
      "utf8"
    );
    const recRes2 = spawnSync(
      process.execPath,
      ["src/cli.mjs", "record", "--store", storeDir, "--repo", repoDir, "--input", inputJson2],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(recRes2.status, 0, `CLI record 2 failed: ${recRes2.stderr}`);
    const noEvRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(noEvRes.handoff.handoffId, "RH-P1-SYNTH-2");
    assert.equal(noEvRes.freshness.status, "UNVERIFIED");
    assert.ok(noEvRes.freshness.reasons.includes("MISSING_TEST_EVIDENCE"));

    // 6. Failed evidence at SHA-B must report BLOCKED
    const inputJson3 = path.join(tmpRoot, "handoff-3.json");
    fs.writeFileSync(
      inputJson3,
      JSON.stringify({
        ...payloadA,
        handoffId: "RH-P1-SYNTH-3",
        headSha: shaB,
        evidence: [
          {
            id: "EV-FAIL-1",
            kind: "unit-test",
            command: "npm test",
            status: "FAIL",
            headSha: shaB,
            observedAt: "2026-11-15T17:10:00Z",
          },
        ],
        createdAt: "2026-11-15T17:10:00Z",
      }),
      "utf8"
    );
    const recRes3 = spawnSync(
      process.execPath,
      ["src/cli.mjs", "record", "--store", storeDir, "--repo", repoDir, "--input", inputJson3],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(recRes3.status, 0, `CLI record 3 failed: ${recRes3.stderr}`);
    const failedEvRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(failedEvRes.handoff.handoffId, "RH-P1-SYNTH-3");
    assert.equal(failedEvRes.freshness.status, "BLOCKED");
    assert.ok(failedEvRes.freshness.reasons.includes("EVIDENCE_FAILED:EV-FAIL-1"));

    // 7. Read-only MCP refuses writes
    const mcpWriteAttempt = callRelateMcpBatch({
      storeDir,
      requests: [
        {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "read_cypher", arguments: { statement: "CREATE (:Illegal {x: 1})", parameters: {} } },
        },
        {
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: { name: "write_cypher", arguments: { statement: "CREATE (:Illegal {x: 1})", parameters: {} } },
        },
      ],
    });
    assert.equal(mcpWriteAttempt[0].result.isError, true);
    assert.match(mcpWriteAttempt[0].result.content[0].text, /Only MATCH queries are allowed/);
    assert.equal(mcpWriteAttempt[1].result.isError, true);
    assert.match(mcpWriteAttempt[1].result.content[0].text, /unknown tool 'write_cypher'/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P1 E2E: committed examples/example-store is portable and readable via read-only MCP", () => {
  const exampleStore = path.resolve(process.cwd(), "examples/example-store");
  assert.ok(fs.existsSync(path.join(exampleStore, "manifest.json")), "Committed example-store missing");
  const res = resumeTaskViaReadOnlyMcp({
    storeDir: exampleStore,
    repoRoot: process.cwd(),
    taskId: "RH-P1",
  });
  assert.deepEqual(res.tools, ["read_cypher", "get_schema"]);
  assert.equal(res.handoff.handoffId, "RH-P1-EXAMPLE-1");
  assert.equal(res.handoff.headSha, "1111111111111111111111111111111111111111");
  assert.equal(res.freshness.status, "STALE");
});
