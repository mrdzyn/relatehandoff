import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  callRelateMcpBatch,
  listHandoffsViaReadOnlyMcp,
  resolveRelateCli,
  resumeTaskViaReadOnlyMcp,
} from "../src/mcp_client.mjs";
import { recordHandoff } from "../src/recorder.mjs";
import { MAX_DETAIL_ROWS } from "../src/schema.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "src", "cli.mjs");

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initTempGitRepo(rootDir, repoId) {
  fs.mkdirSync(rootDir, { recursive: true });
  runGit(rootDir, ["init"]);
  runGit(rootDir, ["config", "user.name", "RelateHandoff T4 Test"]);
  runGit(rootDir, ["config", "user.email", "t4@example.invalid"]);
  runGit(rootDir, ["config", "relatehandoff.repository", repoId]);
  fs.writeFileSync(path.join(rootDir, "README.md"), `# ${repoId}\n`, "utf8");
  fs.writeFileSync(
    path.join(rootDir, "smoke.test.mjs"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("smoke", () => assert.equal(1, 1));\n`,
    "utf8"
  );
  runGit(rootDir, ["add", "README.md", "smoke.test.mjs"]);
  runGit(rootDir, ["commit", "-m", "chore: initial commit"]);
  return {
    headSha: runGit(rootDir, ["rev-parse", "HEAD"]),
    branch: runGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

function resolveGitIndexPath(checkoutDir) {
  const relOrAbs = runGit(checkoutDir, ["rev-parse", "--git-path", "index"]);
  return path.resolve(checkoutDir, relOrAbs);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashDirectoryEntries(dir) {
  const entries = [];
  function walk(cur) {
    for (const name of fs.readdirSync(cur).sort()) {
      const full = path.join(cur, name);
      const rel = path.relative(dir, full).split(path.sep).join("/");
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        entries.push(`D:${rel}`);
        walk(full);
      } else {
        entries.push(`F:${rel}:${sha256File(full)}`);
      }
    }
  }
  walk(dir);
  return entries;
}

function hashDirectoryDigest(dir) {
  return crypto
    .createHash("sha256")
    .update(hashDirectoryEntries(dir).join("\n"), "utf8")
    .digest("hex");
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function runRecordCli({
  storeDir,
  repoDir,
  tmpRoot,
  name,
  payload,
  verifyProfile,
  supersedes,
  supersessionReason,
  expectSuccess = true,
}) {
  const inputJson = path.join(tmpRoot, `${name}.json`);
  fs.writeFileSync(inputJson, JSON.stringify(payload, null, 2), "utf8");
  const args = ["record", "--store", storeDir, "--repo", repoDir, "--input", inputJson];
  if (verifyProfile) {
    args.push("--verify", verifyProfile);
  }
  if (supersedes !== undefined) {
    args.push("--supersedes", supersedes);
  }
  if (supersessionReason !== undefined) {
    args.push("--supersession-reason", supersessionReason);
  }
  const res = runCli(args);
  if (expectSuccess) {
    assert.equal(res.status, 0, `CLI record (${name}) failed: ${res.stderr}`);
    return JSON.parse(res.stdout).recorded;
  }
  return res;
}

function runNodeScript(code) {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `Subprocess failed: ${res.stderr}`);
  return res;
}

function runCliAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ status: code, signal, stdout, stderr });
    });
  });
}

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

test("RH-LOCAL-T4 (real Git + Relate v1.0.1): linked Git worktree & detached HEAD preserve .git/index SHA-256 across read-only commands", () => {
  resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-worktree-"));
  try {
    const mainRepo = path.join(tmpRoot, "main-repo");
    const wtRepo = path.join(tmpRoot, "linked-wt");
    const storeDir = path.join(tmpRoot, "store");
    const repoId = "mrdzyn/rh-t4-worktree";

    initTempGitRepo(mainRepo, repoId);
    runGit(mainRepo, ["worktree", "add", "-b", "feat/wt-t4", wtRepo]);

    // Advance linked worktree commit independently from mainRepo
    fs.writeFileSync(path.join(wtRepo, "worktree.txt"), "linked worktree change\n", "utf8");
    runGit(wtRepo, ["add", "worktree.txt"]);
    runGit(wtRepo, ["commit", "-m", "feat: worktree commit"]);
    const wtSha = runGit(wtRepo, ["rev-parse", "HEAD"]);
    const wtBranch = runGit(wtRepo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    assert.equal(wtBranch, "feat/wt-t4");

    const payloadPath = path.join(tmpRoot, "wt-handoff.json");
    fs.writeFileSync(
      payloadPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        handoffId: "H-WT-1",
        taskId: "TASK-WT",
        repository: repoId,
        branch: wtBranch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: wtSha,
        summary: "Recorded inside linked Git worktree",
        nextAction: "Resume read-only from linked worktree",
        artifacts: ["worktree.txt"],
        evidence: [],
        createdAt: "2026-11-23T11:00:00Z",
      }),
      "utf8"
    );

    const recWt = runCli(["record", "--store", storeDir, "--repo", wtRepo, "--input", payloadPath]);
    assert.equal(recWt.status, 0, recWt.stderr);

    // Touch tracked file mtimes so git status without --no-optional-locks would rewrite index
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(wtRepo, "README.md"), future, future);
    fs.utimesSync(path.join(mainRepo, "README.md"), future, future);

    const mainIndexPath = resolveGitIndexPath(mainRepo);
    const wtIndexPath = resolveGitIndexPath(wtRepo);
    const beforeMainIndex = sha256File(mainIndexPath);
    const beforeWtIndex = sha256File(wtIndexPath);

    for (const args of [
      ["resume", "--store", storeDir, "--repo", wtRepo, "--task", "TASK-WT"],
      ["resume", "--store", storeDir, "--repo", wtRepo, "--task", "TASK-WT", "--format", "markdown"],
      ["list", "--store", storeDir, "--repo", wtRepo],
      ["list", "--store", storeDir, "--repo", wtRepo, "--format", "markdown"],
      ["doctor", "--store", storeDir, "--repo", wtRepo, "--json"],
    ]) {
      const res = runCli(args);
      assert.equal(res.status, 0, `${args.join(" ")} failed: ${res.stderr}`);
      if (args[0] === "resume" && !args.includes("markdown")) {
        const parsed = JSON.parse(res.stdout);
        assert.equal(parsed.handoff.handoffId, "H-WT-1");
        assert.equal(parsed.handoff.branch, "feat/wt-t4");
        assert.equal(parsed.freshness.metadataFreshness, "UNVERIFIED");
        assert.equal(parsed.gitState.headSha, wtSha);
      }
      if (args[0] === "doctor") {
        const doc = JSON.parse(res.stdout);
        assert.equal(doc.status, "PASS");
        assert.equal(doc.readOnly, true);
      }
    }

    assert.equal(sha256File(mainIndexPath), beforeMainIndex, "main .git/index must not mutate");
    assert.equal(sha256File(wtIndexPath), beforeWtIndex, "worktree index must not mutate");

    // Detach HEAD inside the linked worktree
    runGit(wtRepo, ["checkout", "--detach", "HEAD"]);
    const detachedBranch = runGit(wtRepo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    assert.equal(detachedBranch, "HEAD");

    // Recording with stale branch name on detached HEAD must fail closed
    const badDetached = runCli(["record", "--store", storeDir, "--repo", wtRepo, "--input", payloadPath]);
    assert.notEqual(badDetached.status, 0);
    assert.match(badDetached.stderr, /does not match checkout branch 'HEAD'/);

    const detachedPayloadPath = path.join(tmpRoot, "detached-handoff.json");
    fs.writeFileSync(
      detachedPayloadPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        handoffId: "H-DETACH-1",
        taskId: "TASK-WT",
        repository: repoId,
        branch: "HEAD",
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: wtSha,
        summary: "Recorded on detached HEAD",
        nextAction: "Verify detached HEAD read-only resume",
        artifacts: ["README.md"],
        evidence: [
          {
            id: "EV-1",
            kind: "test",
            command: "node --test",
            status: "PASS",
            headSha: wtSha,
            observedAt: "2026-11-23T11:05:00Z",
          },
        ],
        createdAt: "2026-11-23T11:05:00Z",
      }),
      "utf8"
    );

    const recDetached = runCli([
      "record",
      "--store",
      storeDir,
      "--repo",
      wtRepo,
      "--input",
      detachedPayloadPath,
      "--supersedes",
      "H-WT-1",
      "--supersession-reason",
      "Detached HEAD handoff",
    ]);
    assert.equal(recDetached.status, 0, recDetached.stderr);

    const future2 = new Date(Date.now() + 120_000);
    fs.utimesSync(path.join(wtRepo, "worktree.txt"), future2, future2);
    const beforeDetachedIndex = sha256File(wtIndexPath);

    const detachedResume = runCli([
      "resume",
      "--store",
      storeDir,
      "--repo",
      wtRepo,
      "--task",
      "TASK-WT",
    ]);
    assert.equal(detachedResume.status, 0, detachedResume.stderr);
    const parsedDetached = JSON.parse(detachedResume.stdout);
    assert.equal(parsedDetached.handoff.handoffId, "H-DETACH-1");
    assert.equal(parsedDetached.handoff.branch, "HEAD");
    assert.equal(parsedDetached.freshness.metadataFreshness, "CURRENT");

    const detachedList = runCli([
      "list",
      "--store",
      storeDir,
      "--repo",
      wtRepo,
      "--branch",
      "HEAD",
      "--status",
      "active",
    ]);
    assert.equal(detachedList.status, 0, detachedList.stderr);
    assert.deepEqual(
      JSON.parse(detachedList.stdout).handoffs.map((h) => h.handoffId),
      ["H-DETACH-1"]
    );

    const detachedDoctor = runCli(["doctor", "--store", storeDir, "--repo", wtRepo, "--json"]);
    assert.equal(detachedDoctor.status, 0, detachedDoctor.stderr);
    assert.equal(JSON.parse(detachedDoctor.stdout).status, "PASS");

    assert.equal(
      sha256File(wtIndexPath),
      beforeDetachedIndex,
      "detached HEAD worktree index must not mutate"
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 (real Relate v1.0.1): repository mismatch & cross-repo isolation across record, resume, and list", () => {
  resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-iso-"));
  try {
    const repoA = path.join(tmpRoot, "repo-a");
    const repoB = path.join(tmpRoot, "repo-b");
    const storeDir = path.join(tmpRoot, "shared-store");

    const gitA = initTempGitRepo(repoA, "mrdzyn/rh-t4-iso-a");
    const gitB = initTempGitRepo(repoB, "mrdzyn/rh-t4-iso-b");

    const aJson = path.join(tmpRoot, "a1.json");
    const bJson = path.join(tmpRoot, "b1.json");
    fs.writeFileSync(
      aJson,
      JSON.stringify({
        schemaVersion: "1.0.0",
        handoffId: "H-A1",
        taskId: "TASK-SHARED",
        repository: "mrdzyn/rh-t4-iso-a",
        branch: gitA.branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: gitA.headSha,
        summary: "Repo A confidential summary",
        nextAction: "Continue A",
        decisions: [{ id: "DEC-A", summary: "Only for repo A" }],
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-23T12:00:00Z",
      }),
      "utf8"
    );
    fs.writeFileSync(
      bJson,
      JSON.stringify({
        schemaVersion: "1.0.0",
        handoffId: "H-B1",
        taskId: "TASK-SHARED",
        repository: "mrdzyn/rh-t4-iso-b",
        branch: gitB.branch,
        sourceAgent: "claude",
        targetAgent: "gemini",
        headSha: gitB.headSha,
        summary: "Repo B confidential summary",
        nextAction: "Continue B",
        decisions: [{ id: "DEC-B", summary: "Only for repo B" }],
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-23T12:01:00Z",
      }),
      "utf8"
    );

    assert.equal(runCli(["record", "--store", storeDir, "--repo", repoA, "--input", aJson]).status, 0);
    assert.equal(runCli(["record", "--store", storeDir, "--repo", repoB, "--input", bJson]).status, 0);

    // 1. record mismatch: wrong payload repository or mismatched --repo-id
    const recWrongPayload = runCli(["record", "--store", storeDir, "--repo", repoA, "--input", bJson]);
    assert.equal(recWrongPayload.status, 1);
    assert.match(recWrongPayload.stderr, /does not match checkout repository/);

    const recWrongFlag = runCli([
      "record",
      "--store",
      storeDir,
      "--repo",
      repoA,
      "--repo-id",
      "mrdzyn/rh-t4-iso-b",
      "--input",
      aJson,
    ]);
    assert.equal(recWrongFlag.status, 1);
    assert.match(recWrongFlag.stderr, /Repository identity mismatch/);

    // 2. cross-repo supersession attempt fails closed
    const crossSupJson = path.join(tmpRoot, "b-cross-sup.json");
    fs.writeFileSync(
      crossSupJson,
      JSON.stringify({
        schemaVersion: "1.0.0",
        handoffId: "H-B2",
        taskId: "TASK-SHARED",
        repository: "mrdzyn/rh-t4-iso-b",
        branch: gitB.branch,
        sourceAgent: "claude",
        targetAgent: "codex",
        headSha: gitB.headSha,
        summary: "Attempt cross-repo supersession",
        nextAction: "Should fail",
        supersedesHandoffId: "H-A1",
      }),
      "utf8"
    );
    const crossSupRes = runCli(["record", "--store", storeDir, "--repo", repoB, "--input", crossSupJson]);
    assert.equal(crossSupRes.status, 1);
    assert.match(crossSupRes.stderr, /SupersessionError/);

    // 3. resume isolation: each repo sees only its own handoff; --handoff H-B1 from repoA returns null; --repo-id mismatch fails
    const resA = JSON.parse(
      runCli(["resume", "--store", storeDir, "--repo", repoA, "--task", "TASK-SHARED"]).stdout
    );
    const resB = JSON.parse(
      runCli(["resume", "--store", storeDir, "--repo", repoB, "--task", "TASK-SHARED"]).stdout
    );
    assert.equal(resA.handoff.handoffId, "H-A1");
    assert.deepEqual(resA.decisions, [{ id: "DEC-A", summary: "Only for repo A" }]);
    assert.equal(resB.handoff.handoffId, "H-B1");
    assert.deepEqual(resB.decisions, [{ id: "DEC-B", summary: "Only for repo B" }]);

    const crossHandoffRes = JSON.parse(
      runCli([
        "resume",
        "--store",
        storeDir,
        "--repo",
        repoA,
        "--task",
        "TASK-SHARED",
        "--handoff",
        "H-B1",
      ]).stdout
    );
    assert.equal(crossHandoffRes.handoff, null);
    assert.equal(crossHandoffRes.freshness.status, "UNVERIFIED");

    const resWrongRepoId = runCli([
      "resume",
      "--store",
      storeDir,
      "--repo",
      repoA,
      "--task",
      "TASK-SHARED",
      "--repo-id",
      "mrdzyn/rh-t4-iso-b",
    ]);
    assert.equal(resWrongRepoId.status, 1);
    assert.match(resWrongRepoId.stderr, /Repository identity mismatch/);

    // 4. list isolation
    const listA = JSON.parse(runCli(["list", "--store", storeDir, "--repo", repoA]).stdout);
    const listB = JSON.parse(runCli(["list", "--store", storeDir, "--repo", repoB]).stdout);
    assert.deepEqual(
      listA.handoffs.map((h) => h.handoffId),
      ["H-A1"]
    );
    assert.deepEqual(
      listB.handoffs.map((h) => h.handoffId),
      ["H-B1"]
    );

    const listWrongRepoId = runCli([
      "list",
      "--store",
      storeDir,
      "--repo",
      repoA,
      "--repo-id",
      "mrdzyn/rh-t4-iso-b",
    ]);
    assert.equal(listWrongRepoId.status, 1);
    assert.match(listWrongRepoId.stderr, /Repository identity mismatch/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 (real Relate v1.0.1): 4 concurrent parallel read-only readers exit 0 with deterministic outputs and unchanged store/index hashes", async () => {
  resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-concurrent-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    const { headSha, branch } = initTempGitRepo(repoDir, "mrdzyn/rh-t4-concurrent");

    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "conc-1",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-CONC-1",
        taskId: "TASK-CONC",
        repository: "mrdzyn/rh-t4-concurrent",
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha,
        summary: "Initial concurrent handoff",
        nextAction: "Supersede",
        decisions: [{ id: "D-1", summary: "First decision" }],
        artifacts: ["README.md"],
        evidence: [],
        createdAt: "2026-11-23T12:10:00Z",
      },
    });
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "conc-2",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-CONC-2",
        taskId: "TASK-CONC",
        repository: "mrdzyn/rh-t4-concurrent",
        branch,
        sourceAgent: "claude",
        targetAgent: "gemini",
        headSha,
        summary: "Active concurrent handoff",
        nextAction: "Read concurrently",
        decisions: [
          { id: "D-2", summary: "Second decision" },
          { id: "D-1", summary: "First decision" },
        ],
        artifacts: ["smoke.test.mjs", "README.md"],
        evidence: [
          {
            id: "EV-1",
            kind: "unit",
            command: "node --test",
            status: "PASS",
            headSha,
            observedAt: "2026-11-23T12:11:00Z",
          },
        ],
        createdAt: "2026-11-23T12:11:00Z",
        supersedesHandoffId: "H-CONC-1",
        supersessionReason: "Updated handoff",
      },
    });

    const cmds = [
      ["resume", "--store", storeDir, "--repo", repoDir, "--task", "TASK-CONC"],
      ["resume", "--store", storeDir, "--repo", repoDir, "--task", "TASK-CONC", "--format", "markdown"],
      ["list", "--store", storeDir, "--repo", repoDir, "--task", "TASK-CONC"],
      ["list", "--store", storeDir, "--repo", repoDir, "--task", "TASK-CONC", "--format", "markdown"],
    ];

    const expected = cmds.map((args) => {
      const res = runCli(args);
      assert.equal(res.status, 0, res.stderr);
      return res.stdout;
    });

    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(repoDir, "README.md"), future, future);
    const indexPath = resolveGitIndexPath(repoDir);
    const beforeStoreDigest = hashDirectoryDigest(storeDir);
    const beforeIndexDigest = sha256File(indexPath);

    const parallelResults = await Promise.all(cmds.map((args) => runCliAsync(args)));
    for (let i = 0; i < parallelResults.length; i++) {
      assert.equal(parallelResults[i].status, 0, `Parallel reader ${i} failed: ${parallelResults[i].stderr}`);
      assert.equal(parallelResults[i].stderr, "");
      assert.equal(parallelResults[i].stdout, expected[i], `Parallel reader ${i} output mismatch`);
    }

    assert.equal(hashDirectoryDigest(storeDir), beforeStoreDigest, "Store directory hash changed after concurrent reads");
    assert.equal(sha256File(indexPath), beforeIndexDigest, ".git/index hash changed after concurrent reads");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 (real Relate v1.0.1): read-only preservation proof across resume, list, and doctor on copied example-store", () => {
  resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-readonly-"));
  try {
    const storeCopy = path.join(tmpRoot, "example-store");
    const repoCopy = path.join(tmpRoot, "repo");
    fs.cpSync(path.join(REPO_ROOT, "examples", "example-store"), storeCopy, { recursive: true });
    initTempGitRepo(repoCopy, "example/relatehandoff");

    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(repoCopy, "README.md"), future, future);

    const indexPath = resolveGitIndexPath(repoCopy);
    const beforeEntries = hashDirectoryEntries(storeCopy);
    const beforeStoreDigest = hashDirectoryDigest(storeCopy);
    const beforeIndexDigest = sha256File(indexPath);

    const readOnlyCommands = [
      ["resume", "--store", storeCopy, "--repo", repoCopy, "--task", "RH-DEMO-1"],
      ["resume", "--store", storeCopy, "--repo", repoCopy, "--task", "RH-DEMO-1", "--format", "markdown"],
      ["list", "--store", storeCopy, "--repo", repoCopy],
      ["list", "--store", storeCopy, "--repo", repoCopy, "--format", "markdown"],
      ["doctor", "--store", storeCopy, "--repo", repoCopy, "--json"],
    ];

    for (const args of readOnlyCommands) {
      const res = runCli(args);
      assert.equal(res.status, 0, `${args.join(" ")} failed: ${res.stderr}`);
    }

    assert.deepEqual(hashDirectoryEntries(storeCopy), beforeEntries, "Every file in copied store must remain identical");
    assert.equal(hashDirectoryDigest(storeCopy), beforeStoreDigest);
    assert.equal(sha256File(indexPath), beforeIndexDigest);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 fault injection (fake): MCP partial line, invalid JSON, missing response ID, signal kill, and timeout fail closed", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-faults-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(storeDir, { recursive: true });
    initTempGitRepo(repoDir, "mrdzyn/rh-t4-faults");

    // 1a. Partial JSON line without trailing newline
    const partialLineFake = writeFakeRelateScript(
      tmpRoot,
      "relate-partial-no-nl",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
process.stdout.write('{"jsonrpc":"2.0","id":1');`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir,
          relateBin: partialLineFake,
          timeoutMs: 2000,
          requests: [
            { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
            { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_cypher", arguments: {} } },
          ],
        }),
      /Invalid JSON-RPC line 1/
    );

    // 1b. Complete JSON line without trailing newline and missing second batch response
    const singleNoNlFake = writeFakeRelateScript(
      tmpRoot,
      "relate-single-no-nl",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }] } }));`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "T1",
          relateBin: singleNoNlFake,
          timeoutMs: 2000,
        }),
      /Incomplete MCP batch response: expected 2, received 1/
    );

    // 2a. Invalid JSON line
    const invalidJsonLineFake = writeFakeRelateScript(
      tmpRoot,
      "relate-invalid-json",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
process.stdout.write("{invalid-json\\n");`
    );
    assert.throws(
      () =>
        listHandoffsViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          relateBin: invalidJsonLineFake,
          timeoutMs: 2000,
        }),
      /Invalid JSON-RPC line 1/
    );

    // 2b. Invalid JSON inside read_cypher content text
    const invalidContentJsonFake = writeFakeRelateScript(
      tmpRoot,
      "relate-invalid-content-json",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ text: "{not-json-payload" }] } }));`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "T1",
          relateBin: invalidContentJsonFake,
          timeoutMs: 2000,
        }),
      /Invalid JSON payload in MCP read_cypher result/
    );

    // 3. Missing response ID (2 responses returned, but request id 2 is absent)
    const missingIdFake = writeFakeRelateScript(
      tmpRoot,
      "relate-missing-id",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "read_cypher" }] } }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 999, result: { content: [{ text: JSON.stringify({ rows: [] }) }] } }));`
    );
    assert.throws(
      () =>
        listHandoffsViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          relateBin: missingIdFake,
          timeoutMs: 2000,
        }),
      /Incomplete MCP batch response: missing response for request id 2/
    );

    // 4. Signal kill
    const signalKillFake = writeFakeRelateScript(
      tmpRoot,
      "relate-sigkill",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
process.kill(process.pid, "SIGKILL");`
    );
    assert.throws(
      () =>
        resumeTaskViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          taskId: "T1",
          relateBin: signalKillFake,
          timeoutMs: 2000,
        }),
      /terminated by signal SIGKILL/
    );

    // 5. Timeout
    const timeoutFake = writeFakeRelateScript(
      tmpRoot,
      "relate-timeout",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
setTimeout(() => {}, 10000);`
    );
    const t0 = Date.now();
    assert.throws(
      () =>
        listHandoffsViaReadOnlyMcp({
          storeDir,
          repoRoot: repoDir,
          relateBin: timeoutFake,
          timeoutMs: 250,
        }),
      /timed out after 250ms/
    );
    assert.ok(Date.now() - t0 < 5000, "Timeout must fail fast");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 bounds (real Relate v1.0.1): 100 detail rows succeed; 101 rejected with BoundExceededError at write and read time", () => {
  resolveRelateCli();
  assert.equal(MAX_DETAIL_ROWS, 100);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-bounds-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    const repoId = "mrdzyn/rh-t4-bounds";
    const { headSha, branch } = initTempGitRepo(repoDir, repoId);

    const makeDecisions = (n) =>
      Array.from({ length: n }, (_, i) => ({ id: `D-${String(i).padStart(3, "0")}`, summary: `Dec ${i}` }));
    const makeArtifacts = (n) =>
      Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "README.md" : "smoke.test.mjs"));
    const makeEvidence = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: `EV-${String(i).padStart(3, "0")}`,
        kind: "unit",
        command: "node --test",
        status: "PASS",
        headSha,
        observedAt: "2026-11-23T12:20:00Z",
      }));

    // 100 decisions + 100 artifacts + 100 evidence succeed at write time and read time
    const ok = runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "bounds-100",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-100",
        taskId: "TASK-100",
        repository: repoId,
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha,
        summary: "Exactly 100 rows per detail type",
        nextAction: "Verify read-back",
        decisions: makeDecisions(100),
        artifacts: makeArtifacts(100),
        evidence: makeEvidence(100),
        createdAt: "2026-11-23T12:20:00Z",
      },
    });
    assert.equal(ok.decisions.length, 100);
    assert.equal(ok.artifacts.length, 100);
    assert.equal(ok.evidence.length, 100);

    const resumed100 = resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "TASK-100" });
    assert.equal(resumed100.decisions.length, 100);
    assert.equal(resumed100.artifacts.length, 100);
    assert.equal(resumed100.evidence.length, 100);

    // 101 rows rejected at write time (decisions, artifacts, evidence, and 100 + --verify runner evidence)
    for (const [label, overrides] of [
      ["101 decisions", { handoffId: "H-101-D", decisions: makeDecisions(101) }],
      ["101 artifacts", { handoffId: "H-101-A", artifacts: makeArtifacts(101) }],
      ["101 evidence", { handoffId: "H-101-E", evidence: makeEvidence(101) }],
      ["100 evidence + verify", { handoffId: "H-101-V", evidence: makeEvidence(100) }],
    ]) {
      assert.throws(
        () =>
          recordHandoff({
            storeDir,
            repoRoot: repoDir,
            validationProfile: label === "100 evidence + verify" ? "node-test-suite" : undefined,
            payload: {
              schemaVersion: "1.0.0",
              taskId: "TASK-100",
              repository: repoId,
              branch,
              sourceAgent: "codex",
              targetAgent: "claude",
              headSha,
              summary: label,
              nextAction: "Fail",
              ...overrides,
            },
          }),
        /BoundExceededError/,
        `Expected write-time BoundExceededError for ${label}`
      );
    }

    // Read-time BoundExceededError against real Relate v1.0.1 store (inject 101st Decision in separate process)
    runNodeScript(`
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(storeDir)});
      const conn = db.connect();
      conn.query(
        \`MATCH (h:Handoff {key: $handoffKey})
         CREATE (d:Decision {
           key: $dKey,
           id: 'D-101',
           repository: $repo,
           taskId: 'TASK-100',
           handoffId: 'H-100',
           summary: 'Overflow 101st decision'
         })
         CREATE (h)-[:DECIDED]->(d)\`,
        {
          handoffKey: ${JSON.stringify(`${repoId}::TASK-100::H-100`)},
          dKey: ${JSON.stringify(`${repoId}::TASK-100::H-100::D-101`)},
          repo: ${JSON.stringify(repoId)},
        }
      );
      db.checkpoint();
    `);
    assert.throws(
      () => resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "TASK-100" }),
      /BoundExceededError: decisions returned more than 100 rows/
    );

    // Read-time BoundExceededError for listHandoffsViaReadOnlyMcp (100 succeeds, 101 fails closed)
    const listStoreDir = path.join(tmpRoot, "list-bounds-store");
    runNodeScript(`
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(listStoreDir)});
      const conn = db.connect();
      conn.begin();
      conn.query(
        \`MERGE (r:Repository {name: $repo})
         MERGE (t:Task {key: $taskKey})
         ON CREATE SET t.id = 'TASK-LIST', t.repository = $repo
         MERGE (r)-[:OWNS_TASK]->(t)
         MERGE (sa:Agent {name: 'codex'})
         MERGE (ta:Agent {name: 'claude'})
         MERGE (c:Commit {sha: $headSha})\`,
        { repo: ${JSON.stringify(repoId)}, taskKey: ${JSON.stringify(`${repoId}::TASK-LIST`)}, headSha: ${JSON.stringify(headSha)} }
      );
      for (let i = 0; i < 100; i++) {
        const hid = \`HL-\${String(i).padStart(3, "0")}\`;
        conn.query(
          \`MATCH (t:Task {key: $taskKey}), (sa:Agent {name: 'codex'}), (ta:Agent {name: 'claude'}), (c:Commit {sha: $headSha})
           CREATE (h:Handoff {
             key: $hKey,
             id: $hid,
             repository: $repo,
             taskId: 'TASK-LIST',
             schemaVersion: '1.0.0',
             branch: $branch,
             headSha: $headSha,
             summary: 'Bounded handoff',
             nextAction: 'Next',
             createdAt: $createdAt,
             fingerprint: $hKey
           })
           CREATE (h)-[:HANDOFF_FOR]->(t)
           CREATE (h)-[:FROM_AGENT]->(sa)
           CREATE (h)-[:TO_AGENT]->(ta)
           CREATE (h)-[:TARGETS_HEAD]->(c)\`,
          {
            taskKey: ${JSON.stringify(`${repoId}::TASK-LIST`)},
            headSha: ${JSON.stringify(headSha)},
            hKey: \`\${${JSON.stringify(repoId)}}::TASK-LIST::\${hid}\`,
            hid,
            repo: ${JSON.stringify(repoId)},
            branch: ${JSON.stringify(branch)},
            createdAt: \`2026-11-23T12:\${String(Math.floor(i / 60)).padStart(2, "0")}:\${String(i % 60).padStart(2, "0")}Z\`,
          }
        );
      }
      conn.commit();
      db.checkpoint();
    `);

    const list100 = listHandoffsViaReadOnlyMcp({ storeDir: listStoreDir, repoRoot: repoDir });
    assert.equal(list100.handoffs.length, 100);
    assert.equal(list100.truncated, false);

    runNodeScript(`
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(listStoreDir)});
      const conn = db.connect();
      conn.query(
        \`MATCH (t:Task {key: $taskKey}), (sa:Agent {name: 'codex'}), (ta:Agent {name: 'claude'}), (c:Commit {sha: $headSha})
         CREATE (h:Handoff {
           key: $hKey,
           id: 'HL-100',
           repository: $repo,
           taskId: 'TASK-LIST',
           schemaVersion: '1.0.0',
           branch: $branch,
           headSha: $headSha,
           summary: 'Overflow 101st handoff',
           nextAction: 'Fail',
           createdAt: '2026-11-23T13:00:00Z',
           fingerprint: $hKey
         })
         CREATE (h)-[:HANDOFF_FOR]->(t)
         CREATE (h)-[:FROM_AGENT]->(sa)
         CREATE (h)-[:TO_AGENT]->(ta)
         CREATE (h)-[:TARGETS_HEAD]->(c)\`,
        {
          taskKey: ${JSON.stringify(`${repoId}::TASK-LIST`)},
          headSha: ${JSON.stringify(headSha)},
          hKey: ${JSON.stringify(`${repoId}::TASK-LIST::HL-100`)},
          repo: ${JSON.stringify(repoId)},
          branch: ${JSON.stringify(branch)},
        }
      );
      db.checkpoint();
    `);

    assert.throws(
      () => listHandoffsViaReadOnlyMcp({ storeDir: listStoreDir, repoRoot: repoDir }),
      /BoundExceededError: handoffs returned more than 100 rows/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T4 evidence authenticity (real Relate v1.0.1): tampered/unsigned never AUTHENTICATED/VERIFIED; SELF_ASSERTED stays UNVERIFIED; FAIL yields BLOCKED; advancing HEAD yields STALE", () => {
  resolveRelateCli();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t4-auth-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    const repoId = "mrdzyn/rh-t4-auth";
    const { headSha: shaA, branch } = initTempGitRepo(repoDir, repoId);

    // 1. SELF_ASSERTED PASS evidence stays UNVERIFIED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "auth-self",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-SELF",
        taskId: "TASK-AUTH",
        repository: repoId,
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: shaA,
        summary: "Self-asserted PASS",
        nextAction: "Check authenticity",
        evidence: [
          {
            id: "EV-SELF",
            kind: "unit",
            command: "node --test",
            status: "PASS",
            headSha: shaA,
            observedAt: "2026-11-23T12:30:00Z",
          },
        ],
        createdAt: "2026-11-23T12:30:00Z",
      },
    });
    const selfRes = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-AUTH",
      handoffId: "H-SELF",
    });
    assert.equal(selfRes.freshness.metadataFreshness, "CURRENT");
    assert.equal(selfRes.freshness.executionAuthenticity, "SELF_ASSERTED");
    assert.equal(selfRes.freshness.status, "UNVERIFIED");

    // 2. RUNNER_RECORDED_UNSIGNED without --verify stays UNVERIFIED, and tampering stored evidence never yields AUTHENTICATED/VERIFIED
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "auth-runner",
      verifyProfile: "node-test-suite",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-RUNNER",
        taskId: "TASK-AUTH",
        repository: repoId,
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: shaA,
        summary: "Runner recorded unsigned",
        nextAction: "Verify fail-closed read",
        evidence: [],
        createdAt: "2026-11-23T12:31:00Z",
      },
    });
    const unsignedRes = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-AUTH",
      handoffId: "H-RUNNER",
    });
    assert.equal(unsignedRes.freshness.metadataFreshness, "CURRENT");
    assert.equal(unsignedRes.freshness.executionAuthenticity, "UNVERIFIED");
    assert.equal(unsignedRes.freshness.status, "UNVERIFIED");

    // Tamper stored evidence in Relate store (change executionMode & attestationSha256 in separate process)
    runNodeScript(`
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(storeDir)});
      const conn = db.connect();
      conn.query(
        \`MATCH (e:Evidence {key: $eKey})
         SET e.executionMode = 'TRUSTED_LOCAL_RUNNER',
             e.attestationSha256 = $tamperedSha\`,
        {
          eKey: ${JSON.stringify(`${repoId}::TASK-AUTH::H-RUNNER::EV-RUNNER-1`)},
          tamperedSha: "f".repeat(64),
        }
      );
      db.checkpoint();
    `);
    const tamperedRes = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-AUTH",
      handoffId: "H-RUNNER",
    });
    assert.equal(tamperedRes.freshness.executionAuthenticity, "UNVERIFIED");
    assert.equal(tamperedRes.freshness.status, "UNVERIFIED");
    assert.notEqual(tamperedRes.freshness.executionAuthenticity, "AUTHENTICATED");
    assert.notEqual(tamperedRes.freshness.status, "VERIFIED");

    // 3. Failed evidence yields BLOCKED (even if --verify node-test-suite is supplied)
    runRecordCli({
      storeDir,
      repoDir,
      tmpRoot,
      name: "auth-fail",
      payload: {
        schemaVersion: "1.0.0",
        handoffId: "H-FAIL",
        taskId: "TASK-AUTH",
        repository: repoId,
        branch,
        sourceAgent: "codex",
        targetAgent: "claude",
        headSha: shaA,
        summary: "Failed evidence",
        nextAction: "Resolve failure",
        evidence: [
          {
            id: "EV-FAIL",
            kind: "unit",
            command: "node --test",
            status: "FAIL",
            headSha: shaA,
            observedAt: "2026-11-23T12:32:00Z",
          },
        ],
        createdAt: "2026-11-23T12:32:00Z",
      },
    });
    const failedRes = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-AUTH",
      handoffId: "H-FAIL",
      verifyProfile: "node-test-suite",
    });
    assert.equal(failedRes.freshness.executionAuthenticity, "FAILED");
    assert.equal(failedRes.freshness.status, "BLOCKED");

    // 4. Advancing HEAD yields STALE (even with --verify node-test-suite)
    fs.appendFileSync(path.join(repoDir, "README.md"), "advance head\n", "utf8");
    runGit(repoDir, ["add", "README.md"]);
    runGit(repoDir, ["commit", "-m", "feat: advance HEAD"]);

    const staleRes = resumeTaskViaReadOnlyMcp({
      storeDir,
      repoRoot: repoDir,
      taskId: "TASK-AUTH",
      handoffId: "H-RUNNER",
      verifyProfile: "node-test-suite",
    });
    assert.equal(staleRes.freshness.metadataFreshness, "STALE");
    assert.equal(staleRes.freshness.status, "STALE");
    assert.ok(staleRes.freshness.reasons.some((r) => r.startsWith("HEAD_SHA_MISMATCH")));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
