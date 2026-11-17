import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { runTrustedValidation } from "./attestation.mjs";
import { getGitState } from "./git.mjs";
import { evaluateFreshness } from "./freshness.mjs";
import { MAX_DETAIL_ROWS } from "./schema.mjs";

export { MAX_DETAIL_ROWS };
export const DEFAULT_MCP_TIMEOUT_MS = 15000;

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
    const res = spawnSync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      killSignal: "SIGKILL",
    });
    if (res.status === 0) {
      return { bin, version: res.stdout.trim() };
    }
    failures.push(`${bin}: ${res.stderr?.trim() || res.error?.message || `exit ${res.status}`}`);
  }

  throw new Error(
    `No runnable 'relate' CLI binary found for read-only MCP stdio. Tried: ${failures.join(" | ")}`
  );
}

export function callRelateMcpBatch({
  storeDir,
  requests,
  relateBin,
  timeoutMs = DEFAULT_MCP_TIMEOUT_MS,
}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error("callRelateMcpBatch requires a non-empty requests array");
  }
  const cli = resolveRelateCli(relateBin);
  const resolvedStore = path.resolve(storeDir);

  const res = spawnSync(
    cli.bin,
    ["serve", "--mcp", "stdio", "--database", resolvedStore, "--read-only"],
    {
      input: requests.map((req) => JSON.stringify(req)).join("\n") + "\n",
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    }
  );

  const stderrText = res.stderr?.trim() || "";
  const stdoutText = res.stdout?.trim() || "";

  if (res.error) {
    if (res.error.code === "ETIMEDOUT") {
      throw new Error(
        `relate serve --mcp stdio timed out after ${timeoutMs}ms (killed with SIGKILL)${stderrText ? `: ${stderrText}` : ""}`
      );
    }
    throw new Error(
      `relate serve --mcp stdio spawn error (${res.error.code || res.error.message})${stderrText ? `: ${stderrText}` : ""}`
    );
  }

  if (res.signal) {
    throw new Error(
      `relate serve --mcp stdio terminated by signal ${res.signal}${stderrText ? `: ${stderrText}` : ""}`
    );
  }

  if (res.status !== 0) {
    throw new Error(
      `relate serve --mcp stdio failed (exit ${res.status}): ${stderrText || stdoutText || "no output"}`
    );
  }

  const lines = (res.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const responses = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Invalid JSON-RPC line ${idx + 1} from relate serve --mcp stdio: ${err.message}${stderrText ? ` (stderr: ${stderrText})` : ""}`
      );
    }
  });

  if (responses.length < requests.length) {
    throw new Error(
      `Incomplete MCP batch response: expected ${requests.length}, received ${responses.length}${stderrText ? ` (stderr: ${stderrText})` : ""}`
    );
  }

  const expectedIds = new Set(requests.map((r) => r.id));
  const receivedIds = new Set(responses.map((r) => r?.id));
  for (const id of expectedIds) {
    if (!receivedIds.has(id)) {
      throw new Error(
        `Incomplete MCP batch response: missing response for request id ${id}${stderrText ? ` (stderr: ${stderrText})` : ""}`
      );
    }
  }

  return responses;
}

function parseReadCypherResult(rpcResponse) {
  if (!rpcResponse || typeof rpcResponse !== "object") {
    throw new Error("Missing or invalid MCP JSON-RPC response object");
  }
  if (rpcResponse.error) {
    throw new Error(`MCP JSON-RPC error: ${JSON.stringify(rpcResponse.error)}`);
  }
  if (rpcResponse.result?.isError) {
    const msg = rpcResponse.result?.content?.[0]?.text ?? "unknown MCP tool error";
    throw new Error(`MCP read_cypher refused: ${msg}`);
  }
  const text = rpcResponse.result?.content?.[0]?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("MCP read_cypher returned empty or missing content text");
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON payload in MCP read_cypher result: ${err.message}`);
  }
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
  timeoutMs = DEFAULT_MCP_TIMEOUT_MS,
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

  const initialResponses = callRelateMcpBatch({ storeDir, requests, relateBin, timeoutMs });
  const initialById = new Map(initialResponses.map((r) => [r.id, r]));
  const toolsResp = initialById.get(1);
  if (!toolsResp || toolsResp.error || toolsResp.result?.isError) {
    throw new Error(`MCP tools/list failed: ${JSON.stringify(toolsResp ?? null)}`);
  }
  const tools = (toolsResp.result?.tools ?? []).map((t) => t.name);
  if (tools.includes("write_cypher")) {
    throw new Error("Security violation: read-only MCP server exposed write_cypher");
  }
  if (!tools.includes("read_cypher")) {
    throw new Error("MCP server missing required read_cypher tool");
  }

  const handoffEnvelope = parseReadCypherResult(initialById.get(2));
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

  const detailResponses = callRelateMcpBatch({
    storeDir,
    requests: detailRequests,
    relateBin,
    timeoutMs,
  });
  const detailById = new Map(detailResponses.map((r) => [r.id, r]));
  const evidence = assertBoundedRows(parseReadCypherResult(detailById.get(3)).rows ?? [], "evidence");
  const artifacts = assertBoundedRows(
    parseReadCypherResult(detailById.get(4)).rows ?? [],
    "artifacts"
  ).map((r) => r.path);
  const decisions = assertBoundedRows(parseReadCypherResult(detailById.get(5)).rows ?? [], "decisions");

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
