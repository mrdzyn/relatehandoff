import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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

    // B4: Local runner execution (--verify node-test-suite) records RUNNER_RECORDED_UNSIGNED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "trusted-exec",
      verifyProfile: "node-test-suite",
      payload: {
        ...basePayload,
        handoffId: "RH-P1-TRUSTED-1",
        summary: "Executed local node --test suite at SHA-A",
        evidence: [],
        createdAt: "2026-11-15T17:01:00Z",
      },
    });

    // Read-only resume WITHOUT --verify: metadata is CURRENT, but unsigned store cannot authenticate execution
    const resUnsigned = spawnSync(
      process.execPath,
      ["src/cli.mjs", "resume", "--store", storeDir, "--repo", repoDir, "--task", "RH-P1"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(resUnsigned.status, 0, `CLI resume failed: ${resUnsigned.stderr}`);
    const parsedUnsigned = JSON.parse(resUnsigned.stdout);

    assert.deepEqual(parsedUnsigned.tools, ["read_cypher", "get_schema"]);
    assert.equal(parsedUnsigned.handoff.handoffId, "RH-P1-TRUSTED-1");
    assert.equal(parsedUnsigned.evidence[0].executionMode, "RUNNER_RECORDED_UNSIGNED");
    assert.equal(parsedUnsigned.freshness.metadataFreshness, "CURRENT");
    assert.equal(parsedUnsigned.freshness.executionAuthenticity, "UNVERIFIED");
    assert.equal(parsedUnsigned.freshness.status, "UNVERIFIED");
    assert.ok(
      parsedUnsigned.freshness.reasons.some((r) => r.startsWith("UNSIGNED_LOCAL_STORE_EVIDENCE"))
    );

    // Read-only resume WITH explicit in-process --verify node-test-suite -> AUTHENTICATED / VERIFIED
    const resVerified = spawnSync(
      process.execPath,
      [
        "src/cli.mjs",
        "resume",
        "--store",
        storeDir,
        "--repo",
        repoDir,
        "--task",
        "RH-P1",
        "--verify",
        "node-test-suite",
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(resVerified.status, 0, `CLI resume --verify failed: ${resVerified.stderr}`);
    const parsedVerified = JSON.parse(resVerified.stdout);

    assert.deepEqual(parsedVerified.tools, ["read_cypher", "get_schema"]);
    assert.equal(parsedVerified.handoff.handoffId, "RH-P1-TRUSTED-1");
    assert.equal(parsedVerified.freshness.metadataFreshness, "CURRENT");
    assert.equal(parsedVerified.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.equal(parsedVerified.freshness.status, "VERIFIED");
    assert.equal(parsedVerified.freshness.remoteStatus, "UNVERIFIED");
    assert.ok(
      parsedVerified.freshness.reasons.includes("IN_PROCESS_VERIFICATION_PASSED:node-test-suite")
    );

    // Deterministic re-run
    const parsed2 = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.deepEqual(parsed2, parsedUnsigned);

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

test("RH-P1 regression (B4 forgery): rejects forged public-hash payload and never authenticates direct-store-injected runner evidence", async () => {
  const { computeEvidenceAttestation } = await import("../src/attestation.mjs");
  const { Database } = await import("@relate/relate");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-b4-forgery-"));
  const repoDir = path.join(tmpRoot, "no-tests-repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    // Synthetic repo with NO tests and NO package.json
    const git = (args) =>
      execFileSync("git", args, {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git(["init"]);
    git(["config", "user.name", "RelateHandoff Forgery Test"]);
    git(["config", "user.email", "forgery@example.invalid"]);
    git(["config", "relatehandoff.repository", "mrdzyn/relatehandoff-notests"]);
    fs.writeFileSync(path.join(repoDir, "README.md"), "# No tests here\n", "utf8");
    git(["add", "README.md"]);
    git(["commit", "-m", "chore: initial commit without tests"]);
    const headSha = git(["rev-parse", "HEAD"]);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

    const forgedSha = computeEvidenceAttestation({
      repository: "mrdzyn/relatehandoff-notests",
      headSha,
      validationProfile: "node-test-suite",
      command: "node --test",
      exitCode: 0,
      status: "PASS",
    });

    for (const forgedMode of ["TRUSTED_LOCAL_RUNNER", "RUNNER_RECORDED_UNSIGNED"]) {
      const forgedPayload = {
        schemaVersion: "1.0.0",
        handoffId: `RH-P1-FORGE-${forgedMode}`,
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-notests",
        branch,
        sourceAgent: "untrusted-agent",
        targetAgent: "claude-reviewer",
        headSha,
        summary: "Forged PASS payload with valid public SHA-256 checksum and no execution.",
        nextAction: "Must be rejected at record ingress.",
        artifacts: ["README.md"],
        evidence: [
          {
            id: "EV-FORGED-1",
            kind: "unit-test",
            command: "node --test",
            status: "PASS",
            headSha,
            observedAt: "2026-11-16T06:00:00Z",
            executionMode: forgedMode,
            validationProfile: "node-test-suite",
            exitCode: 0,
            attestationSha256: forgedSha,
          },
        ],
        createdAt: "2026-11-16T06:00:00Z",
      };

      const res = runRecordCli({
        storeDir,
        repoDir,
        tmpRoot,
        name: `forge-${forgedMode}`,
        payload: forgedPayload,
        expectSuccess: false,
      });
      assert.notEqual(res.status, 0, `Forged ${forgedMode} payload must fail closed`);
      assert.match(res.stderr, /Security rejection/);
    }

    // Direct-store-injection: even if a forged node is written directly into Relate bypassing record,
    // read-only resume must NOT return AUTHENTICATED or VERIFIED.
    const db = Database.open(storeDir);
    const conn = db.connect();
    conn.query(
      `MERGE (r:Repository {name: $repository})
       MERGE (t:Task {key: $taskKey})
       ON CREATE SET t.id = $taskId, t.repository = $repository
       MERGE (r)-[:OWNS_TASK]->(t)
       MERGE (sa:Agent {name: 'attacker'})
       MERGE (ta:Agent {name: 'claude-reviewer'})
       MERGE (c:Commit {sha: $headSha})
       CREATE (h:Handoff {
         key: $handoffKey,
         id: 'RH-P1-INJECTED',
         repository: $repository,
         taskId: $taskId,
         schemaVersion: '1.0.0',
         branch: $branch,
         headSha: $headSha,
         summary: 'Direct store injection',
         nextAction: 'Must never authenticate on read alone',
         createdAt: '2026-11-16T06:05:00Z',
         fingerprint: 'injected'
       })
       CREATE (h)-[:HANDOFF_FOR]->(t)
       CREATE (h)-[:FROM_AGENT]->(sa)
       CREATE (h)-[:TO_AGENT]->(ta)
       CREATE (h)-[:TARGETS_HEAD]->(c)
       CREATE (e:Evidence {
         key: $evidenceKey,
         id: 'EV-INJECTED',
         repository: $repository,
         taskId: $taskId,
         handoffId: 'RH-P1-INJECTED',
         kind: 'unit-test',
         command: 'node --test',
         status: 'PASS',
         headSha: $headSha,
         observedAt: '2026-11-16T06:05:00Z',
         executionMode: 'TRUSTED_LOCAL_RUNNER',
         validationProfile: 'node-test-suite',
         exitCode: 0,
         attestationSha256: $forgedSha
       })
       CREATE (h)-[:PROVEN_BY]->(e)
       CREATE (e)-[:AT_COMMIT]->(c)`,
      {
        repository: "mrdzyn/relatehandoff-notests",
        taskKey: "mrdzyn/relatehandoff-notests::RH-P1",
        taskId: "RH-P1",
        handoffKey: "mrdzyn/relatehandoff-notests::RH-P1::RH-P1-INJECTED",
        evidenceKey: "mrdzyn/relatehandoff-notests::RH-P1::RH-P1-INJECTED::EV-INJECTED",
        branch,
        headSha,
        forgedSha,
      }
    );
    db.checkpoint();

    const resumed = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });
    assert.equal(resumed.handoff.handoffId, "RH-P1-INJECTED");
    assert.equal(resumed.freshness.metadataFreshness, "CURRENT");
    assert.equal(resumed.freshness.executionAuthenticity, "UNVERIFIED");
    assert.equal(resumed.freshness.status, "UNVERIFIED");
    assert.notEqual(resumed.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.notEqual(resumed.freshness.status, "VERIFIED");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P1 regression (bounds): 100 detail rows succeed and 101 detail rows fail closed at record time", async () => {
  const { recordHandoff } = await import("../src/recorder.mjs");
  const { MAX_DETAIL_ROWS } = await import("../src/schema.mjs");
  assert.equal(MAX_DETAIL_ROWS, 100);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-bounds-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    const { shaA, branch } = initTempGitRepo(repoDir, "mrdzyn/relatehandoff-bounds");
    const makeDecisions = (n) =>
      Array.from({ length: n }, (_, i) => ({ id: `DEC-${i + 1}`, summary: `Decision ${i + 1}` }));

    // 100 rows: succeeds at record time and resumes cleanly
    recordHandoff({
      storeDir,
      repoRoot: repoDir,
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-BOUND-100",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-bounds",
        branch,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: shaA,
        summary: "Exactly 100 decisions",
        nextAction: "Verify bounded resume",
        decisions: makeDecisions(100),
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-16T06:10:00Z",
      },
    });

    const resumed = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "RH-P1" });
    assert.equal(resumed.decisions.length, 100);

    // 101 rows: fails closed at record time
    assert.throws(
      () =>
        recordHandoff({
          storeDir,
          repoRoot: repoDir,
          payload: {
            schemaVersion: "1.0.0",
            handoffId: "RH-P1-BOUND-101",
            taskId: "RH-P1",
            repository: "mrdzyn/relatehandoff-bounds",
            branch,
            sourceAgent: "codex-writer",
            targetAgent: "claude-reviewer",
            headSha: shaA,
            summary: "101 decisions exceeds MAX_DETAIL_ROWS",
            nextAction: "Must fail closed",
            decisions: makeDecisions(101),
            artifacts: ["README.md"],
            evidence: [],
            createdAt: "2026-11-16T06:11:00Z",
          },
        }),
      /BoundExceededError/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P1 regression (zero-test vs one-test --verify): zero discovered tests cannot yield PASS or VERIFIED", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-zero-tests-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    const git = (args) =>
      execFileSync("git", args, {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git(["init"]);
    git(["config", "user.name", "RelateHandoff Zero Test"]);
    git(["config", "user.email", "zero@example.invalid"]);
    git(["config", "relatehandoff.repository", "mrdzyn/relatehandoff-zero"]);
    fs.writeFileSync(path.join(repoDir, "README.md"), "# Only README, no tests\n", "utf8");
    git(["add", "README.md"]);
    git(["commit", "-m", "chore: initial commit with zero tests"]);
    const sha0 = git(["rev-parse", "HEAD"]);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

    // 0 tests: record --verify node-test-suite must record UNVERIFIED, never PASS
    const recZero = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "zero-tests",
      verifyProfile: "node-test-suite",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-ZERO-0",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-zero",
        branch,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: sha0,
        summary: "Zero tests in checkout",
        nextAction: "Must not mark PASS or VERIFIED",
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-16T07:00:00Z",
      },
    });
    const recordedZero = JSON.parse(recZero.stdout);
    assert.equal(recordedZero.recorded.evidence[0].status, "UNVERIFIED");

    // 0 tests: resume --verify node-test-suite must NOT return AUTHENTICATED or VERIFIED
    const resZero = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
      verifyProfile: "node-test-suite",
    });
    assert.equal(resZero.freshness.metadataFreshness, "CURRENT");
    assert.notEqual(resZero.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.equal(resZero.freshness.status, "UNVERIFIED");
    assert.ok(
      resZero.freshness.reasons.includes("IN_PROCESS_VERIFICATION_UNVERIFIED:node-test-suite")
    );

    // 1 test: add smoke.test.mjs and commit -> record & resume --verify yield PASS & VERIFIED
    fs.writeFileSync(
      path.join(repoDir, "smoke.test.mjs"),
      `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("one test", () => assert.equal(1, 1));\n`,
      "utf8"
    );
    git(["add", "smoke.test.mjs"]);
    git(["commit", "-m", "test: add one smoke test"]);
    const sha1 = git(["rev-parse", "HEAD"]);

    const recOne = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "one-test",
      verifyProfile: "node-test-suite",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-ONE-1",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-zero",
        branch,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: sha1,
        summary: "One real test in checkout",
        nextAction: "Verify PASS and VERIFIED",
        artifacts: ["README.md", "smoke.test.mjs"],
        evidence: [],
        createdAt: "2026-11-16T07:01:00Z",
      },
    });
    const recordedOne = JSON.parse(recOne.stdout);
    assert.equal(recordedOne.recorded.evidence[0].status, "PASS");

    const resOne = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
      verifyProfile: "node-test-suite",
    });
    assert.equal(resOne.freshness.metadataFreshness, "CURRENT");
    assert.equal(resOne.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.equal(resOne.freshness.status, "VERIFIED");
    assert.ok(
      resOne.freshness.reasons.includes("IN_PROCESS_VERIFICATION_PASSED:node-test-suite")
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P2 regression (long-lived MCP snapshot): fresh short-lived resume sees newest commit immediately; persistent reader snapshot characterized", async (t) => {
  const cli = resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-longlived-mcp-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  let mcp = null;
  let mcpExited = false;

  try {
    const { shaA, branch } = initTempGitRepo(repoDir, "mrdzyn/relatehandoff-longlived");

    // 1. Writer process #1 records H-1 and exits cleanly
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-h1",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P2-H-1",
        taskId: "RH-P2",
        repository: "mrdzyn/relatehandoff-longlived",
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: shaA,
        summary: "First handoff before long-lived MCP starts",
        nextAction: "Observe initial snapshot",
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-16T18:30:00Z",
      },
    });

    // 2. Start a long-lived read-only MCP stdio process with bounded handlers and cleanup
    mcp = spawn(
      cli.bin,
      ["serve", "--mcp", "stdio", "--database", storeDir, "--read-only"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let buf = "";
    let stderrBuf = "";
    const pending = new Map();

    const rejectAllPending = (err) => {
      for (const [id, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        pending.delete(id);
        entry.reject(err);
      }
    };

    mcp.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString("utf8");
    });

    mcp.on("error", (err) => {
      mcpExited = true;
      rejectAllPending(new Error(`Long-lived MCP process error: ${err.message} (stderr: ${stderrBuf.trim()})`));
    });

    mcp.on("exit", (code, signal) => {
      mcpExited = true;
      if (pending.size > 0) {
        rejectAllPending(
          new Error(
            `Long-lived MCP exited prematurely (code=${code}, signal=${signal}): ${stderrBuf.trim()}`
          )
        );
      }
    });

    mcp.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (err) {
          rejectAllPending(
            new Error(`Invalid JSON-RPC line from long-lived MCP: ${err.message} (${line})`)
          );
          return;
        }
        const entry = pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          pending.delete(msg.id);
          entry.resolve(msg);
        }
      }
    });

    const rpc = (id, statement, timeoutMs = 10000) =>
      new Promise((resolve, reject) => {
        if (mcpExited) {
          reject(new Error(`Cannot send RPC ${id}: MCP process already exited`));
          return;
        }
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new Error(
              `Long-lived MCP RPC id=${id} timed out after ${timeoutMs}ms (stderr: ${stderrBuf.trim()})`
            )
          );
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        mcp.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name: "read_cypher", arguments: { statement, parameters: {} } },
          }) + "\n"
        );
      });

    const query = "MATCH (h:Handoff) RETURN h.id AS id ORDER BY h.id";
    const beforeResp = await rpc(1, query);
    const beforeIds = JSON.parse(beforeResp.result.content[0].text).rows.map((r) => r.id);
    assert.deepEqual(beforeIds, ["RH-P2-H-1"]);

    // 3. Separate writer process #2 records H-2 while the long-lived MCP process is open
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-h2",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P2-H-2",
        taskId: "RH-P2",
        repository: "mrdzyn/relatehandoff-longlived",
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: shaA,
        summary: "Second handoff recorded while long-lived MCP is open",
        nextAction: "Verify snapshot behavior and restart visibility",
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-16T18:31:00Z",
      },
    });

    // 4. Diagnostic characterization of the same long-lived MCP process (do not require upstream bug as pass condition)
    const afterResp = await rpc(2, query);
    const afterIds = JSON.parse(afterResp.result.content[0].text).rows.map((r) => r.id);
    assert.ok(
      (afterIds.length === 1 && afterIds[0] === "RH-P2-H-1") ||
        (afterIds.length === 2 && afterIds[0] === "RH-P2-H-1" && afterIds[1] === "RH-P2-H-2"),
      `Unexpected long-lived MCP query result: ${JSON.stringify(afterIds)}`
    );
    t.diagnostic(
      `Long-lived MCP persistent reader returned ${JSON.stringify(afterIds)} after external write RH-P2-H-2`
    );

    // 5. Product invariant: fresh short-lived read-only MCP resume sees H-2 immediately
    const resumed = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P2",
    });
    assert.equal(resumed.handoff.handoffId, "RH-P2-H-2");
  } finally {
    if (mcp && !mcpExited) {
      try {
        mcp.stdin.end();
      } catch {
        // ignore
      }
      await new Promise((resolve) => {
        const killTimer = setTimeout(() => {
          if (!mcpExited) {
            try {
              mcp.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
          resolve();
        }, 2000);
        mcp.once("close", () => {
          clearTimeout(killTimer);
          resolve();
        });
      });
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function writeFakeRelateScript(tmpRoot, name, nodeBody) {
  const scriptPath = path.join(tmpRoot, `${name}.mjs`);
  const wrapperPath = path.join(tmpRoot, name);
  fs.writeFileSync(scriptPath, nodeBody, "utf8");
  fs.writeFileSync(
    wrapperPath,
    `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
    { mode: 0o755 }
  );
  return wrapperPath;
}

test("RH-P2 fault injection (fake): callRelateMcpBatch and resume fail closed on silent, crashed, malformed, and wrong-answer fakes", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-fake-mcp-"));
  const repoDir = path.join(tmpRoot, "repo");
  const storeDir = path.join(tmpRoot, "store");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(storeDir, { recursive: true });

  try {
    initTempGitRepo(repoDir, "mrdzyn/relatehandoff-fakes");

    // 1. Silent / hanging fake -> bounded timeoutMs kills child with SIGKILL
    const silentFake = writeFakeRelateScript(
      tmpRoot,
      "relate-silent",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
setTimeout(() => {}, 10000);`
    );
    const t0 = Date.now();
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir,
          relateBin: silentFake,
          timeoutMs: 250,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
        }),
      /timed out after 250ms/
    );
    assert.ok(Date.now() - t0 < 5000, "Timeout must fail fast without hanging");

    // 2. Crashed / non-zero exit fake -> fails closed with exit status and stderr diagnostics
    const crashFake = writeFakeRelateScript(
      tmpRoot,
      "relate-crash",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
console.error("simulated fatal store panic");
process.exit(2);`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir,
          relateBin: crashFake,
          timeoutMs: 2000,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
        }),
      /failed \(exit 2\): simulated fatal store panic/
    );

    // 3. Malformed / truncated JSON-RPC output fake
    const malformedFake = writeFakeRelateScript(
      tmpRoot,
      "relate-malformed",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
process.stdout.write("{not-valid-json\\n");`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir,
          relateBin: malformedFake,
          timeoutMs: 2000,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
        }),
      /Invalid JSON-RPC line 1/
    );

    // 4a. Wrong-answer fake: exposes write_cypher in read-only mode
    const writeToolFake = writeFakeRelateScript(
      tmpRoot,
      "relate-write-tool",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }, { name: "write_cypher" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: JSON.stringify({ rows: [] }) }] } }));`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "RH-P2",
          relateBin: writeToolFake,
          timeoutMs: 2000,
        }),
      /Security violation: read-only MCP server exposed write_cypher/
    );

    // 4b. Wrong-answer fake: missing read_cypher
    const missingReadToolFake = writeFakeRelateScript(
      tmpRoot,
      "relate-missing-read",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "get_schema" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: JSON.stringify({ rows: [] }) }] } }));`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "RH-P2",
          relateBin: missingReadToolFake,
          timeoutMs: 2000,
        }),
      /MCP server missing required read_cypher tool/
    );

    // 4c. Wrong-answer fake: mismatched repository isolation violation
    const wrongRepoFake = writeFakeRelateScript(
      tmpRoot,
      "relate-wrong-repo",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.0"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }, { name: "get_schema" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: JSON.stringify({ rows: [{ repository: "mrdzyn/other-repo", taskId: "RH-P2", handoffKey: "x", handoffId: "H-X", headSha: "0".repeat(40) }] }) }] } }));`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "RH-P2",
          relateBin: wrongRepoFake,
          timeoutMs: 2000,
        }),
      /Repository isolation violation/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
