import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { runTrustedValidation } from "./attestation.mjs";
import { sanitizeDiagnosticText } from "./doctor.mjs";
import { getGitState } from "./git.mjs";
import { evaluateFreshness } from "./freshness.mjs";
import { canonicalizeResumeResult, compareCodeUnits } from "./resume_format.mjs";
import { ID_RE, MAX_DETAIL_ROWS } from "./schema.mjs";

export { MAX_DETAIL_ROWS };
export const DEFAULT_MCP_TIMEOUT_MS = 15000;
export const MIN_MCP_TIMEOUT_MS = 100;
export const MAX_MCP_TIMEOUT_MS = 120000;
export const MAX_MCP_BUFFER_BYTES = 10 * 1024 * 1024;

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
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_MCP_TIMEOUT_MS || timeoutMs > MAX_MCP_TIMEOUT_MS) {
    throw new Error(
      `Invalid timeoutMs '${timeoutMs}': expected integer in [${MIN_MCP_TIMEOUT_MS}, ${MAX_MCP_TIMEOUT_MS}]`
    );
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
      maxBuffer: MAX_MCP_BUFFER_BYTES,
      shell: false,
    }
  );

  const stderrText = sanitizeDiagnosticText(res.stderr || "");
  const stdoutText = sanitizeDiagnosticText(res.stdout || "");

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

  if (lines.length === 0) {
    throw new Error(
      `Unexpected EOF from relate serve --mcp stdio: empty stdout${stderrText ? ` (stderr: ${stderrText})` : ""}`
    );
  }

  const seenIds = new Set();
  const responses = lines.map((line, idx) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Invalid JSON-RPC line ${idx + 1} from relate serve --mcp stdio: ${err.message}${stderrText ? ` (stderr: ${stderrText})` : ""}`
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid JSON-RPC line ${idx + 1}: expected JSON object`);
    }
    if (parsed.id !== undefined) {
      if (seenIds.has(parsed.id)) {
        throw new Error(`Duplicate JSON-RPC response id ${parsed.id} from relate serve --mcp stdio`);
      }
      seenIds.add(parsed.id);
    }
    return parsed;
  });

  if (responses.length < requests.length) {
    throw new Error(
      `Incomplete MCP batch response: expected ${requests.length}, received ${responses.length}${stderrText ? ` (stderr: ${stderrText})` : ""}`
    );
  }

  const expectedIds = new Set(requests.map((r) => r.id));
  for (const id of expectedIds) {
    if (!seenIds.has(id)) {
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

function assertReadOnlyMcpTools(toolsResp) {
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
  return tools;
}

const VALID_LIFECYCLE_STATUSES = new Set(["active", "superseded", "all"]);

export function resumeTaskViaReadOnlyMcp({
  storeDir,
  repoRoot,
  taskId,
  handoffId = null,
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

  let selectedHandoffId = null;
  if (handoffId !== null && handoffId !== undefined) {
    const trimmed = String(handoffId).trim();
    if (!ID_RE.test(trimmed)) {
      throw new Error("Invalid handoffId: must match ^[A-Za-z0-9._-]{1,128}$");
    }
    selectedHandoffId = trimmed;
  }

  const taskKey = `${gitState.repository}::${taskId}`;
  const handoffKey = selectedHandoffId ? `${taskKey}::${selectedHandoffId}` : null;
  const statement = handoffKey
    ? `MATCH (r:Repository {name: $repository})-[:OWNS_TASK]->(t:Task {key: $taskKey})<-[:HANDOFF_FOR]-(h:Handoff {key: $handoffKey})-[:TARGETS_HEAD]->(c:Commit),
       (h)-[:FROM_AGENT]->(sa:Agent),
       (h)-[:TO_AGENT]->(ta:Agent)
OPTIONAL MATCH (h)-[s:SUPERSEDES]->(prev:Handoff)
OPTIONAL MATCH (next:Handoff)-[:SUPERSEDES]->(h)
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
       ta.name AS targetAgent,
       prev.id AS supersedesHandoffId,
       next.id AS supersededByHandoffId,
       s.reason AS supersessionReason
LIMIT 1`
    : `MATCH (r:Repository {name: $repository})-[:OWNS_TASK]->(t:Task {key: $taskKey})<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit),
       (h)-[:FROM_AGENT]->(sa:Agent),
       (h)-[:TO_AGENT]->(ta:Agent)
OPTIONAL MATCH (h)-[s:SUPERSEDES]->(prev:Handoff)
OPTIONAL MATCH (next:Handoff)-[:SUPERSEDES]->(h)
WITH r, t, h, c, sa, ta, prev, next, s
WHERE next IS NULL
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
       ta.name AS targetAgent,
       prev.id AS supersedesHandoffId,
       next.id AS supersededByHandoffId,
       s.reason AS supersessionReason
ORDER BY h.createdAt DESC, h.id DESC
LIMIT 1`;
  const parameters = handoffKey
    ? { repository: gitState.repository, taskKey, handoffKey }
    : { repository: gitState.repository, taskKey };

  const requests = [
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: {
          statement,
          parameters,
        },
      },
    },
  ];

  const initialResponses = callRelateMcpBatch({ storeDir, requests, relateBin, timeoutMs });
  const initialById = new Map(initialResponses.map((r) => [r.id, r]));
  const tools = assertReadOnlyMcpTools(initialById.get(1));

  const handoffEnvelope = parseReadCypherResult(initialById.get(2));
  const rawHandoff = handoffEnvelope.rows?.[0] ?? null;

  if (!rawHandoff) {
    const freshness = evaluateFreshness({
      handoff: null,
      evidenceList: [],
      gitState,
      remoteVerified,
    });
    return canonicalizeResumeResult({
      tools,
      handoff: null,
      evidence: [],
      artifacts: [],
      decisions: [],
      gitState,
      freshness,
    });
  }

  if (rawHandoff.repository !== gitState.repository) {
    throw new Error(
      `Repository isolation violation: retrieved '${rawHandoff.repository}', expected '${gitState.repository}'`
    );
  }

  const handoff = {
    ...rawHandoff,
    supersedesHandoffId: rawHandoff.supersedesHandoffId ?? null,
    supersededByHandoffId: rawHandoff.supersededByHandoffId ?? null,
    supersessionReason: rawHandoff.supersessionReason ?? null,
    lifecycleStatus: rawHandoff.supersededByHandoffId ? "SUPERSEDED" : "ACTIVE",
  };

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
  const evidence = assertBoundedRows(parseReadCypherResult(detailById.get(3)).rows ?? [], "evidence")
    .sort((a, b) => compareCodeUnits(a?.id, b?.id) || compareCodeUnits(a?.headSha, b?.headSha));
  const artifacts = assertBoundedRows(
    parseReadCypherResult(detailById.get(4)).rows ?? [],
    "artifacts"
  )
    .map((r) => r.path)
    .sort(compareCodeUnits);
  const decisions = assertBoundedRows(parseReadCypherResult(detailById.get(5)).rows ?? [], "decisions")
    .sort((a, b) => compareCodeUnits(a?.id, b?.id) || compareCodeUnits(a?.summary, b?.summary));

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

  return canonicalizeResumeResult({
    tools,
    handoff,
    evidence,
    artifacts,
    decisions,
    gitState,
    inProcessVerification,
    freshness,
  });
}

/**
 * List handoffs for the established repository via read-only Relate MCP with optional filters.
 */
export function listHandoffsViaReadOnlyMcp({
  storeDir,
  repoRoot,
  taskId = null,
  repository,
  status = "all",
  branch = null,
  agent = null,
  limit = MAX_DETAIL_ROWS,
  relateBin,
  timeoutMs = DEFAULT_MCP_TIMEOUT_MS,
}) {
  if (!VALID_LIFECYCLE_STATUSES.has(status)) {
    throw new Error(`Invalid status filter '${status}': expected active, superseded, or all`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DETAIL_ROWS) {
    throw new Error(`Invalid limit '${limit}': must be an integer between 1 and ${MAX_DETAIL_ROWS}`);
  }

  const gitState = getGitState(repoRoot, { repository });
  if (!gitState.repository) {
    throw new Error(
      "Repository identity is not established for list: configure git remote 'origin', 'relatehandoff.repository', or pass repository"
    );
  }

  const normalizedTaskId = taskId !== null && taskId !== undefined ? String(taskId).trim() : null;
  if (normalizedTaskId !== null && !ID_RE.test(normalizedTaskId)) {
    throw new Error("Invalid taskId filter: must match ^[A-Za-z0-9._-]{1,128}$");
  }
  const normalizedBranch = branch !== null && branch !== undefined ? String(branch).trim() : null;
  if (normalizedBranch !== null && normalizedBranch.length === 0) {
    throw new Error("Invalid branch filter: must be non-empty");
  }
  const normalizedAgent = agent !== null && agent !== undefined ? String(agent).trim() : null;
  if (normalizedAgent !== null && normalizedAgent.length === 0) {
    throw new Error("Invalid agent filter: must be non-empty");
  }

  const parameters = { repository: gitState.repository };
  const predicates = [];
  if (normalizedTaskId !== null) {
    parameters.taskKey = `${gitState.repository}::${normalizedTaskId}`;
    predicates.push("t.key = $taskKey");
  }
  if (normalizedBranch !== null) {
    parameters.branch = normalizedBranch;
    predicates.push("h.branch = $branch");
  }
  if (normalizedAgent !== null) {
    parameters.agent = normalizedAgent;
    predicates.push("(sa.name = $agent OR ta.name = $agent)");
  }
  if (status === "active") {
    predicates.push("next IS NULL");
  } else if (status === "superseded") {
    predicates.push("next IS NOT NULL");
  }

  const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}\n` : "";
  const statement = `MATCH (r:Repository {name: $repository})-[:OWNS_TASK]->(t:Task)<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit),
       (h)-[:FROM_AGENT]->(sa:Agent),
       (h)-[:TO_AGENT]->(ta:Agent)
OPTIONAL MATCH (h)-[s:SUPERSEDES]->(prev:Handoff)
OPTIONAL MATCH (next:Handoff)-[:SUPERSEDES]->(h)
WITH r, t, h, c, sa, ta, prev, next, s
${whereClause}RETURN r.name AS repository,
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
       ta.name AS targetAgent,
       prev.id AS supersedesHandoffId,
       next.id AS supersededByHandoffId,
       s.reason AS supersessionReason
ORDER BY h.createdAt DESC, h.id DESC
LIMIT ${MAX_DETAIL_ROWS + 1}`;

  const requests = [
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: { statement, parameters },
      },
    },
  ];

  const responses = callRelateMcpBatch({ storeDir, requests, relateBin, timeoutMs });
  const byId = new Map(responses.map((r) => [r.id, r]));
  const tools = assertReadOnlyMcpTools(byId.get(1));
  const rawRows = assertBoundedRows(parseReadCypherResult(byId.get(2)).rows ?? [], "handoffs");

  const mapped = rawRows.map((row) => {
    if (row.repository !== gitState.repository) {
      throw new Error(
        `Repository isolation violation: retrieved '${row.repository}', expected '${gitState.repository}'`
      );
    }
    return {
      ...row,
      supersedesHandoffId: row.supersedesHandoffId ?? null,
      supersededByHandoffId: row.supersededByHandoffId ?? null,
      supersessionReason: row.supersessionReason ?? null,
      lifecycleStatus: row.supersededByHandoffId ? "SUPERSEDED" : "ACTIVE",
    };
  });

  mapped.sort(
    (a, b) =>
      compareCodeUnits(b.createdAt, a.createdAt) ||
      compareCodeUnits(b.handoffId, a.handoffId) ||
      compareCodeUnits(a.taskId, b.taskId) ||
      compareCodeUnits(a.handoffKey, b.handoffKey)
  );

  return {
    tools,
    repository: gitState.repository,
    filters: {
      taskId: normalizedTaskId,
      status,
      branch: normalizedBranch,
      agent: normalizedAgent,
      limit,
    },
    totalMatched: mapped.length,
    truncated: mapped.length > limit,
    handoffs: mapped.slice(0, limit),
    gitState: {
      ...gitState,
      dirtyFiles: [...(gitState.dirtyFiles || [])].sort(compareCodeUnits),
    },
  };
}

/**
 * Probe a local Relate stdio MCP server to verify read-only enforcement and write refusals.
 */
export function verifyReadOnlyMcpServer({
  storeDir,
  relateBin,
  timeoutMs = DEFAULT_MCP_TIMEOUT_MS,
}) {
  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "relatehandoff-mcp-probe", version: "0.1.0" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "write_cypher",
        arguments: { statement: "CREATE (n:ForbiddenProbe {x: 1}) RETURN n" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "read_cypher",
        arguments: { statement: "CREATE (n:ForbiddenProbe {x: 1}) RETURN n" },
      },
    },
  ];

  const responses = callRelateMcpBatch({ storeDir, requests, relateBin, timeoutMs });
  const byId = new Map(responses.map((r) => [r.id, r]));

  const initResp = byId.get(1);
  if (!initResp || initResp.error || !initResp.result || typeof initResp.result !== "object") {
    throw new Error(`MCP initialize failed during read-only probe: ${JSON.stringify(initResp ?? null)}`);
  }

  const tools = assertReadOnlyMcpTools(byId.get(2));

  const writeToolResp = byId.get(3);
  const writeCypherRefused = Boolean(writeToolResp && (writeToolResp.error || writeToolResp.result?.isError));
  if (!writeCypherRefused) {
    throw new Error("Security violation: write_cypher was not refused by read-only MCP server");
  }

  const readWriteResp = byId.get(4);
  const readCypherWriteRefused = Boolean(readWriteResp && (readWriteResp.error || readWriteResp.result?.isError));
  if (!readCypherWriteRefused) {
    throw new Error("Security violation: read_cypher accepted a CREATE write query");
  }

  return {
    ok: true,
    readOnlyVerified: true,
    tools,
    writeCypherRefused,
    readCypherWriteRefused,
    snapshotNote:
      "Relate v1.0.1 stdio MCP retains an open-time snapshot; restart persistent MCP hosts or use short-lived `relatehandoff resume`/`list` calls after external writes.",
  };
}
