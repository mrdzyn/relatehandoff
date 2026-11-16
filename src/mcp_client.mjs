import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { runTrustedValidation } from "./attestation.mjs";
import { getGitState } from "./git.mjs";
import { evaluateFreshness } from "./freshness.mjs";
import { MAX_DETAIL_ROWS } from "./schema.mjs";

export { MAX_DETAIL_ROWS };

export function resolveRelateCli(explicitBin) {
  const candidates = [
    explicitBin,
    process.env.RELATE_BIN,
    path.join(os.homedir(), ".cargo/bin/relate"),
    "/tmp/relate-cargo/bin/relate",
    "relate",
  ].filter(Boolean);

  const failures = [];
  for (const bin of candidates) {
    const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (res.status === 0) {
      return { bin, version: res.stdout.trim() };
    }
    failures.push(`${bin}: ${res.stderr?.trim() || res.error?.message || `exit ${res.status}`}`);
  }

  throw new Error(
    `No runnable 'relate' CLI binary found for read-only MCP stdio. Tried: ${failures.join(" | ")}`
  );
}

export function callRelateMcpBatch({ storeDir, requests, relateBin }) {
  const cli = resolveRelateCli(relateBin);
  const resolvedStore = path.resolve(storeDir);

  const res = spawnSync(
    cli.bin,
    ["serve", "--mcp", "stdio", "--database", resolvedStore, "--read-only"],
    {
      input: requests.map((req) => JSON.stringify(req)).join("\n") + "\n",
      encoding: "utf8",
    }
  );

  if (res.status !== 0) {
    throw new Error(
      `relate serve --mcp stdio failed (exit ${res.status}): ${res.stderr?.trim() || res.stdout?.trim()}`
    );
  }

  const lines = res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line));
}

function parseReadCypherResult(rpcResponse) {
  if (rpcResponse.error) {
    throw new Error(`MCP JSON-RPC error: ${JSON.stringify(rpcResponse.error)}`);
  }
  if (rpcResponse.result?.isError) {
    const msg = rpcResponse.result?.content?.[0]?.text ?? "unknown MCP tool error";
    throw new Error(`MCP read_cypher refused: ${msg}`);
  }
  const text = rpcResponse.result?.content?.[0]?.text ?? "{}";
  return JSON.parse(text);
}

function assertBoundedRows(rows, label) {
  if (rows.length > MAX_DETAIL_ROWS) {
    throw new Error(
      `BoundExceededError: ${label} returned more than ${MAX_DETAIL_ROWS} rows; failing closed`
    );
  }
  return rows;
}

export function resumeTaskViaReadOnlyMcp({
  storeDir,
  repoRoot,
  taskId,
  repository,
  remoteVerified = false,
  verifyProfile = null,
  relateBin,
}) {
  const gitState = getGitState(repoRoot, { repository });
  if (!gitState.repository) {
    throw new Error(
      "Repository identity is not established for resume: configure git remote 'origin', 'relatehandoff.repository', or pass repository"
    );
  }

  const taskKey = `${gitState.repository}::${taskId}`;
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: {
          statement: `MATCH (r:Repository {name: $repository})-[:OWNS_TASK]->(t:Task {key: $taskKey})<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit),
       (h)-[:FROM_AGENT]->(sa:Agent),
       (h)-[:TO_AGENT]->(ta:Agent)
RETURN r.name AS repository,
       t.id AS taskId,
       h.key AS handoffKey,
       h.id AS handoffId,
       h.schemaVersion AS schemaVersion,
       h.branch AS branch,
       h.summary AS summary,
       h.nextAction AS nextAction,
       h.createdAt AS createdAt,
       c.sha AS headSha,
       sa.name AS sourceAgent,
       ta.name AS targetAgent
ORDER BY h.createdAt DESC
LIMIT 1`,
          parameters: { repository: gitState.repository, taskKey },
        },
      },
    },
  ];

  const initialResponses = callRelateMcpBatch({ storeDir, requests, relateBin });
  const tools = (initialResponses[0]?.result?.tools ?? []).map((t) => t.name);
  if (tools.includes("write_cypher")) {
    throw new Error("Security violation: read-only MCP server exposed write_cypher");
  }
  if (!tools.includes("read_cypher")) {
    throw new Error("MCP server missing required read_cypher tool");
  }

  const handoffEnvelope = parseReadCypherResult(initialResponses[1]);
  const handoff = handoffEnvelope.rows?.[0] ?? null;

  if (!handoff) {
    const freshness = evaluateFreshness({
      handoff: null,
      evidenceList: [],
      gitState,
      remoteVerified,
    });
    return { tools, handoff: null, evidence: [], artifacts: [], decisions: [], gitState, freshness };
  }

  if (handoff.repository !== gitState.repository) {
    throw new Error(
      `Repository isolation violation: retrieved '${handoff.repository}', expected '${gitState.repository}'`
    );
  }

  const detailLimit = MAX_DETAIL_ROWS + 1;
  const detailRequests = [
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: {
          statement: `MATCH (h:Handoff {key: $handoffKey})-[:PROVEN_BY]->(e:Evidence)-[:AT_COMMIT]->(c:Commit)
RETURN e.id AS id,
       e.kind AS kind,
       e.command AS command,
       e.status AS status,
       c.sha AS headSha,
       e.observedAt AS observedAt,
       e.executionMode AS executionMode,
       e.validationProfile AS validationProfile,
       e.exitCode AS exitCode,
       e.attestationSha256 AS attestationSha256
ORDER BY e.id
LIMIT ${detailLimit}`,
          parameters: { handoffKey: handoff.handoffKey },
        },
      },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: {
          statement: `MATCH (h:Handoff {key: $handoffKey})-[:CITES]->(a:Artifact)
RETURN a.path AS path
ORDER BY a.path
LIMIT ${detailLimit}`,
          parameters: { handoffKey: handoff.handoffKey },
        },
      },
    },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: {
          statement: `MATCH (h:Handoff {key: $handoffKey})-[:DECIDED]->(d:Decision)
RETURN d.id AS id, d.summary AS summary
ORDER BY d.id
LIMIT ${detailLimit}`,
          parameters: { handoffKey: handoff.handoffKey },
        },
      },
    },
  ];

  const detailResponses = callRelateMcpBatch({ storeDir, requests: detailRequests, relateBin });
  const evidence = assertBoundedRows(parseReadCypherResult(detailResponses[0]).rows ?? [], "evidence");
  const artifacts = assertBoundedRows(
    parseReadCypherResult(detailResponses[1]).rows ?? [],
    "artifacts"
  ).map((r) => r.path);
  const decisions = assertBoundedRows(parseReadCypherResult(detailResponses[2]).rows ?? [], "decisions");

  let inProcessVerification = null;
  if (
    verifyProfile &&
    handoff.headSha === gitState.headSha &&
    !gitState.isDirty &&
    !evidence.some((e) => e.status === "FAIL" || e.headSha !== gitState.headSha)
  ) {
    inProcessVerification = runTrustedValidation({
      repoRoot: gitState.repoRoot,
      repository: gitState.repository,
      headSha: gitState.headSha,
      validationProfile: verifyProfile,
    });
  }

  const freshness = evaluateFreshness({
    handoff,
    evidenceList: evidence,
    gitState,
    remoteVerified,
    inProcessVerification,
  });

  return {
    tools,
    handoff,
    evidence,
    artifacts,
    decisions,
    gitState,
    inProcessVerification,
    freshness,
  };
}
