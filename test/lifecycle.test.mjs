import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listHandoffsViaReadOnlyMcp,
  resumeTaskViaReadOnlyMcp,
} from "../src/mcp_client.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "src", "cli.mjs");

function initTempGitRepo(rootDir, repoId = "mrdzyn/relatehandoff-lifecycle-test") {
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
  fs.writeFileSync(path.join(rootDir, "README.md"), "# Lifecycle Repo\n", "utf8");
  git(["add", "README.md"]);
  git(["commit", "-m", "init"]);
  return {
    headSha: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

function runRecordCli({ storeDir, repoDir, tmpRoot, name, payload, supersedes, supersessionReason, expectSuccess = true }) {
  const inputJson = path.join(tmpRoot, `${name}.json`);
  fs.writeFileSync(inputJson, JSON.stringify(payload, null, 2), "utf8");
  const args = [CLI_PATH, "record", "--store", storeDir, "--repo", repoDir, "--input", inputJson];
  if (supersedes !== undefined) {
    args.push("--supersedes", supersedes);
  }
  if (supersessionReason !== undefined) {
    args.push("--supersession-reason", supersessionReason);
  }
  const res = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (expectSuccess) {
    assert.equal(res.status, 0, `CLI record (${name}) failed: ${res.stderr}`);
    return JSON.parse(res.stdout).recorded;
  }
  return res;
}

test("RH-LOCAL-T2B (real Relate v1.0.1): explicit supersession preserves historical provenance and chains cleanly", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t2b-sup-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(repoDir, { recursive: true });
    const { headSha, branch } = initTempGitRepo(repoDir);

    const h1Payload = {
      schemaVersion: "1.0.0",
      handoffId: "H-1",
      taskId: "TASK-1",
      repository: "mrdzyn/relatehandoff-lifecycle-test",
      branch,
      sourceAgent: "codex",
      targetAgent: "claude",
      headSha,
      summary: "Initial handoff H-1",
      nextAction: "Review H-1",
      decisions: [{ id: "D-1", summary: "Keep immutable provenance" }],
      artifacts: ["README.md"],
      evidence: [
        {
          id: "EV-1",
          kind: "unit",
          command: "node --test",
          status: "PASS",
          headSha,
          observedAt: "2026-11-23T10:00:00Z",
        },
      ],
      createdAt: "2026-11-23T10:00:00Z",
    };

    const rec1 = runRecordCli({ storeDir, repoDir, tmpRoot, name: "h1", payload: h1Payload });
    assert.equal(rec1.idempotentReplay, false);
    assert.equal(rec1.supersedesHandoffId, null);

    // Record H-2 superseding H-1 via CLI flags
    const h2Payload = {
      schemaVersion: "1.0.0",
      handoffId: "H-2",
      taskId: "TASK-1",
      repository: "mrdzyn/relatehandoff-lifecycle-test",
      branch,
      sourceAgent: "claude",
      targetAgent: "gemini",
      headSha,
      summary: "Superseded handoff H-2",
      nextAction: "Continue from H-2",
      decisions: [{ id: "D-2", summary: "Supersede H-1 cleanly" }],
      artifacts: ["README.md"],
      evidence: [],
      createdAt: "2026-11-23T10:05:00Z",
    };
    const rec2 = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "h2",
      payload: h2Payload,
      supersedes: "H-1",
      supersessionReason: "Added follow-up design context",
    });
    assert.equal(rec2.supersedesHandoffId, "H-1");

    // Idempotent replay of H-2 with identical supersession metadata succeeds
    const h2Replay = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "h2-replay",
      payload: {
        ...h2Payload,
        supersedesHandoffId: "H-1",
        supersessionReason: "Added follow-up design context",
      },
    });
    assert.equal(h2Replay.idempotentReplay, true);

    // Default resume returns latest ACTIVE handoff (H-2)
    const activeResume = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-1",
    });
    assert.equal(activeResume.handoff.handoffId, "H-2");
    assert.equal(activeResume.handoff.lifecycleStatus, "ACTIVE");
    assert.equal(activeResume.handoff.supersedesHandoffId, "H-1");
    assert.equal(activeResume.handoff.supersededByHandoffId, null);
    assert.equal(activeResume.handoff.supersessionReason, "Added follow-up design context");

    // Explicit resume --handoff H-1 returns original immutable H-1 marked SUPERSEDED
    const cliHist = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        "resume",
        "--store",
        storeDir,
        "--repo",
        repoDir,
        "--task",
        "TASK-1",
        "--handoff",
        "H-1",
        "--format",
        "markdown",
      ],
      { encoding: "utf8" }
    );
    assert.equal(cliHist.status, 0, cliHist.stderr);
    assert.match(cliHist.stdout, /\*\*Handoff ID:\*\* H-1/);
    assert.match(cliHist.stdout, /\*\*Lifecycle status:\*\* SUPERSEDED/);
    assert.match(cliHist.stdout, /\*\*Superseded by:\*\* H-2/);

    const histJson = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-1",
      handoffId: "H-1",
    });
    assert.equal(histJson.handoff.summary, "Initial handoff H-1");
    assert.deepEqual(histJson.decisions, [{ id: "D-1", summary: "Keep immutable provenance" }]);
    assert.equal(histJson.evidence.length, 1);
    assert.equal(histJson.evidence[0].id, "EV-1");
    assert.deepEqual(histJson.artifacts, ["README.md"]);

    // Chained supersession H-3 -> H-2 (with null supersessionReason) succeeds
    const rec3 = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "h3",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-3",
        taskId: "TASK-1",
        repository: "mrdzyn/relatehandoff-lifecycle-test",
        branch,
        sourceAgent: "gemini",
        targetAgent: "codex",
        headSha,
        summary: "Chained handoff H-3",
        nextAction: "Done",
        createdAt: "2026-11-23T10:10:00Z",
        supersedesHandoffId: "H-2",
      },
    });
    assert.equal(rec3.supersedesHandoffId, "H-2");
    assert.equal(rec3.supersessionReason, null);
    assert.equal(
      resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "TASK-1" }).handoff.handoffId,
      "H-3"
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T2B (real Relate v1.0.1): rejects self, missing, cross-task, cross-repo, and double supersession", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t2b-err-"));
  try {
    const repoA = path.join(tmpRoot, "repoA");
    const repoB = path.join(tmpRoot, "repoB");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    const gitA = initTempGitRepo(repoA, "mrdzyn/repo-a");
    const gitB = initTempGitRepo(repoB, "mrdzyn/repo-b");

    const baseA = {
      schemaVersion: "1.0.0",
      taskId: "T-A",
      repository: "mrdzyn/repo-a",
      branch: gitA.branch,
      sourceAgent: "codex",
      targetAgent: "claude",
      headSha: gitA.headSha,
      summary: "Summary",
      nextAction: "Next",
    };

    runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a1",
      payload: { ...baseA, handoffId: "A-1", createdAt: "2026-11-23T10:00:00Z" },
    });
    runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a2",
      payload: {
        ...baseA,
        handoffId: "A-2",
        createdAt: "2026-11-23T10:01:00Z",
        supersedesHandoffId: "A-1",
      },
    });

    // Self-supersession
    const selfRes = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a-self",
      payload: { ...baseA, handoffId: "A-SELF", supersedesHandoffId: "A-SELF" },
      expectSuccess: false,
    });
    assert.equal(selfRes.status, 1);
    assert.match(selfRes.stderr, /SupersessionError: Handoff cannot supersede itself/);

    // Reason without supersedesHandoffId
    const orphanRsn = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a-rsn",
      payload: { ...baseA, handoffId: "A-RSN", supersessionReason: "orphan reason" },
      expectSuccess: false,
    });
    assert.equal(orphanRsn.status, 1);
    assert.match(orphanRsn.stderr, /requires 'supersedesHandoffId'/);

    // Missing target
    const missRes = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a-miss",
      payload: { ...baseA, handoffId: "A-MISS", supersedesHandoffId: "NO-SUCH" },
      expectSuccess: false,
    });
    assert.equal(missRes.status, 1);
    assert.match(missRes.stderr, /SupersessionError: Target handoff 'NO-SUCH' does not exist/);

    // Cross-task target
    const xtaskRes = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a-xtask",
      payload: { ...baseA, taskId: "T-OTHER", handoffId: "A-XTASK", supersedesHandoffId: "A-1" },
      expectSuccess: false,
    });
    assert.equal(xtaskRes.status, 1);
    assert.match(xtaskRes.stderr, /SupersessionError: Target handoff 'A-1' does not exist in 'mrdzyn\/repo-a::T-OTHER'/);

    // Cross-repo target
    const xrepoRes = runRecordCli({
      storeDir,
      repoDir: repoB,
      tmpRoot,
      name: "b-xrepo",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "B-XREPO",
        taskId: "T-A",
        repository: "mrdzyn/repo-b",
        branch: gitB.branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: gitB.headSha,
        summary: "Cross repo",
        nextAction: "Fail",
        supersedesHandoffId: "A-1",
      },
      expectSuccess: false,
    });
    assert.equal(xrepoRes.status, 1);
    assert.match(xrepoRes.stderr, /SupersessionError: Target handoff 'A-1' does not exist in 'mrdzyn\/repo-b::T-A'/);

    // Double supersession of A-1 (already superseded by A-2)
    const doubleRes = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a3",
      payload: { ...baseA, handoffId: "A-3", supersedesHandoffId: "A-1" },
      expectSuccess: false,
    });
    assert.equal(doubleRes.status, 1);
    assert.match(doubleRes.stderr, /HandoffConflictError: Target handoff 'A-1' in 'mrdzyn\/repo-a::T-A' is already superseded by 'A-2'/);

    // CLI --supersedes mismatch with JSON supersedesHandoffId
    const cliConflict = runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "a-cli-conflict",
      payload: { ...baseA, handoffId: "A-CLI", supersedesHandoffId: "A-2" },
      supersedes: "A-1",
      expectSuccess: false,
    });
    assert.equal(cliConflict.status, 1);
    assert.match(cliConflict.stderr, /Supersession conflict/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T2B (real Relate v1.0.1): list filters by task, status, branch, agent, limit and enforces repo isolation", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t2b-list-"));
  try {
    const repoA = path.join(tmpRoot, "repoA");
    const repoB = path.join(tmpRoot, "repoB");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    const gitA = initTempGitRepo(repoA, "mrdzyn/repo-a");
    const gitB = initTempGitRepo(repoB, "mrdzyn/repo-b");

    runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "ha1",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-A1",
        taskId: "T1",
        repository: "mrdzyn/repo-a",
        branch: gitA.branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: gitA.headSha,
        summary: "\x1b[31mFirst\x1b[0m # heading",
        nextAction: "Next 1",
        createdAt: "2026-11-23T10:00:00Z",
      },
    });
    runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "ha2",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-A2",
        taskId: "T1",
        repository: "mrdzyn/repo-a",
        branch: gitA.branch,
        sourceAgent: "claude",
        targetAgent: "gemini",
        headSha: gitA.headSha,
        summary: "Second active",
        nextAction: "Next 2",
        createdAt: "2026-11-23T10:05:00Z",
        supersedesHandoffId: "H-A1",
        supersessionReason: "Refined plan",
      },
    });
    runRecordCli({
      storeDir,
      repoDir: repoA,
      tmpRoot,
      name: "ha3",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-A3",
        taskId: "T2",
        repository: "mrdzyn/repo-a",
        branch: gitA.branch,
        sourceAgent: "gemini",
        targetAgent: "codex",
        headSha: gitA.headSha,
        summary: "Other task handoff",
        nextAction: "Next 3",
        createdAt: "2026-11-23T10:10:00Z",
      },
    });
    runRecordCli({
      storeDir,
      repoDir: repoB,
      tmpRoot,
      name: "hb1",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-B1",
        taskId: "T1",
        repository: "mrdzyn/repo-b",
        branch: gitB.branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: gitB.headSha,
        summary: "Repo B secret context",
        nextAction: "Next B",
        createdAt: "2026-11-23T10:15:00Z",
      },
    });

    // All repo-a handoffs (no repo-b leak)
    const allA = listHandoffsViaReadOnlyMcp({ storeDir, repoRoot: repoA });
    assert.deepEqual(
      allA.handoffs.map((h) => h.handoffId),
      ["H-A3", "H-A2", "H-A1"]
    );
    assert.ok(!allA.handoffs.some((h) => h.repository === "mrdzyn/repo-b"));

    // Filter by task + status=active
    const activeT1 = listHandoffsViaReadOnlyMcp({
      storeDir,
      repoRoot: repoA,
      taskId: "T1",
      status: "active",
    });
    assert.deepEqual(
      activeT1.handoffs.map((h) => h.handoffId),
      ["H-A2"]
    );

    // Filter by status=superseded
    const supA = listHandoffsViaReadOnlyMcp({
      storeDir,
      repoRoot: repoA,
      status: "superseded",
    });
    assert.deepEqual(
      supA.handoffs.map((h) => h.handoffId),
      ["H-A1"]
    );
    assert.equal(supA.handoffs[0].supersededByHandoffId, "H-A2");

    // Filter by agent + limit
    const geminiLimited = listHandoffsViaReadOnlyMcp({
      storeDir,
      repoRoot: repoA,
      agent: "gemini",
      limit: 1,
    });
    assert.equal(geminiLimited.totalMatched, 2);
    assert.equal(geminiLimited.truncated, true);
    assert.deepEqual(
      geminiLimited.handoffs.map((h) => h.handoffId),
      ["H-A3"]
    );

    // CLI list --format markdown strips ANSI/escapes Markdown
    const cliMd = spawnSync(
      process.execPath,
      [CLI_PATH, "list", "--store", storeDir, "--repo", repoA, "--task", "T1", "--format", "markdown"],
      { encoding: "utf8" }
    );
    assert.equal(cliMd.status, 0, cliMd.stderr);
    assert.ok(cliMd.stdout.includes("# RelateHandoff List"));
    assert.ok(!cliMd.stdout.includes("\x1b"));
    assert.ok(cliMd.stdout.includes("\\# heading"));

    // Invalid CLI flags and selectors exit 2 (RH17-02)
    for (const badArgs of [
      ["list", "--store", storeDir, "--repo", repoA, "--status", "bogus"],
      ["list", "--store", storeDir, "--repo", repoA, "--limit", "101"],
      ["list", "--store", storeDir, "--repo", repoA, "--limit", "0"],
      ["list", "--store", storeDir, "--repo", repoA, "--format", "csv"],
      ["list", "--store", storeDir, "--repo", repoA, "--unknown", "1"],
      ["list", "--store", storeDir, "--repo", repoA, "--task", "bad/id"],
      ["list", "--store", storeDir, "--repo", repoA, "--agent", "   "],
      ["list", "--store", storeDir, "--repo", repoA, "--branch", "   "],
      ["resume", "--store", storeDir, "--repo", repoA, "--task", "T1", "--handoff", "bad/id"],
    ]) {
      const badRes = spawnSync(process.execPath, [CLI_PATH, ...badArgs], { encoding: "utf8" });
      assert.equal(badRes.status, 2, `Expected exit 2 for ${badArgs.join(" ")}`);
    }

    // Actual repository/MCP retrieval failure continues to exit 1 (RH17-02)
    const missingRepoRes = spawnSync(
      process.execPath,
      [CLI_PATH, "list", "--store", storeDir, "--repo", path.join(tmpRoot, "missing-repo")],
      { encoding: "utf8" }
    );
    assert.equal(missingRepoRes.status, 1);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH17-01: --supersedes conflict error never echoes secret-shaped values in stdout or stderr", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t2b-rh1701-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(repoDir, { recursive: true });
    const { headSha, branch } = initTempGitRepo(repoDir, "mrdzyn/rh17-01");

    const cliSecret = "ghp_fictionalCliSecretToken1234567890abcd";
    const payloadSecret = "ghp_fictionalPayloadSecretToken9876543210";
    const res = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "rh1701",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-SEC",
        taskId: "T-SEC",
        repository: "mrdzyn/rh17-01",
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha,
        summary: "Test secret suppression",
        nextAction: "Verify",
        supersedesHandoffId: payloadSecret,
      },
      supersedes: cliSecret,
      expectSuccess: false,
    });

    assert.equal(res.status, 1);
    assert.match(res.stderr, /Supersession conflict: CLI --supersedes differs from payload supersedesHandoffId/);
    assert.ok(!res.stdout.includes(cliSecret));
    assert.ok(!res.stdout.includes(payloadSecret));
    assert.ok(!res.stderr.includes(cliSecret));
    assert.ok(!res.stderr.includes(payloadSecret));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T2B (fake): list rejects write_cypher and >100 row overflow", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t2b-fake-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    fs.mkdirSync(repoDir, { recursive: true });
    const { headSha, branch } = initTempGitRepo(repoDir, "mrdzyn/fake-list");

    const overflowScript = path.join(tmpRoot, "relate-overflow.mjs");
    const rows = Array.from({ length: 101 }, (_, i) => ({
      repository: "mrdzyn/fake-list",
      taskId: "T1",
      handoffKey: `mrdzyn/fake-list::T1::H-${i}`,
      handoffId: `H-${i}`,
      schemaVersion: "1.0.0",
      branch,
      summary: "s",
      nextAction: "n",
      createdAt: "2026-11-23T10:00:00Z",
      headSha,
      sourceAgent: "codex",
      targetAgent: "claude",
    }));
    fs.writeFileSync(
      overflowScript,
      `#!/usr/bin/env node
if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: JSON.stringify({ rows: ${JSON.stringify(rows)} }) }] } }));
`,
      { mode: 0o755 }
    );

    assert.throws(
      () => listHandoffsViaReadOnlyMcp({ storeDir: tmpRoot, repoRoot: repoDir, relateBin: overflowScript }),
      /BoundExceededError/
    );

    const writeToolScript = path.join(tmpRoot, "relate-write.mjs");
    fs.writeFileSync(
      writeToolScript,
      `#!/usr/bin/env node
if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }, { name: "write_cypher" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: JSON.stringify({ rows: [] }) }] } }));
`,
      { mode: 0o755 }
    );

    assert.throws(
      () => listHandoffsViaReadOnlyMcp({ storeDir: tmpRoot, repoRoot: repoDir, relateBin: writeToolScript }),
      /Security violation: read-only MCP server exposed write_cypher/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
