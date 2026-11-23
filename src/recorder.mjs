import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Database } from "@relate/relate";
import { runTrustedValidation } from "./attestation.mjs";
import { getGitState } from "./git.mjs";
import { MAX_DETAIL_ROWS, validateHandoffPayload } from "./schema.mjs";

function canonicalFingerprint(validated) {
  const canonical = {
    schemaVersion: validated.schemaVersion,
    handoffId: validated.handoffId,
    taskId: validated.taskId,
    repository: validated.repository,
    branch: validated.branch,
    sourceAgent: validated.sourceAgent,
    targetAgent: validated.targetAgent,
    headSha: validated.headSha,
    summary: validated.summary,
    nextAction: validated.nextAction,
    decisions: [...validated.decisions].sort((a, b) => a.id.localeCompare(b.id)),
    artifacts: [...validated.artifacts].sort(),
    evidence: [...validated.evidence]
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        command: e.command,
        status: e.status,
        headSha: e.headSha,
        observedAt: e.observedAt,
        executionMode: e.executionMode,
        validationProfile: e.validationProfile,
        exitCode: e.exitCode,
        attestationSha256: e.attestationSha256,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  if (validated.supersedesHandoffId !== null && validated.supersedesHandoffId !== undefined) {
    canonical.supersedesHandoffId = validated.supersedesHandoffId;
    canonical.supersessionReason = validated.supersessionReason ?? null;
  }
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function recordHandoff({
  storeDir,
  repoRoot,
  payload,
  repository,
  validationProfile,
  allowFixtureCheckout = false,
}) {
  if (!storeDir || typeof storeDir !== "string") {
    throw new Error("storeDir must be a non-empty string");
  }
  const resolvedStore = path.resolve(storeDir);

  const workingPayload = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { ...payload }
    : payload;

  if (!allowFixtureCheckout) {
    const gitState = getGitState(repoRoot, { repository });
    if (!gitState.repository) {
      throw new Error(
        "Repository identity is not established: configure git remote 'origin', 'relatehandoff.repository', or pass --repo-id"
      );
    }
    if (workingPayload && typeof workingPayload === "object" && !Array.isArray(workingPayload)) {
      if (workingPayload.repository !== gitState.repository) {
        throw new Error(
          `Payload repository '${workingPayload.repository}' does not match checkout repository '${gitState.repository}'`
        );
      }
      if (workingPayload.branch !== gitState.branch) {
        throw new Error(
          `Payload branch '${workingPayload.branch}' does not match checkout branch '${gitState.branch}'`
        );
      }
      if (workingPayload.headSha !== gitState.headSha) {
        throw new Error(
          `Payload headSha '${workingPayload.headSha}' does not match checkout HEAD '${gitState.headSha}'`
        );
      }
    }
  }

  // Validate untrusted JSON ingress BEFORE executing any validation profile.
  const validated = validateHandoffPayload(workingPayload, repoRoot);

  if (validationProfile) {
    if (validated.evidence.length + 1 > MAX_DETAIL_ROWS) {
      throw new Error(
        `BoundExceededError: evidence count (${validated.evidence.length + 1}) exceeds MAX_DETAIL_ROWS (${MAX_DETAIL_ROWS})`
      );
    }
    const runnerEv = runTrustedValidation({
      repoRoot,
      repository: validated.repository,
      headSha: validated.headSha,
      validationProfile,
    });
    if (validated.evidence.some((e) => e.id === runnerEv.id)) {
      throw new Error(`Duplicate evidence id '${runnerEv.id}' conflicts with runner evidence`);
    }
    validated.evidence = [...validated.evidence, runnerEv];
  }

  const fingerprint = canonicalFingerprint(validated);

  const taskKey = `${validated.repository}::${validated.taskId}`;
  const handoffKey = `${taskKey}::${validated.handoffId}`;

  fs.mkdirSync(path.dirname(resolvedStore), { recursive: true });
  const db = Database.open(resolvedStore);
  const conn = db.connect();

  conn.begin();
  try {
    const existing = conn.query(
      `MATCH (h:Handoff {key: $handoffKey})
       RETURN h.fingerprint AS fingerprint`,
      { handoffKey }
    );

    if (existing.rows.length > 0) {
      const existingFp = existing.rows[0].fingerprint;
      if (existingFp === fingerprint) {
        conn.commit();
        db.checkpoint();
        return { ...validated, idempotentReplay: true };
      }
      throw new Error(
        `HandoffConflictError: Handoff '${validated.handoffId}' already exists for '${taskKey}' with different content; refusing to mutate`
      );
    }

    const targetHandoffKey = validated.supersedesHandoffId
      ? `${taskKey}::${validated.supersedesHandoffId}`
      : null;
    if (targetHandoffKey) {
      const targetCheck = conn.query(
        `MATCH (target:Handoff {key: $targetHandoffKey, repository: $repository, taskId: $taskId})
         RETURN target.key AS key`,
        {
          targetHandoffKey,
          repository: validated.repository,
          taskId: validated.taskId,
        }
      );
      if (targetCheck.rows.length === 0) {
        throw new Error(
          `SupersessionError: Target handoff '${validated.supersedesHandoffId}' does not exist in '${taskKey}'`
        );
      }

      const alreadySuperseded = conn.query(
        `MATCH (other:Handoff)-[:SUPERSEDES]->(target:Handoff {key: $targetHandoffKey})
         RETURN other.id AS id`,
        { targetHandoffKey }
      );
      if (alreadySuperseded.rows.length > 0) {
        throw new Error(
          `HandoffConflictError: Target handoff '${validated.supersedesHandoffId}' in '${taskKey}' is already superseded by '${alreadySuperseded.rows[0].id}'`
        );
      }
    }

    conn.query(
      `MERGE (r:Repository {name: $repository})
       MERGE (t:Task {key: $taskKey})
       ON CREATE SET t.id = $taskId, t.repository = $repository
       MERGE (r)-[:OWNS_TASK]->(t)
       MERGE (sa:Agent {name: $sourceAgent})
       MERGE (ta:Agent {name: $targetAgent})
       MERGE (c:Commit {sha: $headSha})
       CREATE (h:Handoff {
         key: $handoffKey,
         id: $handoffId,
         repository: $repository,
         taskId: $taskId,
         schemaVersion: $schemaVersion,
         branch: $branch,
         headSha: $headSha,
         summary: $summary,
         nextAction: $nextAction,
         createdAt: $createdAt,
         fingerprint: $fingerprint
       })
       CREATE (h)-[:HANDOFF_FOR]->(t)
       CREATE (h)-[:FROM_AGENT]->(sa)
       CREATE (h)-[:TO_AGENT]->(ta)
       CREATE (h)-[:TARGETS_HEAD]->(c)`,
      {
        repository: validated.repository,
        taskKey,
        taskId: validated.taskId,
        sourceAgent: validated.sourceAgent,
        targetAgent: validated.targetAgent,
        headSha: validated.headSha,
        handoffKey,
        handoffId: validated.handoffId,
        schemaVersion: validated.schemaVersion,
        branch: validated.branch,
        summary: validated.summary,
        nextAction: validated.nextAction,
        createdAt: validated.createdAt,
        fingerprint,
      }
    );

    for (const d of validated.decisions) {
      const decisionKey = `${handoffKey}::${d.id}`;
      conn.query(
        `MATCH (h:Handoff {key: $handoffKey})
         CREATE (d:Decision {
           key: $decisionKey,
           id: $id,
           repository: $repository,
           taskId: $taskId,
           handoffId: $handoffId,
           summary: $summary
         })
         CREATE (h)-[:DECIDED]->(d)`,
        {
          handoffKey,
          decisionKey,
          id: d.id,
          repository: validated.repository,
          taskId: validated.taskId,
          handoffId: validated.handoffId,
          summary: d.summary,
        }
      );
    }

    for (const artifactPath of validated.artifacts) {
      const artifactKey = `${validated.repository}::${artifactPath}`;
      conn.query(
        `MATCH (h:Handoff {key: $handoffKey})
         MERGE (a:Artifact {key: $artifactKey})
         ON CREATE SET a.path = $path, a.repository = $repository
         CREATE (h)-[:CITES]->(a)`,
        {
          handoffKey,
          artifactKey,
          path: artifactPath,
          repository: validated.repository,
        }
      );
    }

    for (const ev of validated.evidence) {
      const evidenceKey = `${handoffKey}::${ev.id}`;
      conn.query(
        `MATCH (h:Handoff {key: $handoffKey})
         MERGE (ec:Commit {sha: $headSha})
         CREATE (e:Evidence {
           key: $evidenceKey,
           id: $id,
           repository: $repository,
           taskId: $taskId,
           handoffId: $handoffId,
           kind: $kind,
           command: $command,
           status: $status,
           headSha: $headSha,
           observedAt: $observedAt,
           executionMode: $executionMode,
           validationProfile: $validationProfile,
           exitCode: $exitCode,
           attestationSha256: $attestationSha256
         })
         CREATE (h)-[:PROVEN_BY]->(e)
         CREATE (e)-[:AT_COMMIT]->(ec)`,
        {
          handoffKey,
          evidenceKey,
          id: ev.id,
          repository: validated.repository,
          taskId: validated.taskId,
          handoffId: validated.handoffId,
          kind: ev.kind,
          command: ev.command,
          status: ev.status,
          headSha: ev.headSha,
          observedAt: ev.observedAt,
          executionMode: ev.executionMode,
          validationProfile: ev.validationProfile,
          exitCode: ev.exitCode,
          attestationSha256: ev.attestationSha256,
        }
      );
    }

    if (targetHandoffKey) {
      if (validated.supersessionReason !== null) {
        conn.query(
          `MATCH (h:Handoff {key: $handoffKey}), (target:Handoff {key: $targetHandoffKey})
           CREATE (h)-[:SUPERSEDES {reason: $reason, at: $at}]->(target)`,
          {
            handoffKey,
            targetHandoffKey,
            reason: validated.supersessionReason,
            at: validated.createdAt,
          }
        );
      } else {
        conn.query(
          `MATCH (h:Handoff {key: $handoffKey}), (target:Handoff {key: $targetHandoffKey})
           CREATE (h)-[:SUPERSEDES {at: $at}]->(target)`,
          {
            handoffKey,
            targetHandoffKey,
            at: validated.createdAt,
          }
        );
      }
    }

    conn.commit();
  } catch (err) {
    try {
      conn.rollback();
    } catch {
      // ignore rollback failure
    }
    throw err;
  }

  db.checkpoint();
  return { ...validated, idempotentReplay: false };
}
