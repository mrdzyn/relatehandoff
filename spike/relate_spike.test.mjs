import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SYNTHETIC_SHA = "7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf";

function runNodeSubprocess(code, env = {}) {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return res;
}

function findRunnableRelateCli() {
  const candidates = [
    process.env.RELATE_BIN,
    "/tmp/relate-cargo/bin/relate",
    "relate",
  ].filter(Boolean);

  for (const bin of candidates) {
    const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (res.status === 0) {
      return { bin, version: res.stdout.trim() };
    }
  }
  return null;
}

test("RH-P1 spike: synthetic graph persists across process restart and enforces read-only retrieval", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-spike-"));
  const storeDir = path.join(tmpRoot, "handoff-store");

  try {
    // 1. Writer process: create directory store, write synthetic graph, checkpoint, exit.
    const writerCode = `
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(storeDir)});
      const conn = db.connect();
      const result = conn.query(
        \`CREATE (r:Repository {name: $repo})
         CREATE (t:Task {id: $taskId, title: $title})
         CREATE (c:Commit {sha: $sha})
         CREATE (h:Handoff {id: $handoffId, status: $status})
         CREATE (r)-[:OWNS_TASK]->(t)
         CREATE (h)-[:HANDOFF_FOR]->(t)
         CREATE (h)-[:TARGETS_HEAD]->(c)
         RETURN t.id AS taskId, h.id AS handoffId, c.sha AS sha\`,
        {
          repo: "mrdzyn/relatehandoff",
          taskId: "RH-P1",
          title: "Relate integration spike",
          sha: ${JSON.stringify(SYNTHETIC_SHA)},
          handoffId: "RH-P1-SPIKE-1",
          status: "VERIFIED"
        }
      );
      if (result.rows.length !== 1) {
        throw new Error("Expected 1 created row");
      }
      db.checkpoint();
    `;
    const writerRes = runNodeSubprocess(writerCode);
    assert.equal(writerRes.status, 0, `Writer failed: ${writerRes.stderr}`);

    // Verify expected Relate directory store files exist on disk.
    assert.ok(fs.existsSync(path.join(storeDir, "manifest.json")), "manifest.json should exist");
    assert.ok(fs.existsSync(path.join(storeDir, "nodes")), "nodes/ should exist");
    assert.ok(fs.existsSync(path.join(storeDir, "relationships")), "relationships/ should exist");
    assert.ok(fs.existsSync(path.join(storeDir, "wal")), "wal/ should exist");

    // 2. Separate reader process: reopen read-only, run multi-hop traversal, verify write refusal.
    const readerCode = `
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(storeDir)}, { readOnly: true });
      const conn = db.connect();
      const res = conn.query(
        \`MATCH (r:Repository)-[:OWNS_TASK]->(t:Task)<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit)
         WHERE t.id = $taskId
         RETURN r.name AS repo, t.id AS taskId, h.id AS handoffId, h.status AS status, c.sha AS sha\`,
        { taskId: "RH-P1" }
      );
      let writeError = null;
      try {
        conn.query("CREATE (:IllegalNode {x: 1})");
      } catch (err) {
        writeError = err.message;
      }
      console.log(JSON.stringify({ rows: res.rows, writeError }));
    `;
    const readerRes = runNodeSubprocess(readerCode);
    assert.equal(readerRes.status, 0, `Reader failed: ${readerRes.stderr}`);

    const parsed = JSON.parse(readerRes.stdout.trim());
    assert.deepEqual(parsed.rows, [
      {
        repo: "mrdzyn/relatehandoff",
        taskId: "RH-P1",
        handoffId: "RH-P1-SPIKE-1",
        status: "VERIFIED",
        sha: SYNTHETIC_SHA,
      },
    ]);
    assert.match(parsed.writeError ?? "", /WriteOnReadOnlyAccessDatabase/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("RH-P1 spike: Relate MCP stdio server enforces read-only tools and refuses writes", (t) => {
  const cli = findRunnableRelateCli();
  if (!cli) {
    if (process.env.RELATE_REQUIRE_CLI === "1") {
      assert.fail("RELATE_REQUIRE_CLI=1 set, but no runnable relate CLI found");
    }
    t.skip("No runnable relate CLI on PATH (prebuilt Linux binary requires GLIBC_2.39)");
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relatehandoff-mcp-"));
  const storeDir = path.join(tmpRoot, "handoff-store");

  try {
    // Seed via Node.js writer
    const seedRes = runNodeSubprocess(`
      import { Database } from "@relate/relate";
      const db = Database.open(${JSON.stringify(storeDir)});
      db.connect().query(
        "CREATE (h:Handoff {id: $id})-[:TARGETS_HEAD]->(c:Commit {sha: $sha})",
        { id: "RH-P1-MCP-1", sha: ${JSON.stringify(SYNTHETIC_SHA)} }
      );
      db.checkpoint();
    `);
    assert.equal(seedRes.status, 0, `Seed failed: ${seedRes.stderr}`);

    const requests = [
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "read_cypher",
          arguments: {
            statement:
              "MATCH (h:Handoff)-[:TARGETS_HEAD]->(c:Commit) WHERE h.id = $id RETURN h.id AS id, c.sha AS sha",
            parameters: { id: "RH-P1-MCP-1" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "read_cypher",
          arguments: {
            statement: "CREATE (:IllegalMcp {x: 1})",
            parameters: {},
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "write_cypher",
          arguments: {
            statement: "CREATE (:IllegalMcp {x: 1})",
            parameters: {},
          },
        },
      },
    ];

    const mcpRes = spawnSync(
      cli.bin,
      ["serve", "--mcp", "stdio", "--database", storeDir, "--read-only"],
      {
        input: requests.map((r) => JSON.stringify(r)).join("\n") + "\n",
        encoding: "utf8",
      }
    );
    assert.equal(mcpRes.status, 0, `MCP server failed: ${mcpRes.stderr}`);

    const responses = mcpRes.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(responses.length, 4);

    // id 1: tools/list must expose read_cypher and get_schema, NOT write_cypher
    const toolNames = responses[0].result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("read_cypher"));
    assert.ok(toolNames.includes("get_schema"));
    assert.ok(!toolNames.includes("write_cypher"));

    // id 2: read_cypher returns expected row
    assert.equal(responses[1].result.isError, false);
    const envelope = JSON.parse(responses[1].result.content[0].text);
    assert.deepEqual(envelope.rows, [{ id: "RH-P1-MCP-1", sha: SYNTHETIC_SHA }]);

    // id 3: write inside read_cypher is refused
    assert.equal(responses[2].result.isError, true);
    assert.match(responses[2].result.content[0].text, /Only MATCH queries are allowed/);

    // id 4: write_cypher is refused as unknown tool
    assert.equal(responses[3].result.isError, true);
    assert.match(responses[3].result.content[0].text, /unknown tool 'write_cypher'/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
