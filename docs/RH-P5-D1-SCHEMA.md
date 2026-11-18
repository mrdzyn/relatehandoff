# RH-P5 — D1 Schema and Data-Access Rules (proposal)

**State:** Design only; no database exists. DDL below is illustrative SQLite/D1 and becomes migration `0001` only at RH-P5-T2 after owner approval. It must be re-validated against D1's SQLite dialect; D1 foreign-key enforcement and `STRICT` support are **[verify]** and are covered by migration tests rather than assumed. The DDL was executed once on local SQLite 3.54 with `PRAGMA foreign_keys=ON` (16 tables created; a cross-project task foreign key, the trust-ceiling `CHECK`, duplicate `handoff_key` and duplicate `server_seq` were rejected as intended); it was **not** run on D1. See [platform plan](RH-P5-PLATFORM-PLAN.md) and [threat model](RH-P5-THREAT-MODEL.md).

## Conventions
- All ids are opaque, server-generated, random (≥ 128 bit, lowercase base32), never sequential. `tenant_id` and `project_id` appear on every project-owned row and in every foreign key and index.
- Timestamps are ISO-8601 UTC text. SHAs are 40-char lowercase hex. Enums are `CHECK` constraints mirrored from `src/schema.mjs` / `src/freshness.mjs` (parity-tested).
- Handoff-derived rows are **immutable** after insert (no UPDATE path in the DAL except `status` transitions and `revoked_at`).
- No column stores file contents, diffs, transcripts, tokens, passwords, private keys or absolute local paths.

## DDL (illustrative)

```sql
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;                                   -- schema_version checked by every Worker (fail closed)

CREATE TABLE tenants (
  tenant_id    TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 3 AND 40 AND slug NOT GLOB '*[^a-z0-9-]*'),
  display_name TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE principals (                    -- humans only; initially one OWNER
  principal_id TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(tenant_id),
  role         TEXT NOT NULL CHECK (role IN ('OWNER','MEMBER')),
  idp          TEXT NOT NULL CHECK (idp IN ('github')),
  idp_subject  TEXT NOT NULL,                -- immutable numeric GitHub user id, not the login name
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','DISABLED')),
  created_at   TEXT NOT NULL,
  UNIQUE (tenant_id, idp, idp_subject)
) STRICT;

CREATE TABLE projects (
  project_id     TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(tenant_id),
  slug           TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 64 AND slug NOT GLOB '*[^a-z0-9-]*'),
  provider       TEXT NOT NULL CHECK (provider IN ('github')),
  repo_id        TEXT NOT NULL,              -- immutable numeric GitHub repository id
  repo_full_name TEXT NOT NULL,              -- 'owner/name'; mismatch with payload => fail closed
  default_branch TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at     TEXT NOT NULL,
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, repo_id),
  UNIQUE (tenant_id, project_id)             -- composite FK target
) STRICT;

CREATE TABLE oauth_connections (             -- one row per approved reader client connection
  connection_id TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(tenant_id),
  principal_id  TEXT NOT NULL REFERENCES principals(principal_id),
  client_id     TEXT NOT NULL,
  client_label  TEXT NOT NULL,               -- e.g. 'ChatGPT', 'Claude Code'; display only
  provider_grant_id TEXT NOT NULL,           -- id of the grant inside the OAuth library's KV
  created_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT
) STRICT;

CREATE TABLE connection_project_grants (     -- per-project authorization for readers
  connection_id TEXT NOT NULL REFERENCES oauth_connections(connection_id),
  tenant_id     TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT,
  PRIMARY KEY (connection_id, project_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE publishers (                    -- ingestion credentials; exactly one project each
  publisher_id TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  label        TEXT NOT NULL,
  agent_kind   TEXT NOT NULL CHECK (agent_kind IN ('local','codex','claude','grok','chatgpt','ci','other')),
  public_key   TEXT NOT NULL,                -- Ed25519 public key, base64url (public; not a secret)
  key_fpr      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  created_at   TEXT NOT NULL,
  expires_at   TEXT,
  revoked_at   TEXT,
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id),
  UNIQUE (project_id, key_fpr)
) STRICT;

CREATE TABLE publisher_nonces (              -- replay protection, pruned after the skew window
  publisher_id TEXT NOT NULL REFERENCES publishers(publisher_id),
  nonce        TEXT NOT NULL,
  seen_at      TEXT NOT NULL,
  PRIMARY KEY (publisher_id, nonce)
) STRICT;

CREATE TABLE project_refs (                  -- observed branch heads (not authority; see freshness rules)
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  branch    TEXT NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('PUBLISHER_REPORTED','GITHUB_APP')),
  head_sha  TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  observed_at TEXT NOT NULL,
  observed_by TEXT NOT NULL,                 -- publisher_id or 'github-app'
  PRIMARY KEY (project_id, branch, source),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE tasks (
  tenant_id  TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id    TEXT NOT NULL CHECK (length(task_id) BETWEEN 1 AND 128),   -- local taskId, ID_RE-validated
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, task_id),
  UNIQUE (tenant_id, project_id, task_id),   -- composite FK target for handoffs
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE handoffs (
  handoff_pk   TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  handoff_id   TEXT NOT NULL,
  handoff_key  TEXT NOT NULL,                -- '<repository>::<taskId>::<handoffId>'
  schema_version TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  branch       TEXT NOT NULL,
  head_sha     TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  created_at   TEXT NOT NULL,                -- from payload; informational, never used for ordering
  summary      TEXT NOT NULL,
  next_action  TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,              -- hash of canonical sanitized payload (idempotency/conflict)
  ingest_trust TEXT NOT NULL DEFAULT 'UNSIGNED_CLOUD_INGESTED' CHECK (ingest_trust IN ('UNSIGNED_CLOUD_INGESTED')),
  server_seq   INTEGER NOT NULL,             -- per project, assigned server-side in the insert batch
  ingested_at  TEXT NOT NULL,
  ingested_by  TEXT NOT NULL REFERENCES publishers(publisher_id),
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','RETRACTED')),
  supersedes_pk TEXT REFERENCES handoffs(handoff_pk),
  FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES tasks(tenant_id, project_id, task_id),
  UNIQUE (project_id, handoff_key),
  UNIQUE (project_id, server_seq),
  UNIQUE (tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE decisions (
  tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, handoff_pk TEXT NOT NULL,
  decision_id TEXT NOT NULL, summary TEXT NOT NULL,
  PRIMARY KEY (handoff_pk, decision_id),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE evidence (
  tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, handoff_pk TEXT NOT NULL,
  evidence_id TEXT NOT NULL, kind TEXT NOT NULL, command TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASS','FAIL','UNVERIFIED')),
  head_sha TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  observed_at TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'SELF_ASSERTED' CHECK (execution_mode = 'SELF_ASSERTED'),
  PRIMARY KEY (handoff_pk, evidence_id),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;
-- Deliberately NO columns for exit_code, validation_profile or attestation in v1: the cloud cannot
-- store or display a stronger trust class than the local unsigned store provides.

CREATE TABLE artifacts (
  tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, handoff_pk TEXT NOT NULL,
  path TEXT NOT NULL,                        -- repo-relative, normalized, sensitive names rejected
  PRIMARY KEY (handoff_pk, path),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE ingest_conflicts (
  conflict_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
  handoff_key TEXT NOT NULL, existing_sha256 TEXT NOT NULL, attempted_sha256 TEXT NOT NULL,
  publisher_id TEXT NOT NULL, at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE audit_log (                     -- append-only; no UPDATE/DELETE in the DAL
  audit_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('OWNER','CONNECTION','PUBLISHER','SYSTEM')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,                      -- e.g. GRANT_CREATE, GRANT_REVOKE, INGEST_OK, INGEST_CONFLICT, READ_DENIED
  outcome TEXT NOT NULL CHECK (outcome IN ('OK','DENIED','ERROR')),
  detail TEXT,                               -- bounded, no tokens/bodies/free text
  at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_handoffs_project_seq   ON handoffs (project_id, server_seq DESC);
CREATE INDEX idx_handoffs_project_task  ON handoffs (project_id, task_id, server_seq DESC);
CREATE INDEX idx_handoffs_project_branch ON handoffs (project_id, branch, server_seq DESC);
CREATE INDEX idx_grants_project         ON connection_project_grants (project_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_project_time     ON audit_log (project_id, at DESC);
```

## Data-access rules (enforced in code and tests)

1. **Only `rh-data` touches D1.** Gateway and ingest Workers call named RPC entrypoints (`ReadApi`, `WriteApi`); the gateway has no write entrypoint **[verify binding mechanism]**.
2. **`ProjectScope` is mandatory.** Every DAL function takes a `ProjectScope { tenantId, projectId, permission }` that only the authorization layer can construct from a verified token/grant (reader) or a verified publisher. Tool/API arguments never supply `tenant_id` or `project_id` directly; slugs are resolved through the grant table first.
3. **Every statement is parameterized** (`prepare().bind()`), never string-built, and every project-owned query includes `tenant_id = ? AND project_id = ?`. `exec()` is migrations-only.
4. **Uniform denial.** Unknown, ungranted, archived and malformed project references yield the same `NOT_FOUND` response and timing class.
5. **Atomic ingest.** One `db.batch()` inserts task (if new), handoff (with `server_seq = COALESCE(MAX(server_seq),0)+1` in the same batch), decisions, evidence, artifacts, ref observation and audit row; failure aborts all. The unique `(project_id, server_seq)` index makes a race fail closed and retry.
6. **Immutability and trust ceiling.** No UPDATE of handoff content; only `status`/`supersedes` transitions by admin or by a newer handoff. `ingest_trust` and `execution_mode` are single-value `CHECK`s, so no path can store a stronger class.
7. **Bounds.** ≤ 100 decisions/artifacts/evidence per handoff, ≤ 256 KB request body, string length caps as in the local validator, page size ≤ 20, response ≤ 128 KB; D1 row (2 MB) and 100-parameter limits respected; queries per invocation bounded (target ≤ 10).
8. **Cursors** are HMAC-signed over `(project_id, last_seq, issued_at)` and rejected on any mismatch.
9. **Retention/deletion:** `publisher_nonces` pruned past the skew window; deleting a project hard-deletes its rows in one batch and leaves an audit tombstone without content.

## Migration notes
Numbered forward-only files under `cloud/migrations/`; `0001` creates the schema and writes `schema_meta('schema_version','1')`. Any change is expand → backfill → contract, accompanied by updated isolation tests. Seed/fixture data is synthetic only. Rollback relies on D1 point-in-time recovery/export **[verify retention]**, rehearsed in staging. A future database-per-tenant layout keeps the same DDL minus the `tenants` table's cross-tenant rows.
