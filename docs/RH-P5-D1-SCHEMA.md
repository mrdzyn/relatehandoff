# RH-P5 — D1 Schema and Data-Access Rules (proposal, revision 2)

**State:** Design only; no database exists. Revision 2 remediates independent audit findings **P11-01** (incomplete composite-foreign-key isolation) and **P11-02** (deletion, sequencing, immutability and source-control contracts). The DDL below becomes migration `0001` only at RH-P5-T2 after owner approval. See the [platform plan](RH-P5-PLATFORM-PLAN.md) and [threat model](RH-P5-THREAT-MODEL.md).

**What has and has not been verified.** The DDL was extracted from this file and executed on local SQLite with `PRAGMA foreign_keys=ON`; the record is in [§8](#8-local-sqlite-verification-record). Cloudflare documents that D1 enforces foreign keys by default and that `PRAGMA foreign_keys` cannot be changed by queries or migrations. **Not yet verified on D1/Miniflare:** `STRICT` tables, `CREATE TRIGGER` bodies (triggers are described as supported only in secondary sources), `randomblob()`, and multi-statement trigger handling in D1 migration files. Running this schema and the negative suite of §7 on Miniflare and on a real D1 staging database is an **explicit gate of RH-P5-T2**; until then every statement here is a proposal.

## 1. Conventions
- Ids are opaque, server-generated, random (≥ 128 bit), never sequential, and **globally unique** (a bare id can never alias another tenant's row). Timestamps are ISO-8601 UTC text. SHAs are 40-char lowercase hex. Enums are `CHECK` constraints mirrored from `src/schema.mjs` and `src/freshness.mjs` (parity-tested).
- **Composite-key discipline.** Every tenant-owned row carries `tenant_id`; every project-owned row carries `(tenant_id, project_id)`; every reference to a parent is a **composite foreign key that includes `tenant_id` (and `project_id` where the parent is project-owned)** and targets a `UNIQUE` constraint containing those same columns. A single-column reference to a tenant- or project-owned parent is a defect.
- No `ON DELETE CASCADE` anywhere. Deletion is an explicit ordered procedure (§5.1). No column stores file contents, diffs, transcripts, tokens, passwords, private keys or local absolute paths.
- Database-level defenses (composite FKs, `CHECK`s, triggers) are **defense in depth**. They do not replace the `ProjectScope` checks in the data Worker, which remain the primary authorization boundary.

## 2. Relationship matrix (every actor/tenant/project relation)

| Child → parent | Enforced by | Prevents |
|---|---|---|
| `principals(tenant)` → `tenants` | FK | orphan principals |
| `oauth_connections(tenant, principal)` → `principals(tenant_id, principal_id)` | composite FK + `UNIQUE(tenant_id, principal_id)` | connection using another tenant's principal (finding 1) |
| `connection_project_grants(tenant, connection)` → `oauth_connections(tenant_id, connection_id)` and `(tenant, project)` → `projects(tenant_id, project_id)` | two composite FKs sharing the same `tenant_id` | grant joining one tenant's connection to another tenant's project (finding 2) |
| `projects(tenant, project)` → `project_identities` | composite FK | projects without an identity |
| `publishers(tenant, project)` → `project_identities` | composite FK | publisher bound to a nonexistent or other-tenant project |
| `github_app_links(tenant, project)` → `projects`; `(tenant, created_by)` → `principals` | composite FKs | server-side source links across projects or tenants |
| `project_refs` publisher source → `publishers(tenant_id, project_id, publisher_id)`; app source → `github_app_links(tenant_id, project_id, installation_id)`; `CHECK` ties `source` to exactly one of them | composite FKs + `CHECK` | publisher-claimed `GITHUB_APP`; observation by another project's publisher or link |
| `tasks(tenant, project)` → `projects` | composite FK | cross-project tasks |
| `handoffs(tenant, project, task)` → `tasks` | composite FK | handoff for another project's task |
| `handoffs(tenant, project, ingested_by)` → `publishers(tenant_id, project_id, publisher_id)` | composite FK | handoff attributed to another project's publisher (finding 3) |
| `handoffs(tenant, project, supersedes_pk)` → `handoffs(tenant_id, project_id, handoff_pk)` | composite self-FK | superseding another project's handoff (finding 4) |
| `handoffs(tenant, status_actor_principal_id)` → `principals` | composite FK | retraction by another tenant's principal |
| `decisions`/`evidence`/`artifacts`/`handoff_status_events(tenant, project, handoff)` → `handoffs` | composite FKs | children of another project's handoff |
| `ingest_conflicts(tenant, project, publisher_id)` → `publishers`; `(tenant, project, handoff_key)` → `handoffs` | composite FKs + `UNIQUE(tenant_id, project_id, handoff_key)` | conflict recorded with a publisher or handoff outside its project (finding 6) |
| `audit_log(tenant, project)` → `project_identities`; typed actor columns → `principals` / `oauth_connections` / `publishers` (composite) | composite FKs + actor-kind `CHECK` | audit row tying a tenant to another tenant's project (finding 5) and mismatched actor attribution |
| `publisher_nonces(publisher_id)` → `publishers` | FK (no tenant column; tenancy derives from the publisher) | orphan nonces |

Remaining-gap review: `schema_meta` is global and holds no tenant data. `oauth_connections.provider_grant_id` and `client_id` reference the OAuth library's KV store outside D1, so they cannot be database-enforced; the data Worker verifies that the library grant belongs to the connection's principal (application contract tested in T2/T5). `handoffs.handoff_key` embeds the repository name; a trigger forces it to match the owning project's `repo_full_name`, closing the "payload names another repository" path at the database.

## 3. DDL (illustrative; extract and run as one script)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE tenants (
  tenant_id    TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 3 AND 40 AND slug NOT GLOB '*[^a-z0-9-]*'),
  display_name TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE principals (
  principal_id TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(tenant_id),
  role         TEXT NOT NULL CHECK (role IN ('OWNER','MEMBER')),
  idp          TEXT NOT NULL CHECK (idp IN ('github')),
  idp_subject  TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','DISABLED')),
  created_at   TEXT NOT NULL,
  UNIQUE (tenant_id, idp, idp_subject),
  UNIQUE (tenant_id, principal_id)
) STRICT;

-- Opaque, never-deleted identity of a project. It survives hard deletion as the non-sensitive
-- tombstone: ids and timestamps only (no slug, repository name, summaries or free text).
CREATE TABLE project_identities (
  tenant_id               TEXT NOT NULL REFERENCES tenants(tenant_id),
  project_id              TEXT NOT NULL UNIQUE,
  created_at              TEXT NOT NULL,
  deleted_at              TEXT,
  deleted_by_principal_id TEXT,
  PRIMARY KEY (tenant_id, project_id),
  FOREIGN KEY (tenant_id, deleted_by_principal_id) REFERENCES principals(tenant_id, principal_id),
  CHECK ((deleted_at IS NULL) = (deleted_by_principal_id IS NULL))
) STRICT;

CREATE TABLE projects (
  project_id     TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  slug           TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 64 AND slug NOT GLOB '*[^a-z0-9-]*'),
  provider       TEXT NOT NULL CHECK (provider IN ('github')),
  repo_id        TEXT NOT NULL,
  repo_full_name TEXT NOT NULL CHECK (instr(repo_full_name, '::') = 0),
  default_branch TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at     TEXT NOT NULL,
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, repo_id),
  UNIQUE (tenant_id, project_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES project_identities(tenant_id, project_id)
) STRICT;

CREATE TABLE oauth_connections (
  connection_id     TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  principal_id      TEXT NOT NULL,
  client_id         TEXT NOT NULL,
  client_label      TEXT NOT NULL,
  provider_grant_id TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  last_used_at      TEXT,
  revoked_at        TEXT,
  UNIQUE (tenant_id, connection_id),
  FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, principal_id)
) STRICT;

CREATE TABLE connection_project_grants (
  tenant_id     TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT,
  PRIMARY KEY (connection_id, project_id),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES oauth_connections(tenant_id, connection_id),
  FOREIGN KEY (tenant_id, project_id)    REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE publishers (
  publisher_id TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  label        TEXT NOT NULL,
  agent_kind   TEXT NOT NULL CHECK (agent_kind IN ('local','codex','claude','grok','chatgpt','ci','other')),
  public_key   TEXT NOT NULL,
  key_fpr      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  created_at   TEXT NOT NULL,
  expires_at   TEXT,
  revoked_at   TEXT,
  UNIQUE (project_id, key_fpr),
  UNIQUE (tenant_id, project_id, publisher_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES project_identities(tenant_id, project_id),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
) STRICT;

CREATE TABLE publisher_nonces (
  publisher_id TEXT NOT NULL REFERENCES publishers(publisher_id),
  nonce        TEXT NOT NULL,
  seen_at      TEXT NOT NULL,
  PRIMARY KEY (publisher_id, nonce)
) STRICT;

-- Owner-registered, server-side link that authorizes GITHUB_APP observations for one project.
-- Publishers have no write path to this table.
CREATE TABLE github_app_links (
  tenant_id               TEXT NOT NULL,
  project_id              TEXT NOT NULL,
  installation_id         TEXT NOT NULL,
  created_by_principal_id TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  revoked_at              TEXT,
  PRIMARY KEY (project_id, installation_id),
  UNIQUE (tenant_id, project_id, installation_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id),
  FOREIGN KEY (tenant_id, created_by_principal_id) REFERENCES principals(tenant_id, principal_id)
) STRICT;

CREATE TABLE project_refs (
  tenant_id                TEXT NOT NULL,
  project_id               TEXT NOT NULL,
  branch                   TEXT NOT NULL,
  source                   TEXT NOT NULL CHECK (source IN ('PUBLISHER_REPORTED','GITHUB_APP')),
  head_sha                 TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  observed_at              TEXT NOT NULL,
  observed_by_publisher_id TEXT,
  app_installation_id      TEXT,
  PRIMARY KEY (project_id, branch, source),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id),
  FOREIGN KEY (tenant_id, project_id, observed_by_publisher_id)
    REFERENCES publishers(tenant_id, project_id, publisher_id),
  FOREIGN KEY (tenant_id, project_id, app_installation_id)
    REFERENCES github_app_links(tenant_id, project_id, installation_id),
  CHECK (
    (source = 'PUBLISHER_REPORTED' AND observed_by_publisher_id IS NOT NULL AND app_installation_id IS NULL) OR
    (source = 'GITHUB_APP'         AND app_installation_id IS NOT NULL AND observed_by_publisher_id IS NULL)
  )
) STRICT;

CREATE TABLE tasks (
  tenant_id  TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id    TEXT NOT NULL CHECK (length(task_id) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, task_id),
  UNIQUE (tenant_id, project_id, task_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
) STRICT;

CREATE TABLE handoffs (
  handoff_pk     TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  task_id        TEXT NOT NULL,
  handoff_id     TEXT NOT NULL,
  handoff_key    TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_agent   TEXT NOT NULL,
  target_agent   TEXT NOT NULL,
  branch         TEXT NOT NULL,
  head_sha       TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  created_at     TEXT NOT NULL,
  summary        TEXT NOT NULL,
  next_action    TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  ingest_trust   TEXT NOT NULL DEFAULT 'UNSIGNED_CLOUD_INGESTED' CHECK (ingest_trust = 'UNSIGNED_CLOUD_INGESTED'),
  server_seq     INTEGER NOT NULL CHECK (server_seq >= 1),
  ingested_at    TEXT NOT NULL,
  ingested_by    TEXT NOT NULL,
  supersedes_pk  TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','RETRACTED')),
  status_changed_at         TEXT,
  status_reason             TEXT,
  status_actor_principal_id TEXT,
  UNIQUE (project_id, handoff_key),
  UNIQUE (project_id, server_seq),
  UNIQUE (tenant_id, project_id, handoff_pk),
  UNIQUE (tenant_id, project_id, handoff_key),
  FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES tasks(tenant_id, project_id, task_id),
  FOREIGN KEY (tenant_id, project_id, ingested_by) REFERENCES publishers(tenant_id, project_id, publisher_id),
  FOREIGN KEY (tenant_id, project_id, supersedes_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk),
  FOREIGN KEY (tenant_id, status_actor_principal_id) REFERENCES principals(tenant_id, principal_id),
  CHECK (supersedes_pk IS NULL OR supersedes_pk <> handoff_pk),
  CHECK (substr(handoff_key, -length('::' || task_id || '::' || handoff_id)) = '::' || task_id || '::' || handoff_id),
  CHECK (
    (status = 'ACTIVE'     AND status_changed_at IS NULL AND status_reason IS NULL AND status_actor_principal_id IS NULL) OR
    (status = 'SUPERSEDED' AND status_changed_at IS NOT NULL AND status_reason IS NOT NULL AND status_actor_principal_id IS NULL) OR
    (status = 'RETRACTED'  AND status_changed_at IS NOT NULL AND status_reason IS NOT NULL AND status_actor_principal_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE handoff_status_events (
  event_id           TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  project_id         TEXT NOT NULL,
  handoff_pk         TEXT NOT NULL,
  from_status        TEXT NOT NULL,
  to_status          TEXT NOT NULL,
  reason             TEXT NOT NULL,
  actor_principal_id TEXT,
  at                 TEXT NOT NULL,
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk),
  FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES principals(tenant_id, principal_id)
) STRICT;

CREATE TABLE decisions (
  tenant_id   TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  handoff_pk  TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  summary     TEXT NOT NULL,
  PRIMARY KEY (handoff_pk, decision_id),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE evidence (
  tenant_id      TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  handoff_pk     TEXT NOT NULL,
  evidence_id    TEXT NOT NULL,
  kind           TEXT NOT NULL,
  command        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('PASS','FAIL','UNVERIFIED')),
  head_sha       TEXT NOT NULL CHECK (length(head_sha) = 40 AND head_sha NOT GLOB '*[^0-9a-f]*'),
  observed_at    TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'SELF_ASSERTED' CHECK (execution_mode = 'SELF_ASSERTED'),
  PRIMARY KEY (handoff_pk, evidence_id),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE artifacts (
  tenant_id  TEXT NOT NULL,
  project_id TEXT NOT NULL,
  handoff_pk TEXT NOT NULL,
  path       TEXT NOT NULL,
  PRIMARY KEY (handoff_pk, path),
  FOREIGN KEY (tenant_id, project_id, handoff_pk) REFERENCES handoffs(tenant_id, project_id, handoff_pk)
) STRICT;

CREATE TABLE ingest_conflicts (
  conflict_id      TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  handoff_key      TEXT NOT NULL,
  existing_sha256  TEXT NOT NULL,
  attempted_sha256 TEXT NOT NULL,
  publisher_id     TEXT NOT NULL,
  at               TEXT NOT NULL,
  FOREIGN KEY (tenant_id, project_id, handoff_key) REFERENCES handoffs(tenant_id, project_id, handoff_key),
  FOREIGN KEY (tenant_id, project_id, publisher_id) REFERENCES publishers(tenant_id, project_id, publisher_id)
) STRICT;

CREATE TABLE audit_log (
  audit_id            TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(tenant_id),
  project_id          TEXT,
  actor_kind          TEXT NOT NULL CHECK (actor_kind IN ('OWNER','CONNECTION','PUBLISHER','SYSTEM')),
  actor_principal_id  TEXT,
  actor_connection_id TEXT,
  actor_publisher_id  TEXT,
  action              TEXT NOT NULL,
  outcome             TEXT NOT NULL CHECK (outcome IN ('OK','DENIED','ERROR')),
  detail              TEXT,
  at                  TEXT NOT NULL,
  FOREIGN KEY (tenant_id, project_id)                     REFERENCES project_identities(tenant_id, project_id),
  FOREIGN KEY (tenant_id, actor_principal_id)             REFERENCES principals(tenant_id, principal_id),
  FOREIGN KEY (tenant_id, actor_connection_id)            REFERENCES oauth_connections(tenant_id, connection_id),
  FOREIGN KEY (tenant_id, project_id, actor_publisher_id) REFERENCES publishers(tenant_id, project_id, publisher_id),
  CHECK (
    (actor_kind = 'OWNER'      AND actor_principal_id  IS NOT NULL AND actor_connection_id IS NULL AND actor_publisher_id IS NULL) OR
    (actor_kind = 'CONNECTION' AND actor_connection_id IS NOT NULL AND actor_principal_id  IS NULL AND actor_publisher_id IS NULL) OR
    (actor_kind = 'PUBLISHER'  AND actor_publisher_id  IS NOT NULL AND project_id IS NOT NULL AND actor_principal_id IS NULL AND actor_connection_id IS NULL) OR
    (actor_kind = 'SYSTEM'     AND actor_principal_id  IS NULL AND actor_connection_id IS NULL AND actor_publisher_id IS NULL)
  )
) STRICT;

CREATE INDEX idx_handoffs_project_seq    ON handoffs (project_id, server_seq DESC);
CREATE INDEX idx_handoffs_project_task   ON handoffs (project_id, task_id, server_seq DESC);
CREATE INDEX idx_handoffs_project_branch ON handoffs (project_id, branch, server_seq DESC);
CREATE INDEX idx_grants_project          ON connection_project_grants (project_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_project_time      ON audit_log (project_id, at DESC);

-- ---- Triggers: database-level defense in depth (not a substitute for DAL authorization) ----

-- A project row can be removed only by the ordered deletion procedure, which first sets
-- project_identities.deleted_at; a deleted identity can never be recreated.
CREATE TRIGGER trg_projects_no_resurrect BEFORE INSERT ON projects
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'project identity is deleted'); END;

CREATE TRIGGER trg_projects_guard_delete BEFORE DELETE ON projects
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'project deletion requires the ordered procedure'); END;

-- The handoff key must be '<repository>::<taskId>::<handoffId>' with the owning project's repository.
CREATE TRIGGER trg_handoffs_repo_key BEFORE INSERT ON handoffs
WHEN NOT COALESCE((SELECT substr(NEW.handoff_key, 1, length(repo_full_name) + 2) = repo_full_name || '::'
                   FROM projects WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id), 0)
BEGIN SELECT RAISE(ABORT, 'handoff_key repository does not match project'); END;

-- Only an ACTIVE handoff may be superseded (same project is also enforced by the composite FK).
CREATE TRIGGER trg_handoffs_supersede_check BEFORE INSERT ON handoffs
WHEN NEW.supersedes_pk IS NOT NULL
 AND COALESCE((SELECT status FROM handoffs WHERE handoff_pk = NEW.supersedes_pk), '') <> 'ACTIVE'
BEGIN SELECT RAISE(ABORT, 'superseded handoff must exist and be ACTIVE'); END;

CREATE TRIGGER trg_handoffs_supersede_apply AFTER INSERT ON handoffs
WHEN NEW.supersedes_pk IS NOT NULL
BEGIN
  UPDATE handoffs
     SET status = 'SUPERSEDED', status_changed_at = NEW.ingested_at, status_reason = 'SUPERSEDED_BY_NEWER_HANDOFF'
   WHERE handoff_pk = NEW.supersedes_pk AND status = 'ACTIVE';
END;

-- Handoff content is immutable; only the status columns may change.
CREATE TRIGGER trg_handoffs_immutable BEFORE UPDATE ON handoffs
WHEN NEW.handoff_pk IS NOT OLD.handoff_pk OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.project_id IS NOT OLD.project_id
  OR NEW.task_id IS NOT OLD.task_id OR NEW.handoff_id IS NOT OLD.handoff_id OR NEW.handoff_key IS NOT OLD.handoff_key
  OR NEW.schema_version IS NOT OLD.schema_version OR NEW.source_agent IS NOT OLD.source_agent
  OR NEW.target_agent IS NOT OLD.target_agent OR NEW.branch IS NOT OLD.branch OR NEW.head_sha IS NOT OLD.head_sha
  OR NEW.created_at IS NOT OLD.created_at OR NEW.summary IS NOT OLD.summary OR NEW.next_action IS NOT OLD.next_action
  OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.ingest_trust IS NOT OLD.ingest_trust
  OR NEW.server_seq IS NOT OLD.server_seq OR NEW.ingested_at IS NOT OLD.ingested_at
  OR NEW.ingested_by IS NOT OLD.ingested_by OR NEW.supersedes_pk IS NOT OLD.supersedes_pk
BEGIN SELECT RAISE(ABORT, 'handoff content is immutable'); END;

-- Allowed status transitions only: ACTIVE -> SUPERSEDED | RETRACTED, SUPERSEDED -> RETRACTED.
CREATE TRIGGER trg_handoffs_status_transition BEFORE UPDATE OF status ON handoffs
WHEN NEW.status <> OLD.status
 AND NOT ((OLD.status = 'ACTIVE' AND NEW.status IN ('SUPERSEDED','RETRACTED'))
       OR (OLD.status = 'SUPERSEDED' AND NEW.status = 'RETRACTED'))
BEGIN SELECT RAISE(ABORT, 'invalid handoff status transition'); END;

-- Every status change is recorded automatically.
CREATE TRIGGER trg_handoffs_status_event AFTER UPDATE OF status ON handoffs
WHEN NEW.status <> OLD.status
BEGIN
  INSERT INTO handoff_status_events
    (event_id, tenant_id, project_id, handoff_pk, from_status, to_status, reason, actor_principal_id, at)
  VALUES
    (lower(hex(randomblob(16))), NEW.tenant_id, NEW.project_id, NEW.handoff_pk, OLD.status, NEW.status,
     NEW.status_reason, NEW.status_actor_principal_id, NEW.status_changed_at);
END;

-- Append-only children and audit: no UPDATE; DELETE only while the project is being hard-deleted.
CREATE TRIGGER trg_decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER trg_evidence_no_update  BEFORE UPDATE ON evidence  BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER trg_artifacts_no_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER trg_events_no_update    BEFORE UPDATE ON handoff_status_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER trg_conflicts_no_update BEFORE UPDATE ON ingest_conflicts BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER trg_audit_no_update     BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER trg_audit_no_delete     BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

CREATE TRIGGER trg_handoffs_guard_delete BEFORE DELETE ON handoffs
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_decisions_guard_delete BEFORE DELETE ON decisions
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_evidence_guard_delete BEFORE DELETE ON evidence
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_artifacts_guard_delete BEFORE DELETE ON artifacts
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_events_guard_delete BEFORE DELETE ON handoff_status_events
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_conflicts_guard_delete BEFORE DELETE ON ingest_conflicts
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
CREATE TRIGGER trg_tasks_guard_delete BEFORE DELETE ON tasks
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;
```

Notes: supersession is applied atomically by the insert trigger, so a handoff cannot be superseded without a newer same-project handoff. `GITHUB_APP` rows require an owner-created `github_app_links` row for that project. `project_identities.deleted_at` is set only by the deletion procedure. Trigger bodies need uppercase `BEGIN`/`END` and may need single-statement handling in D1 migration files **[verify]**.

## 4. Data-access rules (code-enforced, tested)
1. **Only `rh-data` touches D1.** The gateway and ingest Workers use named RPC entrypoints (`ReadApi`, `WriteApi`); the gateway has no write entrypoint. Cloudflare documents named `WorkerEntrypoint` service bindings; the binding security is verified in T2/T6.
2. **`ProjectScope` is mandatory.** Every DAL function takes a `ProjectScope { tenantId, projectId, permission }` constructed only by the authorization layer from a verified grant or publisher. Tool/API arguments never supply `tenant_id` or `project_id`; slugs resolve through grants first.
3. **Every statement is parameterized** (`prepare().bind()`); project-owned queries include `tenant_id = ? AND project_id = ?`; `exec()` is for migrations only.
4. **Uniform denial.** Unknown, ungranted, archived, deleted and malformed project references produce the same `NOT_FOUND`.
5. **Bounds.** ≤ 100 decisions/artifacts/evidence per handoff, ≤ 256 KB request body, local-validator string caps, page size ≤ 20, response ≤ 128 KB, queries per invocation ≤ 10 (D1 paid ceiling is 1,000).
6. **Cursors** are HMAC-signed over `(project_id, last_seq, issued_at)`; any mismatch is rejected.
7. **Trust ceiling.** `ingest_trust` and `execution_mode` are single-value `CHECK`s; no column can hold a stronger class. No `exit_code`, `validation_profile` or attestation columns exist in v1.

## 5. Contracts (P11-02)

### 5.1 Project hard deletion (atomic, ordered, with tombstone)
One `db.batch()` (a SQL transaction) executed by `WriteApi.deleteProject` only, owner-authorized, requiring typed confirmation of the project slug and a reason code. Statement order (parents last; **no cascades**):
1. `INSERT audit_log` (`PROJECT_DELETE`, `OK`; opaque ids only, no slug, repository name or free text), guarded by `WHERE EXISTS (SELECT 1 FROM projects WHERE project_id = ?)` so a duplicate or retried request writes nothing;
2. `UPDATE project_identities SET deleted_at = ?, deleted_by_principal_id = ? WHERE project_id = ? AND deleted_at IS NULL` (unlocks the delete triggers and blocks resurrection);
3. `DELETE connection_project_grants` for the project;
4. `DELETE publisher_nonces` for the project's publishers;
5. `DELETE project_refs`, then `github_app_links`;
6. `DELETE ingest_conflicts`, `handoff_status_events`, `evidence`, `decisions`, `artifacts`;
7. `DELETE handoffs` (one statement, so self-referencing `supersedes_pk` rows are checked together at statement end), then `tasks`;
8. `UPDATE publishers SET status = 'REVOKED', revoked_at = ?, label = 'deleted', public_key = 'DELETED'` for the project (rows are retained so audit attribution keeps integrity; fingerprint kept, nothing sensitive);
9. `DELETE projects`.

**Tombstone:** the `project_identities` row (opaque `tenant_id`, `project_id`, `created_at`, `deleted_at`, `deleted_by_principal_id`), the project's publisher rows in scrubbed form, and the project's `audit_log` rows. These hold ids, timestamps, action codes and counts only. **Crash/retry:** the batch is atomic; a failure at any step rolls back everything (tested with a forced failure at each step); a retry after success finds no `projects` row and returns `ALREADY_DELETED` without writing. **Concurrency:** an ingest racing the delete either commits first (and is deleted with the project) or fails its foreign key afterward; a reader finds no grant and gets `NOT_FOUND`. OAuth-library KV grant state is revoked separately, and D1 stays authoritative: a KV failure must not leave an active D1 grant.

### 5.2 Concurrent `server_seq` allocation and safe retries
- The sequence is computed **inside the insert statement**: `INSERT INTO handoffs (…, server_seq, …) SELECT …, COALESCE((SELECT MAX(server_seq) FROM handoffs WHERE project_id = ?), 0) + 1, … ON CONFLICT (project_id, handoff_key) DO NOTHING`. The application never reads the maximum and writes it back, because a stale read is exactly the race the unique index would otherwise have to catch.
- D1 runs batches as transactions one after another, so concurrent writers serialize; `UNIQUE (project_id, server_seq)` is the fail-closed backstop. A `server_seq` uniqueness violation aborts the whole batch (nothing written); the data Worker retries up to 3 times with jitter, then returns a retryable `503`.
- **Idempotent retries:** same `handoff_key` and same `payload_sha256` → success returning the existing `server_seq` with zero writes; same key, different hash → `409` plus an `ingest_conflicts` row (one batch); two simultaneous identical requests → exactly one row and both succeed.
- Gaps are allowed (`server_seq` is an order, not a count); ordering never uses client timestamps.

### 5.3 Immutable content and audited status transitions
Handoff content, decisions, evidence and artifacts are never updated: the DAL has no update function and triggers reject any update. Only `status`, `status_changed_at`, `status_reason` and `status_actor_principal_id` may change, along `ACTIVE → SUPERSEDED | RETRACTED` and `SUPERSEDED → RETRACTED`. Supersession happens only through the insert trigger for a newer same-project handoff. `RETRACTED` requires an owner principal of the same tenant and a reason code (`CHECK` + FK). Each transition appends a `handoff_status_events` row (trigger) and an `audit_log` row naming the actor (DAL, same batch). Trigger support in D1 is **[verify]**; if triggers prove unusable, the same rules move into the DAL plus the negative tests of §7 and this document must be changed to say so rather than claim database enforcement.

### 5.4 Server-controlled `GITHUB_APP` observations
The `source` of a ref observation is **derived by the server, never read from a request**. `WriteApi.ingestHandoff` accepts no `source` field (unknown fields are rejected) and hard-codes `PUBLISHER_REPORTED` with the authenticated publisher's id. A separate `WriteApi.recordAppObservation`, callable only from the future GitHub-App Worker, hard-codes `GITHUB_APP` and a stored installation id. At the database, a `GITHUB_APP` row needs a `github_app_links` row for the same project that only the owner can create, and a publisher id on such a row (or an installation id on a publisher row) violates the `CHECK`. Honest limit: SQLite cannot know which Worker issued a statement, so the structural defenses are the `CHECK`, the owner-created link, the separate entrypoints and the API-level negative tests; they are not cryptographic proof of origin.

## 6. Migration notes
Numbered forward-only files under `cloud/migrations/`; `0001` creates this schema and writes `schema_meta('schema_version','1')`. Any change is expand → backfill → contract with updated isolation tests. Fixtures are synthetic only. Rollback uses D1 point-in-time recovery/export (30 days paid / 7 days free per the independent audit; re-verify), rehearsed in staging. A future database-per-tenant layout keeps the same DDL.

## 7. Database-level negative test matrix (required; in addition to ProjectScope/DAL tests)
Fixture: tenants `t1`, `t2`; principals `u1∈t1`, `u2∈t2`; projects `p1`,`p2∈t1`, `p3∈t2`; connections `c1∈t1(u1)`, `c2∈t2(u2)`; publishers `pub1→p1`, `pub2→p2`, `pub3→p3`; handoffs `h1∈p1`, `h2∈p2`. Every case must fail (or succeed, where stated) **at the database** with a stable error class and leave `PRAGMA foreign_key_check` empty.

| ID | Statement | Expected |
|---|---|---|
| DB-01 | connection in `t1` with principal `u2` | FK violation (finding 1) |
| DB-02 | grant `(t1, c1, p3)`; grant `(t2, c1, p3)`; grant `(t1, c2, p1)` | FK violation ×3 (finding 2) |
| DB-03 | handoff in `p1` with `ingested_by` = `pub2` (and `pub3`) | FK violation (finding 3) |
| DB-04 | handoff in `p1` superseding `h2` | FK violation (finding 4) |
| DB-05 | audit `(t1, p3)`; audit `(t2, p1)` | FK violation ×2 (finding 5) |
| DB-06 | conflict in `p1` with `pub2`; conflict in `p1` for `h2`'s key | FK violation ×2 (finding 6) |
| DB-07 | ref `PUBLISHER_REPORTED` by `pub2` on `p1`; `GITHUB_APP` without a link; `GITHUB_APP` with a publisher id; `GITHUB_APP` with another project's link | FK or `CHECK` violation ×4 |
| DB-08 | audit actor `PUBLISHER` of another project; actor columns not matching `actor_kind`; actor connection of another tenant | FK or `CHECK` violation ×3 |
| DB-09 | handoff key naming another repository; key not ending in `::task::handoff`; uppercase or short SHA; `ingest_trust` other than `UNSIGNED_CLOUD_INGESTED`; evidence `execution_mode` other than `SELF_ASSERTED`; self-supersede | trigger or `CHECK` violation each |
| DB-10 | same `handoff_id`/`task_id` in two projects | **succeeds** (no collision) |
| DB-11 | duplicate `handoff_key` in one project; duplicate `server_seq` in one project | `UNIQUE` violation ×2 |
| DB-12 | `UPDATE` of handoff content columns; `UPDATE` of decisions, evidence, artifacts, events, conflicts | `ABORT` (immutable/append-only) |
| DB-13 | `ACTIVE→RETRACTED` without actor; `RETRACTED→ACTIVE`; `SUPERSEDED→ACTIVE`; superseding a non-ACTIVE handoff | `CHECK`/`ABORT` each |
| DB-14 | valid retraction by a same-tenant owner; valid supersession by a newer same-project handoff | **succeed**; status event rows created |
| DB-15 | `UPDATE`/`DELETE` of `audit_log`; `DELETE` of handoffs, decisions, evidence, artifacts, tasks, events, conflicts or projects outside the deletion procedure; recreate a deleted project | `ABORT` each |
| DB-16 | project deletion procedure on `p1` | succeeds; `p1` content gone, `p2`/`p3` untouched, tombstone and audit retained, publishers scrubbed, `foreign_key_check` empty |
| DB-17 | deletion batch with a forced failure at each step | full rollback (row counts unchanged) |
| DB-18 | concurrent writers allocating `server_seq`; stale-read allocation | contiguous unique sequence; stale read rejected by `UNIQUE` |
| DB-19 | `PRAGMA foreign_key_check`; `PRAGMA integrity_check` after the suite | empty / `ok` |

## 8. Local SQLite verification record
Revision 2's §3 DDL was extracted from this file and executed on fresh databases with `PRAGMA foreign_keys=ON` on 2026-11-18: SQLite 3.54.1 (Python `sqlite3`) and SQLite 3.50.6 (command-line `sqlite3`). The script loads 19 tables and 22 triggers with exit code 0; `PRAGMA foreign_key_check` is empty and `PRAGMA integrity_check` is `ok`.

The matrix of §7 was run as 79 assertions (each DB-01…DB-19 case, plus valid same-project inserts that must succeed): all behave as specified. The same five audited cases (DB-01…DB-05) were replayed against revision 1's DDL and were **accepted** there, reproducing the finding, and are **rejected** by revision 2. The harness is a throwaway script and is not part of this planning PR; its cases are the DB-xx table above and become committed tests in RH-P5-T2.

This is **local SQLite evidence only**. Executing §3 and §7 on Miniflare and on a real D1 staging database (including trigger support, `STRICT`, `randomblob()` and migration handling) remains an explicit T2 gate.
