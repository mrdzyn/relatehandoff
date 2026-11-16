import fs from "node:fs";
import path from "node:path";
import { Database } from "@relate/relate";
import { validateHandoffPayload } from "./schema.mjs";

export function recordHandoff({ storeDir, repoRoot, payload }) {
  if (!storeDir || typeof storeDir !== "string") {
    throw new Error("storeDir must be a non-empty string");
  }
  const resolvedStore = path.resolve(storeDir);
  const validated = validateHandoffPayload(payload, repoRoot);

  fs.mkdirSync(path.dirname(resolvedStore), { recursive: true });
  const db = Database.open(resolvedStore);
  const conn = db.connect();

  conn.begin();
  try {
    conn.query(
      `MERGE (r:Repository {name: $repository})
       MERGE (t:Task {id: $taskId})
       MERGE (r)-[:OWNS_TASK]->(t)
       MERGE (sa:Agent {name: $sourceAgent})
       MERGE (ta:Agent {name: $targetAgent})
       MERGE (c:Commit {sha: $headSha})
       MERGE (h:Handoff {id: $handoffId})
       SET h.schemaVersion = $schemaVersion,
           h.branch = $branch,
           h.headSha = $headSha,
           h.summary = $summary,
           h.nextAction = $nextAction,
           h.createdAt = $createdAt
       MERGE (h)-[:HANDOFF_FOR]->(t)
       MERGE (h)-[:FROM_AGENT]->(sa)
       MERGE (h)-[:TO_AGENT]->(ta)
       MERGE (h)-[:TARGETS_HEAD]->(c)`,
      {
        repository: validated.repository,
        taskId: validated.taskId,
        sourceAgent: validated.sourceAgent,
        targetAgent: validated.targetAgent,
        headSha: validated.headSha,
        handoffId: validated.handoffId,
        schemaVersion: validated.schemaVersion,
        branch: validated.branch,
        summary: validated.summary,
        nextAction: validated.nextAction,
        createdAt: validated.createdAt,
      }
    );

    for (const d of validated.decisions) {
      conn.query(
        `MATCH (h:Handoff {id: $handoffId})
         MERGE (d:Decision {id: $id})
         SET d.summary = $summary
         MERGE (h)-[:DECIDED]->(d)`,
        { handoffId: validated.handoffId, id: d.id, summary: d.summary }
      );
    }

    for (const artifactPath of validated.artifacts) {
      conn.query(
        `MATCH (h:Handoff {id: $handoffId})
         MERGE (a:Artifact {path: $path})
         MERGE (h)-[:CITES]->(a)`,
        { handoffId: validated.handoffId, path: artifactPath }
      );
    }

    for (const ev of validated.evidence) {
      conn.query(
        `MATCH (h:Handoff {id: $handoffId})
         MERGE (ec:Commit {sha: $headSha})
         MERGE (e:Evidence {id: $id})
         SET e.kind = $kind,
             e.command = $command,
             e.status = $status,
             e.headSha = $headSha,
             e.observedAt = $observedAt
         MERGE (h)-[:PROVEN_BY]->(e)
         MERGE (e)-[:AT_COMMIT]->(ec)`,
        {
          handoffId: validated.handoffId,
          id: ev.id,
          kind: ev.kind,
          command: ev.command,
          status: ev.status,
          headSha: ev.headSha,
          observedAt: ev.observedAt,
        }
      );
    }

    conn.commit();
  } catch (err) {
    try {
      conn.rollback();
    } catch {
      // ignore rollback failure if already rolled back
    }
    throw err;
  }

  db.checkpoint();
  return validated;
}
