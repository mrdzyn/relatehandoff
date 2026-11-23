import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  callRelateMcpBatch,
  resolveRelateCli,
  resumeTaskViaReadOnlyMcp,
  verifyReadOnlyMcpServer,
} from "../src/mcp_client.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "src", "cli.mjs");

function writeFakeRelate(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return p;
}

test("RH-LOCAL-T3 (real Relate v1.0.1): verifyReadOnlyMcpServer confirms read-only tools and refuses writes", () => {
  const cli = resolveRelateCli();
  assert.ok(cli.bin);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t3-real-"));
  try {
    const storeCopy = path.join(tmpRoot, "store");
    fs.cpSync(path.join(REPO_ROOT, "examples", "example-store"), storeCopy, { recursive: true });
    const res = verifyReadOnlyMcpServer({ storeDir: storeCopy });
    assert.equal(res.ok, true);
    assert.equal(res.readOnlyVerified, true);
    assert.deepEqual(res.tools, ["read_cypher", "get_schema"]);
    assert.equal(res.writeCypherRefused, true);
    assert.equal(res.readCypherWriteRefused, true);
    assert.match(res.snapshotNote, /open-time snapshot/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T3 (real Relate v1.0.1): short-lived resume sees new record immediately after external write", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t3-fresh-"));
  try {
    const repoDir = path.join(tmpRoot, "repo");
    const storeDir = path.join(tmpRoot, "store");
    fs.mkdirSync(repoDir, { recursive: true });
    const git = (args) =>
      execFileSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git(["init"]);
    git(["config", "user.name", "T3 Test"]);
    git(["config", "user.email", "t3@example.invalid"]);
    git(["config", "relatehandoff.repository", "mrdzyn/rh-t3-fresh"]);
    fs.writeFileSync(path.join(repoDir, "README.md"), "t3\n");
    git(["add", "README.md"]);
    git(["commit", "-m", "init"]);
    const headSha = git(["rev-parse", "HEAD"]);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

    const recordOne = (id, createdAt) => {
      const p = path.join(tmpRoot, `${id}.json`);
      fs.writeFileSync(
        p,
        JSON.stringify({
          schemaVersion: "1.0.0",
          handoffId: id,
          taskId: "T3-TASK",
          repository: "mrdzyn/rh-t3-fresh",
          branch,
          sourceAgent: "codex",
          targetAgent: "claude",
          headSha,
          summary: `Summary ${id}`,
          nextAction: `Next ${id}`,
          createdAt,
        })
      );
      const r = spawnSync(
        process.execPath,
        [CLI_PATH, "record", "--store", storeDir, "--repo", repoDir, "--input", p],
        { encoding: "utf8" }
      );
      assert.equal(r.status, 0, r.stderr);
    };

    recordOne("H-1", "2026-11-23T12:00:00Z");
    assert.equal(resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "T3-TASK" }).handoff.handoffId, "H-1");

    recordOne("H-2", "2026-11-23T12:01:00Z");
    assert.equal(resumeTaskViaReadOnlyMcp({ storeDir, repoRoot: repoDir, taskId: "T3-TASK" }).handoff.handoffId, "H-2");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-LOCAL-T3 (fake): enforces timeout/SIGKILL cleanup, unexpected EOF, duplicate IDs, non-object lines, and stderr redaction", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rh-t3-fake-"));
  try {
    // 1. Invalid timeoutMs rejected
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir: tmpRoot,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
          timeoutMs: 10,
        }),
      /Invalid timeoutMs/
    );

    // 2. Timeout kills child process with SIGKILL and leaves no lingering PID
    const pidFile = path.join(tmpRoot, "child.pid");
    const slowFake = writeFakeRelate(
      tmpRoot,
      "relate-slow",
      `const fs = require("node:fs");
if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setTimeout(() => {}, 10000);`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir: tmpRoot,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
          relateBin: slowFake,
          timeoutMs: 150,
        }),
      /timed out after 150ms \(killed with SIGKILL\)/
    );
    const childPid = Number(fs.readFileSync(pidFile, "utf8"));
    let alive = true;
    try {
      process.kill(childPid, 0);
    } catch {
      alive = false;
    }
    assert.equal(alive, false, "Timed-out MCP child process must be dead");

    // 3. Unexpected EOF (status 0, empty stdout)
    const eofFake = writeFakeRelate(
      tmpRoot,
      "relate-eof",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir: tmpRoot,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
          relateBin: eofFake,
        }),
      /Unexpected EOF/
    );

    // 4. Non-object JSON-RPC line
    const arrFake = writeFakeRelate(
      tmpRoot,
      "relate-arr",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log("[1,2,3]");`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir: tmpRoot,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
          relateBin: arrFake,
        }),
      /expected JSON object/
    );

    // 5. Duplicate JSON-RPC response id
    const dupFake = writeFakeRelate(
      tmpRoot,
      "relate-dup",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));`
    );
    assert.throws(
      () =>
        callRelateMcpBatch({
          storeDir: tmpRoot,
          requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
          relateBin: dupFake,
        }),
      /Duplicate JSON-RPC response id 1/
    );

    // 6. Secret-bearing stderr is redacted before error formatting
    const secretFake = writeFakeRelate(
      tmpRoot,
      "relate-sec",
      `if (process.argv.includes("--version")) { console.log("relate-fake 1.0.1"); process.exit(0); }
console.error("fatal ghp_secretFakeToken1234567890abcd");
process.exit(1);`
    );
    let caught = "";
    try {
      callRelateMcpBatch({
        storeDir: tmpRoot,
        requests: [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }],
        relateBin: secretFake,
      });
    } catch (err) {
      caught = err.message;
    }
    assert.match(caught, /\[REDACTED\]/);
    assert.ok(!caught.includes("ghp_secretFakeToken1234567890abcd"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
