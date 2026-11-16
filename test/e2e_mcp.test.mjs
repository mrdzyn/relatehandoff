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

function initTempGitRepo(rootDir, repoId = "mrdzyn/relatehandoff-synthetic") {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  git(["init"]);
  git(["config", "user.name", "RelateHandoff Test"]);
  git(["config", "user.email", "test@example.invalid"]);
  git(["config", "relatehandoff.repository", repoId]);
  fs.writeFileSync(path.join(rootDir, "README.md"), "# Synthetic Repo\n", "utf8");
  fs.writeFileSync(
    path.join(rootDir, "smoke.test.mjs"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("ok", () => assert.equal(1, 1));\n`,
    "utf8"
  );
  git(["add", "README.md", "smoke.test.mjs"]);
  git(["commit", "-m", "chore: initial synthetic commit (SHA-A)"]);
  const shaA = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return { git, shaA, branch };
}

function runRecordCli({ storeDir, repoDir, tmpRoot, name, payload, verifyProfile, expectSuccess = true }) {
  const inputJson = path.join(tmpRoot, `${name}.json`);
  fs.writeFileSync(inputJson, JSON.stringify(payload, null, 2), "utf8");
  const args = ["src/cli.mjs", "record", "--store", storeDir, "--repo", repoDir, "--input", inputJson];
  if (verifyProfile) {
    args.push("--verify", verifyProfile);
  }
  const res = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });
  if (expectSuccess) {
    assert.equal(res.status, 0, `CLI record (${name}) failed: ${res.stderr}`);
  }
  return res;
}

test("RH-P1 E2E (B4): trusted local execution yields VERIFIED; self-asserted PASS yields UNVERIFIED; dirty/SHA-B/missing/failed/write-refusal", () => {
  const cli = resolveRelateCli();
  assert.ok(cli.bin, "Expected runnable relate CLI");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-e2e-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    const { git, shaA, branch } = initTempGitRepo(repoDir);

    const basePayload = {
      schemaVersion: "1.0.0",
      handoffId: "RH-P1-SELF-1",
      taskId: "RH-P1",
      repository: "mrdzyn/relatehandoff-synthetic",
      branch,
      sourceAgent: "codex-writer",
      targetAgent: "claude-reviewer",
      headSha: shaA,
      summary: "Self-asserted PASS without trusted runner execution",
      nextAction: "Verify freshness and execution authenticity",
      decisions: [{ id: "DEC-1", summary: "Use directory store with read-only stdio MCP" }],
      artifacts: ["README.md"],
      evidence: [
        {
          id: "EV-SELF-1",
          kind: "unit-test",
          command: "npm test (never executed)",
          status: "PASS",
          headSha: shaA,
          observedAt: "2026-11-15T17:00:00Z",
        },
      ],
      createdAt: "2026-11-15T17:00:00Z",
    };

    // B4: Self-asserted PASS at exact SHA-A with clean tree must report UNVERIFIED!
    runRecordCli({ storeDir, repoDir, tmpRoot, name: "self-asserted", payload: basePayload });
    const selfRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(selfRes.freshness.metadataFreshness, "CURRENT");
    assert.equal(selfRes.freshness.executionAuthenticity, "SELF_ASSERTED");
    assert.equal(selfRes.freshness.status, "UNVERIFIED");
    assert.ok(
      selfRes.freshness.reasons.some((r) => r.startsWith("UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE"))
    );

    // B4: Trusted local validation execution (--verify node-test-suite) yields VERIFIED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "trusted-exec",
      verifyProfile: "node-test-suite",
      payload: {
        ...basePayload,
        handoffId: "RH-P1-TRUSTED-1",
        summary: "Executed trusted local node --test suite at SHA-A",
        evidence: [],
        createdAt: "2026-11-15T17:01:00Z",
      },
    });

    const res1 = spawnSync(
      process.execPath,
      ["src/cli.mjs", "resume", "--store", storeDir, "--repo", repoDir, "--task", "RH-P1"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(res1.status, 0, `CLI resume failed: ${res1.stderr}`);
    const parsed1 = JSON.parse(res1.stdout);

    assert.deepEqual(parsed1.tools, ["read_cypher", "get_schema"]);
    assert.equal(parsed1.handoff.handoffId, "RH-P1-TRUSTED-1");
    assert.equal(parsed1.freshness.metadataFreshness, "CURRENT");
    assert.equal(parsed1.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.equal(parsed1.freshness.status, "VERIFIED");
    assert.equal(parsed1.freshness.remoteStatus, "UNVERIFIED");

    // Deterministic re-run
    const parsed2 = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.deepEqual(parsed2, parsed1);

    // Dirty worktree at SHA-A -> STALE
    fs.appendFileSync(path.join(repoDir, "README.md"), "uncommitted edit\n", "utf8");
    const dirtyRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(dirtyRes.freshness.status, "STALE");
    assert.ok(dirtyRes.freshness.reasons.includes("DIRTY_WORKTREE"));

    // Commit SHA-B -> STALE
    git(["add", "README.md"]);
    git(["commit", "-m", "feat: advance to SHA-B"]);
    const shaB = git(["rev-parse", "HEAD"]);
    const staleRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(staleRes.freshness.status, "STALE");
    assert.ok(staleRes.freshness.reasons.some((r) => r.startsWith("HEAD_SHA_MISMATCH")));

    // Missing evidence at SHA-B -> UNVERIFIED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "missing-ev",
      payload: {
        ...basePayload,
        handoffId: "RH-P1-SYNTH-2",
        headSha: shaB,
        evidence: [],
        createdAt: "2026-11-15T17:05:00Z",
      },
    });
    const noEvRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(noEvRes.freshness.status, "UNVERIFIED");
    assert.ok(noEvRes.freshness.reasons.includes("MISSING_TEST_EVIDENCE"));

    // Failed evidence at SHA-B -> BLOCKED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "failed-ev",
      payload: {
        ...basePayload,
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
      },
    });
    const failedEvRes = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(failedEvRes.freshness.status, "BLOCKED");
    assert.ok(failedEvRes.freshness.reasons.includes("EVIDENCE_FAILED:EV-FAIL-1"));

    // Read-only MCP refuses writes
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

test("RH-P1 regression (B2 & B3): repo-scoped immutable provenance, idempotent replay, conflict fail-closed, and cross-repo isolation", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-b2b3-"));
  const repoADir = path.join(tmpRoot, "repo-a");
  const repoBDir = path.join(tmpRoot, "repo-b");
  const repoCDir = path.join(tmpRoot, "repo-c");
  const storeDir = path.join(tmpRoot, "shared-store");
  fs.mkdirSync(repoADir, { recursive: true });
  fs.mkdirSync(repoBDir, { recursive: true });
  fs.mkdirSync(repoCDir, { recursive: true });

  try {
    const repoA = initTempGitRepo(repoADir, "mrdzyn/repo-a");
    const repoB = initTempGitRepo(repoBDir, "mrdzyn/repo-b");
    initTempGitRepo(repoCDir, "mrdzyn/repo-c");

    const payloadA1 = {
      schemaVersion: "1.0.0",
      handoffId: "SHARED-HANDOFF-1",
      taskId: "RH-P1",
      repository: "mrdzyn/repo-a",
      branch: repoA.branch,
      sourceAgent: "codex",
      targetAgent: "claude",
      headSha: repoA.shaA,
      summary: "Repo A handoff 1",
      nextAction: "Review A1",
      decisions: [{ id: "DEC-1", summary: "Repo A decision" }],
      artifacts: ["README.md"],
      evidence: [
        {
          id: "ev-1",
          kind: "unit-test",
          command: "npm test",
          status: "PASS",
          headSha: repoA.shaA,
          observedAt: "2026-11-15T17:00:00Z",
        },
      ],
      createdAt: "2026-11-15T17:00:00Z",
    };

    // 1. Record Repo A handoff
    runRecordCli({ storeDir, repoDir: repoADir, tmpRoot, name: "a1", payload: payloadA1 });

    // 2. B2: Idempotent exact rerun succeeds without duplicating TARGETS_HEAD
    const replayRes = runRecordCli({ storeDir, repoDir: repoADir, tmpRoot, name: "a1-replay", payload: payloadA1 });
    assert.equal(JSON.parse(replayRes.stdout).recorded.idempotentReplay, true);

    // 3. B2: Conflicting duplicate handoffId (same repo/task, different summary) fails closed
    const conflictRes = runRecordCli({
      storeDir,
      repoDir: repoADir,
      tmpRoot,
      name: "a1-conflict",
      payload: { ...payloadA1, summary: "Mutated summary!" },
      expectSuccess: false,
    });
    assert.notEqual(conflictRes.status, 0);
    assert.match(conflictRes.stderr, /HandoffConflictError/);

    // 4. B2: Second handoff in Repo A sharing implicit/explicit ev-1 with FAIL must NOT mutate A1's ev-1
    runRecordCli({
      storeDir,
      repoDir: repoADir,
      tmpRoot,
      name: "a2",
      payload: {
        ...payloadA1,
        handoffId: "SHARED-HANDOFF-2",
        summary: "Repo A handoff 2",
        evidence: [
          {
            id: "ev-1",
            kind: "unit-test",
            command: "npm test",
            status: "FAIL",
            headSha: repoA.shaA,
            observedAt: "2026-11-15T17:02:00Z",
          },
        ],
        createdAt: "2026-11-15T17:02:00Z",
      },
    });

    // Verify A1's ev-1 is still PASS via MCP
    const a1Check = callRelateMcpBatch({
      storeDir,
      requests: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "read_cypher",
            arguments: {
              statement: `MATCH (h:Handoff {key: $key})-[:PROVEN_BY]->(e:Evidence) RETURN e.status AS status`,
              parameters: { key: "mrdzyn/repo-a::RH-P1::SHARED-HANDOFF-1" },
            },
          },
        },
      ],
    });
    assert.deepEqual(JSON.parse(a1Check[0].result.content[0].text).rows, [{ status: "PASS" }]);

    // 5. B2 & B3: Repo B records same handoffId + decisionId + taskId into shared store
    runRecordCli({
      storeDir,
      repoDir: repoBDir,
      tmpRoot,
      name: "b1",
      payload: {
        ...payloadA1,
        repository: "mrdzyn/repo-b",
        branch: repoB.branch,
        headSha: repoB.shaA,
        summary: "Repo B handoff 1",
        decisions: [{ id: "DEC-1", summary: "Repo B decision" }],
        evidence: [
          {
            id: "ev-1",
            kind: "unit-test",
            command: "npm test",
            status: "FAIL",
            headSha: repoB.shaA,
            observedAt: "2026-11-15T17:03:00Z",
          },
        ],
        createdAt: "2026-11-15T17:03:00Z",
      },
    });

    // B3: Repo A resume returns ONLY Repo A; Repo B returns ONLY Repo B; Repo C returns null
    const resumeA = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoADir, taskId: "RH-P1" });
    const resumeB = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoBDir, taskId: "RH-P1" });
    const resumeC = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoCDir, taskId: "RH-P1" });

    assert.equal(resumeA.handoff.repository, "mrdzyn/repo-a");
    assert.equal(resumeA.handoff.handoffId, "SHARED-HANDOFF-2");
    assert.equal(resumeB.handoff.repository, "mrdzyn/repo-b");
    assert.equal(resumeB.handoff.handoffId, "SHARED-HANDOFF-1");
    assert.deepEqual(resumeB.decisions, [{ id: "DEC-1", summary: "Repo B decision" }]);
    assert.equal(resumeC.handoff, null);
    assert.equal(resumeC.freshness.status, "UNVERIFIED");

    // B3: Recording Repo B's payload against Repo A's checkout must fail closed
    const mismatchRes = runRecordCli({
      storeDir,
      repoDir: repoADir,
      tmpRoot,
      name: "mismatch",
      payload: { ...payloadA1, repository: "mrdzyn/repo-b" },
      expectSuccess: false,
    });
    assert.notEqual(mismatchRes.status, 0);
    assert.match(mismatchRes.stderr, /Repository identity mismatch|does not match checkout repository/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P1 regression (B1): committed examples/example-store includes WAL and opens read-only in a fresh clone without regeneration", () => {
  // Verify wal/*.log is tracked in Git
  const trackedWal = execFileSync("git", ["ls-files", "examples/example-store/wal/"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  assert.match(trackedWal, /00000002\.log/, "examples/example-store/wal/00000002.log must be git-tracked");

  const exampleStore = path.resolve(process.cwd(), "examples/example-store");
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
