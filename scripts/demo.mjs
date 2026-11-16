#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  callRelateMcpBatch,
  resolveRelateCli,
  resumeTaskViaReadOnlyMcp,
} from "../src/mcp_client.mjs";

function recordViaCli({ storeDir, repoDir, tmpRoot, name, payload, verifyProfile }) {
  const inputPath = path.join(tmpRoot, `${name}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf8");
  const args = ["src/cli.mjs", "record", "--store", storeDir, "--repo", repoDir, "--input", inputPath];
  if (verifyProfile) {
    args.push("--verify", verifyProfile);
  }
  const res = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`CLI record failed (${name}): ${res.stderr}`);
  }
}

function initSyntheticRepo(repoDir) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  git(["init"]);
  git(["config", "user.name", "RelateHandoff Demo"]);
  git(["config", "user.email", "demo@example.invalid"]);
  git(["config", "relatehandoff.repository", "mrdzyn/relatehandoff-synthetic"]);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Synthetic Demo Repo\n", "utf8");
  fs.writeFileSync(
    path.join(repoDir, "smoke.test.mjs"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("synthetic check", () => assert.equal(1 + 1, 2));\n`,
    "utf8"
  );
  git(["add", "README.md", "smoke.test.mjs"]);
  git(["commit", "-m", "chore: initial synthetic commit (SHA-A)"]);
  return { git, shaA: git(["rev-parse", "HEAD"]) };
}

function main() {
  const cli = resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-demo-"));
  const repoDir = path.join(tmpRoot, "synthetic-repo");
  const storeDir = path.join(tmpRoot, "relate-store");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    const { git, shaA } = initSyntheticRepo(repoDir);

    // 1. Record handoff with trusted local validation execution (--verify node-test-suite) at SHA-A
    recordViaCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-1",
      verifyProfile: "node-test-suite",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-DEMO-1",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-synthetic",
        branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: shaA,
        summary: "Implemented handoff recorder and freshness check at SHA-A.",
        nextAction: "Review provenance and verify freshness via read-only MCP.",
        decisions: [{ id: "DEC-1", summary: "Keep consumer MCP read-only over stdio." }],
        artifacts: ["README.md", "smoke.test.mjs"],
        evidence: [],
        createdAt: "2026-11-15T17:00:00Z",
      },
    });

    // 2 & 3. Retrieve via real read-only MCP and show VERIFIED (authenticated local execution)
    const stepVerified = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });

    // 4. Advance Git HEAD to SHA-B and show STALE
    fs.appendFileSync(path.join(repoDir, "README.md"), "New commit at SHA-B\n", "utf8");
    git(["add", "README.md"]);
    git(["commit", "-m", "feat: advance synthetic repo to SHA-B"]);
    const shaB = git(["rev-parse", "HEAD"]);
    const branchB = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const stepStale = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });

    // 5a. Self-asserted PASS at SHA-B -> UNVERIFIED (not authenticated execution)
    recordViaCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-self-asserted",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-DEMO-2A",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-synthetic",
        branch: branchB,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: shaB,
        summary: "Self-asserted PASS claim without trusted runner execution.",
        nextAction: "Run trusted validation before trusting PASS.",
        artifacts: ["README.md"],
        evidence: [
          {
            id: "EV-SELF-1",
            kind: "unit-test",
            command: "npm test (never executed)",
            status: "PASS",
            headSha: shaB,
            observedAt: "2026-11-15T17:04:00Z",
          },
        ],
        createdAt: "2026-11-15T17:04:00Z",
      },
    });
    const stepSelfAsserted = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });

    // 5b. Missing evidence at SHA-B -> UNVERIFIED
    recordViaCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-2",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-DEMO-2B",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-synthetic",
        branch: branchB,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: shaB,
        summary: "Handoff recorded at SHA-B without test evidence.",
        nextAction: "Run tests before marking ready.",
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-15T17:05:00Z",
      },
    });
    const stepUnverified = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });

    // 6. Failed evidence at SHA-B -> BLOCKED
    recordViaCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "handoff-3",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "RH-P1-DEMO-3",
        taskId: "RH-P1",
        repository: "mrdzyn/relatehandoff-synthetic",
        branch: branchB,
        sourceAgent: "codex-writer",
        targetAgent: "claude-reviewer",
        headSha: shaB,
        summary: "Handoff recorded at SHA-B with failing test evidence.",
        nextAction: "Fix failing test before proceeding.",
        artifacts: ["README.md"],
        evidence: [
          {
            id: "EV-FAIL-1",
            kind: "automated-test",
            command: "npm test",
            status: "FAIL",
            headSha: shaB,
            observedAt: "2026-11-15T17:10:00Z",
          },
        ],
        createdAt: "2026-11-15T17:10:00Z",
      },
    });
    const stepBlocked = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "RH-P1",
    });

    // 7. Prove MCP write operations are rejected
    const mcpWriteRefusals = callRelateMcpBatch({
      storeDir,
      requests: [
        {
          jsonrpc: "2.0",
          id: 101,
          method: "tools/call",
          params: {
            name: "read_cypher",
            arguments: { statement: "CREATE (:IllegalNode {x: 1})", parameters: {} },
          },
        },
        {
          jsonrpc: "2.0",
          id: 102,
          method: "tools/call",
          params: {
            name: "write_cypher",
            arguments: { statement: "CREATE (:IllegalNode {x: 1})", parameters: {} },
          },
        },
      ],
    });

    const summary = {
      relateCliVersion: cli.version.split("\n")[0],
      step1_recordAtShaA: { handoffId: "RH-P1-DEMO-1", shaA },
      step2_3_readOnlyMcpVerified: {
        mcpTools: stepVerified.tools,
        handoffId: stepVerified.handoff.handoffId,
        provenance: {
          repository: stepVerified.handoff.repository,
          sourceAgent: stepVerified.handoff.sourceAgent,
          targetAgent: stepVerified.handoff.targetAgent,
          artifacts: stepVerified.artifacts,
          decisions: stepVerified.decisions.map((d) => d.id),
          evidenceIds: stepVerified.evidence.map((e) => `${e.id}:${e.status}:${e.executionMode}`),
        },
        freshness: stepVerified.freshness,
      },
      step4_shaBStaleDetection: {
        shaB,
        freshness: stepStale.freshness,
      },
      step5a_selfAssertedPassUnverified: {
        handoffId: stepSelfAsserted.handoff.handoffId,
        freshness: stepSelfAsserted.freshness,
      },
      step5b_missingEvidenceUnverified: {
        handoffId: stepUnverified.handoff.handoffId,
        freshness: stepUnverified.freshness,
      },
      step6_failedEvidenceBlocked: {
        handoffId: stepBlocked.handoff.handoffId,
        freshness: stepBlocked.freshness,
      },
      step7_mcpWriteRefusals: mcpWriteRefusals.map((r) => ({
        id: r.id,
        isError: r.result?.isError,
        message: r.result?.content?.[0]?.text,
      })),
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main();
