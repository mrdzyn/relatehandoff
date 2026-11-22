# RH-P5 — D1 Schema and Data-Access Rules (proposal, revision 5)

**State:** Design only; no database exists. Revision 6 remediates independent audit findings P11-05/P11-06 with active-project guards for new publishers and GitHub App links; it also closes R-4's repository-identity mutation paths while retaining editable project metadata (§3, §5.6, §12). Revision 5 closes residual risk R-1 for credential tables with no-overwrite protection, one-way revocation and immutable identity/key material (§5.5, §11). Revision 4 closed P11-03/P11-04; revision 3 closed a status-history integrity gap; revision 2 remediated P11-01/P11-02. The DDL below becomes migration `0001` only at RH-P5-T2 after owner approval. See the [platform plan](RH-P5-PLATFORM-PLAN.md) and [threat model](RH-P5-THREAT-MODEL.md).

**What has and has not been verified.** The DDL was extracted from this file and executed on local SQLite with `PRAGMA foreign_keys=ON`; the record is in [§8](#8-local-sqlite-verification-record). Cloudflare documents that D1 enforces foreign keys by default and that `PRAGMA foreign_keys` cannot be changed by queries or migrations. **Not yet verified on D1/Miniflare:** `STRICT` tables, `CREATE TRIGGER` bodies (triggers are described as supported only in secondary sources), `randomblob()`, and multi-statement trigger handling in D1 migration files. Running this schema and the negative suite of §7 on Miniflare and on a real D1 staging database is an **explicit gate of RH-P5-T2**; until then every statement here is a proposal.

## 1. Conventions
- Ids are opaque, server-generated, random (≥ 128 bit), never sequential, and **globally unique** (a bare id can never alias another tenant's row). Timestamps are ISO-8601 UTC text. SHAs are 40-char lowercase hex. Enums are `CHECK` constraints mirrored from `src/schema.mjs` and `src/freshness.mjs` (parity-tested).
- **Composite-key discipline.** Every tenant-owned row carries `tenant_id`; every project-owned row carries `(tenant_id, project_id)`; every reference to a parent is a **composite foreign key that includes `tenant_id` (and `project_id` where the parent is project-owned)** and targets a `UNIQUE` constraint containing those same columns. A single-column reference to a tenant- or project-owned parent is a defect.
- No `ON DELETE CASCADE` anywhere, and the DAL never issues `INSERT OR REPLACE`, `REPLACE INTO`, `INSERT OR IGNORE` or `ON CONFLICT … DO UPDATE/DO NOTHING` (a static test scans every statement). SQLite runs `REPLACE` conflict resolution without firing `DELETE` triggers (`recursive_triggers` is off), so the no-overwrite triggers of §3 backstop this rule. Deletion is an explicit ordered procedure (§5.1). No column stores file contents, diffs, transcripts, tokens, passwords, private keys or local absolute paths.
- Database-level defenses (composite FKs, `CHECK`s, triggers) are **defense in depth**. They do not replace the `ProjectScope` checks in the data Worker, which remain the primary authorization boundary.

## 2. Relationship matrix (every actor/tenant/project relation)

| Child → parent | Enforced by | Prevents |
|---|---|---|
| `principals(tenant)` → `tenants` | FK | orphan principals |
| `oauth_connections(tenant, principal)` → `principals(tenant_id, principal_id)` | composite FK + `UNIQUE(tenant_id, principal_id)` | connection using another tenant's principal (finding 1) |
| `connection_project_grants(tenant, connection)` → `oauth_connections(tenant_id, connection_id)`, `(tenant, project)` → `projects(tenant_id, project_id)` and `(tenant, granted_by_principal_id)` → `principals` | three composite FKs sharing the same `tenant_id` (revision 5 adds the grantor) | grant joining one tenant's connection to another tenant's project (finding 2); grant authorized by another tenant's principal |
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

-- Repository identity is the provider-scoped immutable repo_id. Display name, slug, status and
-- default branch remain mutable. Triggers protect identity and reject REPLACE-style rebinding.

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
  UNIQUE (provider_grant_id),
  FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, principal_id)
) STRICT;

-- One row per authorization decision. A revoked grant is a permanent historical record: re-authorizing the
-- same connection for the same project inserts a NEW row (new grant_id, attributed to an active owner).
CREATE TABLE connection_project_grants (
  grant_id                TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL,
  connection_id           TEXT NOT NULL,
  project_id              TEXT NOT NULL,
  granted_by_principal_id TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  revoked_at              TEXT,
  FOREIGN KEY (tenant_id, connection_id)           REFERENCES oauth_connections(tenant_id, connection_id),
  FOREIGN KEY (tenant_id, project_id)              REFERENCES projects(tenant_id, project_id),
  FOREIGN KEY (tenant_id, granted_by_principal_id) REFERENCES principals(tenant_id, principal_id)
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
  UNIQUE (handoff_pk, to_status),
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
CREATE UNIQUE INDEX uq_grants_active     ON connection_project_grants (connection_id, project_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_project_time      ON audit_log (project_id, at DESC);

-- ---- Triggers: database-level defense in depth (not a substitute for DAL authorization) ----

-- A project row can be removed only by the ordered deletion procedure, which first sets
-- project_identities.deleted_at; a deleted identity can never be recreated.
CREATE TRIGGER trg_projects_no_resurrect BEFORE INSERT ON projects
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'project identity is deleted'); END;

CREATE TRIGGER trg_projects_no_overwrite BEFORE INSERT ON projects
WHEN EXISTS (SELECT 1 FROM projects
              WHERE project_id = NEW.project_id
                 OR (tenant_id = NEW.tenant_id AND slug = NEW.slug)
                 OR (tenant_id = NEW.tenant_id AND repo_id = NEW.repo_id))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite an existing project'); END;

CREATE TRIGGER trg_projects_repository_identity_immutable BEFORE UPDATE ON projects
WHEN NEW.provider IS NOT OLD.provider OR NEW.repo_id IS NOT OLD.repo_id
BEGIN SELECT RAISE(ABORT, 'canonical repository identity is immutable'); END;

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

-- Status history is frozen: the status attribution columns can change only together with a status transition
-- (a same-status update that rewrites reason, time or actor would otherwise bypass the event trigger), and a
-- transition cannot move the status time backwards.
CREATE TRIGGER trg_handoffs_status_frozen BEFORE UPDATE ON handoffs
WHEN NEW.status IS OLD.status
 AND (NEW.status_changed_at IS NOT OLD.status_changed_at
   OR NEW.status_reason IS NOT OLD.status_reason
   OR NEW.status_actor_principal_id IS NOT OLD.status_actor_principal_id)
BEGIN SELECT RAISE(ABORT, 'status history is frozen unless status changes'); END;

CREATE TRIGGER trg_handoffs_status_time BEFORE UPDATE OF status ON handoffs
WHEN NEW.status <> OLD.status AND NEW.status_changed_at < COALESCE(OLD.status_changed_at, '')
BEGIN SELECT RAISE(ABORT, 'status time cannot move backwards'); END;

-- A status event can only mirror the handoff's current state after a valid transition; with
-- UNIQUE (handoff_pk, to_status) this makes hand-inserted, duplicated or divergent events impossible.
CREATE TRIGGER trg_events_mirror_state BEFORE INSERT ON handoff_status_events
WHEN NOT EXISTS (SELECT 1 FROM handoffs h
                  WHERE h.handoff_pk = NEW.handoff_pk AND h.tenant_id = NEW.tenant_id AND h.project_id = NEW.project_id
                    AND h.status = NEW.to_status AND h.status_changed_at IS NEW.at
                    AND h.status_reason IS NEW.reason AND h.status_actor_principal_id IS NEW.actor_principal_id)
  OR NOT ((NEW.from_status = 'ACTIVE' AND NEW.to_status IN ('SUPERSEDED','RETRACTED'))
       OR (NEW.from_status = 'SUPERSEDED' AND NEW.to_status = 'RETRACTED'))
  -- provenance of the previous status: RETRACTED follows SUPERSEDED exactly when a SUPERSEDED event exists
  OR NEW.from_status <> CASE WHEN NEW.to_status = 'RETRACTED' AND EXISTS
         (SELECT 1 FROM handoff_status_events e WHERE e.handoff_pk = NEW.handoff_pk AND e.to_status = 'SUPERSEDED')
       THEN 'SUPERSEDED' ELSE 'ACTIVE' END
BEGIN SELECT RAISE(ABORT, 'status event must mirror a valid handoff state change'); END;

-- No overwrite by insert. BEFORE INSERT triggers fire before conflict resolution, so they also stop
-- INSERT OR REPLACE / OR IGNORE, which SQLite executes without firing DELETE triggers (recursive_triggers is off).
-- Idempotent ingestion therefore uses INSERT ... SELECT ... WHERE NOT EXISTS, never ON CONFLICT or OR REPLACE.
-- Every PRIMARY KEY / UNIQUE path of a guarded table is checked, not only the primary key: REPLACE resolves a
-- conflict on any unique index by deleting the other row(s). project_identities has two (the composite key and
-- UNIQUE (project_id)), handoff_status_events has two (event_id and (handoff_pk, to_status)), handoffs has three.
CREATE TRIGGER trg_identities_no_overwrite BEFORE INSERT ON project_identities
WHEN EXISTS (SELECT 1 FROM project_identities
              WHERE project_id = NEW.project_id OR (tenant_id = NEW.tenant_id AND project_id = NEW.project_id))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite a project identity'); END;
CREATE TRIGGER trg_handoffs_no_overwrite BEFORE INSERT ON handoffs
WHEN EXISTS (SELECT 1 FROM handoffs WHERE handoff_pk = NEW.handoff_pk
              OR (project_id = NEW.project_id AND (handoff_key = NEW.handoff_key OR server_seq = NEW.server_seq)))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite an existing handoff'); END;
CREATE TRIGGER trg_audit_no_overwrite BEFORE INSERT ON audit_log
WHEN EXISTS (SELECT 1 FROM audit_log WHERE audit_id = NEW.audit_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite an audit row'); END;
CREATE TRIGGER trg_events_no_overwrite BEFORE INSERT ON handoff_status_events
WHEN EXISTS (SELECT 1 FROM handoff_status_events
              WHERE event_id = NEW.event_id OR (handoff_pk = NEW.handoff_pk AND to_status = NEW.to_status))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite a status event'); END;
CREATE TRIGGER trg_decisions_no_overwrite BEFORE INSERT ON decisions
WHEN EXISTS (SELECT 1 FROM decisions WHERE handoff_pk = NEW.handoff_pk AND decision_id = NEW.decision_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite a decision'); END;
CREATE TRIGGER trg_evidence_no_overwrite BEFORE INSERT ON evidence
WHEN EXISTS (SELECT 1 FROM evidence WHERE handoff_pk = NEW.handoff_pk AND evidence_id = NEW.evidence_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite evidence'); END;
CREATE TRIGGER trg_artifacts_no_overwrite BEFORE INSERT ON artifacts
WHEN EXISTS (SELECT 1 FROM artifacts WHERE handoff_pk = NEW.handoff_pk AND path = NEW.path)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite an artifact'); END;
CREATE TRIGGER trg_conflicts_no_overwrite BEFORE INSERT ON ingest_conflicts
WHEN EXISTS (SELECT 1 FROM ingest_conflicts WHERE conflict_id = NEW.conflict_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite a conflict record'); END;
CREATE TRIGGER trg_tasks_no_overwrite BEFORE INSERT ON tasks
WHEN EXISTS (SELECT 1 FROM tasks WHERE project_id = NEW.project_id AND task_id = NEW.task_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite a task'); END;

-- The deletion marker cannot be rewritten, cleared or deleted once set, and identity keys never change.
CREATE TRIGGER trg_identities_frozen BEFORE UPDATE ON project_identities
WHEN NEW.tenant_id IS NOT OLD.tenant_id OR NEW.project_id IS NOT OLD.project_id OR NEW.created_at IS NOT OLD.created_at
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'project identity is frozen'); END;
CREATE TRIGGER trg_identities_no_delete BEFORE DELETE ON project_identities
BEGIN SELECT RAISE(ABORT, 'project identities are never deleted'); END;

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

-- ---- Credential tables (publishers, OAuth connections, reader grants, GitHub App links) ----
-- Scope: only security-sensitive credential/authorization tables are locked. Ordinary mutable administrative
-- tables (tenants, principals, projects, project_refs, schema_meta, publisher_nonces) are NOT blanket-locked.
-- Rules: credential identity and key material are immutable; revocation is one-way and permanent; a revoked
-- credential or grant is never reused or overwritten; rotation or re-authorization inserts a NEW row.
-- "Project is being deleted" means project_identities.deleted_at IS NOT NULL (set only by deleteProject).

-- Publishers: new credential = new row. A revoked or active key can never be re-registered in the project
-- (UNIQUE (project_id, key_fpr) includes revoked rows), and rows are never deleted (deleteProject scrubs them).
CREATE TRIGGER trg_publishers_no_overwrite BEFORE INSERT ON publishers
WHEN EXISTS (SELECT 1 FROM publishers
              WHERE publisher_id = NEW.publisher_id OR (project_id = NEW.project_id AND key_fpr = NEW.key_fpr))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite or reuse a publisher credential'); END;
CREATE TRIGGER trg_publishers_project_active BEFORE INSERT ON publishers
WHEN NOT EXISTS (SELECT 1 FROM projects p JOIN project_identities i
                   ON i.tenant_id = p.tenant_id AND i.project_id = p.project_id
                  WHERE p.tenant_id = NEW.tenant_id AND p.project_id = NEW.project_id
                    AND p.status = 'ACTIVE' AND i.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'publisher registration requires an ACTIVE, non-deleted project'); END;
CREATE TRIGGER trg_publishers_immutable BEFORE UPDATE ON publishers
WHEN NEW.publisher_id IS NOT OLD.publisher_id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.project_id IS NOT OLD.project_id
  OR NEW.agent_kind IS NOT OLD.agent_kind OR NEW.key_fpr IS NOT OLD.key_fpr
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'publisher credential identity is immutable'); END;
CREATE TRIGGER trg_publishers_key_frozen BEFORE UPDATE ON publishers
WHEN NEW.public_key IS NOT OLD.public_key
 AND NOT (NEW.public_key = 'DELETED'
          AND (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'publisher public key is immutable (rotate by registering a new publisher)'); END;
CREATE TRIGGER trg_publishers_revocation_one_way BEFORE UPDATE ON publishers
WHEN OLD.status = 'REVOKED' AND (NEW.status IS NOT OLD.status OR NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT, 'publisher revocation is permanent'); END;
CREATE TRIGGER trg_publishers_no_delete BEFORE DELETE ON publishers
BEGIN SELECT RAISE(ABORT, 'publishers are revoked, never deleted'); END;

-- OAuth connections: identity immutable, revocation permanent (and cascading to the connection's grants).
CREATE TRIGGER trg_connections_no_overwrite BEFORE INSERT ON oauth_connections
WHEN EXISTS (SELECT 1 FROM oauth_connections
              WHERE connection_id = NEW.connection_id OR provider_grant_id = NEW.provider_grant_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite or alias an OAuth connection'); END;
CREATE TRIGGER trg_connections_immutable BEFORE UPDATE ON oauth_connections
WHEN NEW.connection_id IS NOT OLD.connection_id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.principal_id IS NOT OLD.principal_id
  OR NEW.client_id IS NOT OLD.client_id OR NEW.provider_grant_id IS NOT OLD.provider_grant_id OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'OAuth connection identity is immutable'); END;
CREATE TRIGGER trg_connections_revocation_one_way BEFORE UPDATE ON oauth_connections
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'connection revocation is permanent'); END;
CREATE TRIGGER trg_connections_revoke_cascade AFTER UPDATE OF revoked_at ON oauth_connections
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  UPDATE connection_project_grants SET revoked_at = NEW.revoked_at
   WHERE connection_id = NEW.connection_id AND revoked_at IS NULL;
END;
CREATE TRIGGER trg_connections_no_delete BEFORE DELETE ON oauth_connections
BEGIN SELECT RAISE(ABORT, 'OAuth connections are revoked, never deleted'); END;

-- Reader grants: explicit re-authorization = a new row by an active owner of the same tenant, only for an
-- unrevoked connection and an ACTIVE project; the previous revoked row stays as history.
CREATE TRIGGER trg_grants_no_overwrite BEFORE INSERT ON connection_project_grants
WHEN EXISTS (SELECT 1 FROM connection_project_grants
              WHERE grant_id = NEW.grant_id
                 OR (connection_id = NEW.connection_id AND project_id = NEW.project_id AND revoked_at IS NULL))
BEGIN SELECT RAISE(ABORT, 'insert would overwrite or duplicate an active grant'); END;
CREATE TRIGGER trg_grants_connection_active BEFORE INSERT ON connection_project_grants
WHEN NOT EXISTS (SELECT 1 FROM oauth_connections WHERE connection_id = NEW.connection_id AND revoked_at IS NULL)
  OR NEW.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a grant needs an unrevoked connection and is created active'); END;
CREATE TRIGGER trg_grants_project_active BEFORE INSERT ON connection_project_grants
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND status = 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'a grant needs an ACTIVE project'); END;
CREATE TRIGGER trg_grants_owner_grantor BEFORE INSERT ON connection_project_grants
WHEN NOT EXISTS (SELECT 1 FROM principals
                  WHERE tenant_id = NEW.tenant_id AND principal_id = NEW.granted_by_principal_id
                    AND role = 'OWNER' AND status = 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'a grant must be authorized by an active owner'); END;
CREATE TRIGGER trg_grants_immutable BEFORE UPDATE ON connection_project_grants
WHEN NEW.grant_id IS NOT OLD.grant_id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.connection_id IS NOT OLD.connection_id
  OR NEW.project_id IS NOT OLD.project_id OR NEW.granted_by_principal_id IS NOT OLD.granted_by_principal_id
  OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'grant identity is immutable'); END;
CREATE TRIGGER trg_grants_revocation_one_way BEFORE UPDATE ON connection_project_grants
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'grant revocation is permanent (re-authorize with a new grant)'); END;
CREATE TRIGGER trg_grants_guard_delete BEFORE DELETE ON connection_project_grants
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;

-- GitHub App links: identity immutable, revocation permanent; a revoked installation is never re-linked
-- (register the new installation id instead).
CREATE TRIGGER trg_app_links_no_overwrite BEFORE INSERT ON github_app_links
WHEN EXISTS (SELECT 1 FROM github_app_links WHERE project_id = NEW.project_id AND installation_id = NEW.installation_id)
BEGIN SELECT RAISE(ABORT, 'insert would overwrite or re-link an app installation'); END;
CREATE TRIGGER trg_app_links_owner_creator BEFORE INSERT ON github_app_links
WHEN NOT EXISTS (SELECT 1 FROM principals
                  WHERE tenant_id = NEW.tenant_id AND principal_id = NEW.created_by_principal_id
                    AND role = 'OWNER' AND status = 'ACTIVE')
  OR NEW.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'an app link must be created active by an active owner'); END;
CREATE TRIGGER trg_app_links_project_active BEFORE INSERT ON github_app_links
WHEN NOT EXISTS (SELECT 1 FROM projects p JOIN project_identities i
                   ON i.tenant_id = p.tenant_id AND i.project_id = p.project_id
                  WHERE p.tenant_id = NEW.tenant_id AND p.project_id = NEW.project_id
                    AND p.status = 'ACTIVE' AND i.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'app link registration requires an ACTIVE, non-deleted project'); END;
CREATE TRIGGER trg_app_links_immutable BEFORE UPDATE ON github_app_links
WHEN NEW.tenant_id IS NOT OLD.tenant_id OR NEW.project_id IS NOT OLD.project_id OR NEW.installation_id IS NOT OLD.installation_id
  OR NEW.created_by_principal_id IS NOT OLD.created_by_principal_id OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'app link identity is immutable'); END;
CREATE TRIGGER trg_app_links_revocation_one_way BEFORE UPDATE ON github_app_links
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'app link revocation is permanent'); END;
CREATE TRIGGER trg_app_links_guard_delete BEFORE DELETE ON github_app_links
WHEN (SELECT deleted_at FROM project_identities WHERE tenant_id = OLD.tenant_id AND project_id = OLD.project_id) IS NULL
BEGIN SELECT RAISE(ABORT, 'delete only via project deletion'); END;

-- Revoked credentials cannot be used: ingestion needs an ACTIVE publisher, observations need an ACTIVE
-- publisher or an unrevoked app link.
CREATE TRIGGER trg_handoffs_publisher_active BEFORE INSERT ON handoffs
WHEN NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id = NEW.ingested_by AND status = 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'ingestion requires an ACTIVE publisher'); END;
CREATE TRIGGER trg_refs_credential_active_insert BEFORE INSERT ON project_refs
WHEN (NEW.source = 'PUBLISHER_REPORTED'
      AND NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id = NEW.observed_by_publisher_id AND status = 'ACTIVE'))
  OR (NEW.source = 'GITHUB_APP'
      AND NOT EXISTS (SELECT 1 FROM github_app_links WHERE project_id = NEW.project_id
                         AND installation_id = NEW.app_installation_id AND revoked_at IS NULL))
BEGIN SELECT RAISE(ABORT, 'observation requires an active publisher or app link'); END;
CREATE TRIGGER trg_refs_credential_active_update BEFORE UPDATE ON project_refs
WHEN (NEW.source = 'PUBLISHER_REPORTED'
      AND NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id = NEW.observed_by_publisher_id AND status = 'ACTIVE'))
  OR (NEW.source = 'GITHUB_APP'
      AND NOT EXISTS (SELECT 1 FROM github_app_links WHERE project_id = NEW.project_id
                         AND installation_id = NEW.app_installation_id AND revoked_at IS NULL))
BEGIN SELECT RAISE(ABORT, 'observation requires an active publisher or app link'); END;
```

Notes (revision 5): the four credential tables are protected by `trg_publishers_*`, `trg_connections_*`, `trg_grants_*` and `trg_app_links_*`: no-overwrite guards on every unique path (including the new `UNIQUE (provider_grant_id)` and the partial unique index of active grants), immutable identity/key material, permanent one-way revocation, no deletion outside `deleteProject`, grants only for an unrevoked connection, an ACTIVE project and an active owner grantor, revocation of a connection cascading to its grants, and credential-use checks (ingestion and observations need an ACTIVE publisher or an unrevoked app link). Ordinary administrative tables are deliberately not locked. Every guarded table's `BEFORE INSERT` trigger checks **all** of its PRIMARY KEY / UNIQUE paths, not only the primary key (`project_identities`: composite key and `UNIQUE (project_id)`; `handoff_status_events`: `event_id` and `(handoff_pk, to_status)`; `handoffs`: primary key, `(project_id, handoff_key)` and `(project_id, server_seq)`), because SQLite resolves `REPLACE` on any unique index by deleting the other row without firing `DELETE` triggers (§3.1). Status events additionally carry a previous-status provenance check (`RETRACTED` follows `SUPERSEDED` exactly when a `SUPERSEDED` event exists), which is defense in depth and not a substitute for the overwrite guard. A status change is allowed only as a transition, and `status_changed_at`, `status_reason` and `status_actor_principal_id` are frozen whenever `status` does not change (`trg_handoffs_status_frozen`); status events can only mirror the handoff's current state after a valid transition and are unique per `(handoff_pk, to_status)`; `BEFORE INSERT` triggers refuse to overwrite existing rows of append-only tables. The initial write of `project_identities.deleted_at` is allowed to any statement that can update that table (SQLite cannot tell the caller), so only `WriteApi.deleteProject` may do it (DAL rule, API-level test); once set it is frozen. Supersession is applied atomically by the insert trigger, so a handoff cannot be superseded without a newer same-project handoff. `GITHUB_APP` rows require an owner-created `github_app_links` row for that project. `project_identities.deleted_at` is set only by the deletion procedure. Trigger bodies need uppercase `BEGIN`/`END` and may need single-statement handling in D1 migration files **[verify]**.

### 3.1 Overwrite-path inventory (every PRIMARY KEY / UNIQUE path)
`INSERT OR REPLACE` (and an upsert whose target is any unique index) resolves a conflict by deleting the existing row, and with `recursive_triggers` off (the SQLite default; D1's setting is **not** verified and must not be relied on) no `DELETE` trigger fires. Foreign keys do not help: they are checked at statement end, and a replacement with the same key satisfies them. Hence each immutable table needs a `BEFORE INSERT` guard covering **every** unique path.

| Table (immutable) | PK / UNIQUE paths | Guard |
|---|---|---|
| `handoffs` | PK `handoff_pk`; `(project_id, handoff_key)`; `(project_id, server_seq)`; `(tenant_id, project_id, handoff_pk)` and `(tenant_id, project_id, handoff_key)` (both subsumed: a conflict implies a conflict on the PK / `(project_id, handoff_key)`) | `trg_handoffs_no_overwrite` |
| `tasks` | PK `(project_id, task_id)`; `(tenant_id, project_id, task_id)` (subsumed) | `trg_tasks_no_overwrite` |
| `decisions` / `evidence` / `artifacts` | PK `(handoff_pk, decision_id | evidence_id | path)` | `trg_decisions_/evidence_/artifacts_no_overwrite` |
| `ingest_conflicts`, `audit_log` | PK `conflict_id`, `audit_id` | `trg_conflicts_/audit_no_overwrite` |
| `handoff_status_events` | PK `event_id`; **`(handoff_pk, to_status)`** | `trg_events_no_overwrite` (both paths, revision 4) |
| `project_identities` | PK `(tenant_id, project_id)`; **`UNIQUE (project_id)`** | `trg_identities_no_overwrite` (both paths, revision 4) |
| `publishers` (credential) | PK `publisher_id`; **`UNIQUE (project_id, key_fpr)`** (includes revoked keys); `(tenant_id, project_id, publisher_id)` (subsumed) | `trg_publishers_no_overwrite` (revision 5) |
| `oauth_connections` (credential) | PK `connection_id`; **`UNIQUE (provider_grant_id)`** (new); `(tenant_id, connection_id)` (subsumed) | `trg_connections_no_overwrite` (revision 5) |
| `connection_project_grants` (credential) | PK `grant_id` (new); **partial `UNIQUE (connection_id, project_id) WHERE revoked_at IS NULL`** | `trg_grants_no_overwrite` (revision 5) |
| `github_app_links` (credential) | PK `(project_id, installation_id)`; `(tenant_id, project_id, installation_id)` (subsumed) | `trg_app_links_no_overwrite` (revision 5) |

Remaining mutable administrative tables (`tenants`, `principals`, `project_refs`, `schema_meta`, `publisher_nonces`) remain DAL-guarded only; their rows legitimately change and they are deliberately not blanket-locked. `projects` remains mutable for metadata updates, but canonical repository identity is immutable and `INSERT OR REPLACE` collisions are blocked across its declared unique paths (§5.6). `project_refs` and `schema_meta` can still be changed by REPLACE if DAL rules are violated; this is the narrowed residual R-4.

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
3. `DELETE connection_project_grants` and (step 5) `github_app_links` for the project (the credential delete guards allow this only after step 2);
4. `DELETE publisher_nonces` for the project's publishers;
5. `DELETE project_refs`, then `github_app_links`;
6. `DELETE ingest_conflicts`, `handoff_status_events`, `evidence`, `decisions`, `artifacts`;
7. `DELETE handoffs` (one statement, so self-referencing `supersedes_pk` rows are checked together at statement end), then `tasks`;
8. `UPDATE publishers SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, ?), label = 'deleted', public_key = 'DELETED'` for the project (allowed by the credential triggers only because the identity is already marked deleted; an already revoked publisher keeps its original `revoked_at`) (rows are retained so audit attribution keeps integrity; fingerprint kept, nothing sensitive);
9. `DELETE projects`.

**Tombstone:** the `project_identities` row (opaque `tenant_id`, `project_id`, `created_at`, `deleted_at`, `deleted_by_principal_id`), the project's publisher rows in scrubbed form, and the project's `audit_log` rows. These hold ids, timestamps, action codes and counts only. **Crash/retry:** the batch is atomic; a failure at any step rolls back everything (tested with a forced failure at each step); a retry after success finds no `projects` row and returns `ALREADY_DELETED` without writing. **Concurrency:** an ingest racing the delete either commits first (and is deleted with the project) or fails its foreign key afterward; a reader finds no grant and gets `NOT_FOUND`. OAuth-library KV grant state is revoked separately, and D1 stays authoritative: a KV failure must not leave an active D1 grant.

### 5.2 Concurrent `server_seq` allocation and safe retries
- The sequence is computed **inside the insert statement**: `INSERT INTO handoffs (…, server_seq, …) SELECT …, COALESCE((SELECT MAX(server_seq) FROM handoffs WHERE project_id = ?), 0) + 1, … WHERE NOT EXISTS (SELECT 1 FROM handoffs WHERE project_id = ? AND handoff_key = ?)`. The idempotent path is the `WHERE NOT EXISTS` (a duplicate inserts zero rows, so no trigger fires); `ON CONFLICT` and `OR REPLACE` are not used because the no-overwrite triggers (§3) reject them. The application never reads the maximum and writes it back, because a stale read is exactly the race the unique index would otherwise have to catch.
- D1 runs batches as transactions one after another, so concurrent writers serialize; `UNIQUE (project_id, server_seq)` is the fail-closed backstop. A `server_seq` uniqueness violation aborts the whole batch (nothing written); the data Worker retries up to 3 times with jitter, then returns a retryable `503`.
- **Idempotent retries:** same `handoff_key` and same `payload_sha256` → success returning the existing `server_seq` with zero writes; same key, different hash → `409` plus an `ingest_conflicts` row (one batch); two simultaneous identical requests → exactly one row and both succeed.
- Gaps are allowed (`server_seq` is an order, not a count); ordering never uses client timestamps.

### 5.3 Immutable content and audited status transitions
Handoff content, decisions, evidence and artifacts are never updated: the DAL has no update function and triggers reject any update. Only `status`, `status_changed_at`, `status_reason` and `status_actor_principal_id` may change, **and only together with a status transition**: along `ACTIVE → SUPERSEDED | RETRACTED` and `SUPERSEDED → RETRACTED`, with a status time that does not move backwards. A same-status update that rewrites reason, time or actor (including `SET status = status, …`) is rejected; a same-value no-op is accepted and writes nothing, and no event. Supersession happens only through the insert trigger for a newer same-project handoff. `RETRACTED` requires an owner principal of the same tenant and a reason code (`CHECK` + FK). Each transition appends exactly one `handoff_status_events` row (trigger) that mirrors the handoff row, and an `audit_log` row naming the actor (DAL, same batch). Hand-inserted, duplicated, divergent or impossible-transition events are rejected, and inserts cannot overwrite existing history rows. Trigger support in D1 is **[verify]**; if triggers prove unusable, the same rules move into the DAL plus the negative tests of §7 and this document must be changed to say so rather than claim database enforcement.

### 5.4 Server-controlled `GITHUB_APP` observations
The `source` of a ref observation is **derived by the server, never read from a request**. `WriteApi.ingestHandoff` accepts no `source` field (unknown fields are rejected) and hard-codes `PUBLISHER_REPORTED` with the authenticated publisher's id. A separate `WriteApi.recordAppObservation`, callable only from the future GitHub-App Worker, hard-codes `GITHUB_APP` and a stored installation id. At the database, a `GITHUB_APP` row needs a `github_app_links` row for the same project that only the owner can create, and a publisher id on such a row (or an installation id on a publisher row) violates the `CHECK`. Honest limit: SQLite cannot know which Worker issued a statement, so the structural defenses are the `CHECK`, the owner-created link, the separate entrypoints and the API-level negative tests; they are not cryptographic proof of origin.

### 5.5 Credential lifecycle: rotation, revocation and re-authorization (R-1, owner decision)
- **Identity and key material are immutable.** A publisher's id, project, `agent_kind`, `key_fpr`, `public_key`, `created_at` and `expires_at`; a connection's id, principal, client, `provider_grant_id` and `created_at`; a grant's ids, grantor and `created_at`; an app link's installation and creator never change. Only labels, `last_used_at` and the one-way `revoked_at` may change.
- **Revocation is one-way and permanent**, for publishers, connections, grants and app links. `revoked_at` can go from `NULL` to a value once and never changes again; there is no un-revoke. Revoking a connection revokes its still-active grants in the same statement (trigger).
- **Key rotation uses a new credential.** The owner registers a **new publisher** (new `publisher_id`, new public key) for the project, both may be ACTIVE during an overlap, then the old publisher is revoked. Handoffs ingested earlier keep their attribution to the old publisher. A key can never be re-registered in the project (`UNIQUE (project_id, key_fpr)` counts revoked rows), so a revoked or swapped key cannot return under another id.
- **Re-authorization is an explicit new decision.** A revoked grant stays as history. Re-authorizing the same connection for the same project inserts a **new grant row** (new `grant_id`) with `granted_by_principal_id` an active OWNER of the tenant, only for an unrevoked connection and an ACTIVE project; at most one active grant per (connection, project) exists (partial unique index). A revoked connection cannot be revived: the client must obtain a **new connection** through a fresh OAuth consent. A revoked GitHub App link is never re-linked; the owner registers the new installation id.
- **Revoked credentials cannot act.** A handoff insert requires an ACTIVE publisher; a ref observation requires an ACTIVE publisher or an unrevoked app link. (Expiry against the clock stays an application check; `expires_at` is immutable.)
- **Grant-key model change (needs owner approval, recorded as D15 in the platform plan).** Revision 4 keyed grants by `(connection_id, project_id)`, which made a legitimate re-authorization impossible without overwriting the revoked row. Revision 5 introduces `grant_id` as the primary key, `granted_by_principal_id`, and a partial unique index for active grants.
- **Scope.** The four credential tables have lifecycle guards. Principals, tenants, `project_refs`, `publisher_nonces` and `schema_meta` stay ordinary mutable tables (DB-36); projects retain mutable metadata but protect repository identity and replacement paths (§5.6).

### 5.6 Project lifecycle and canonical repository identity (P11-05, P11-06, R-4)
- **New credentials require an active project.** `publishers` and `github_app_links` inserts require a matching `projects` row with `status='ACTIVE'` joined to a `project_identities` row with `deleted_at IS NULL`. Missing, archived and deleted projects are rejected. Valid publisher registration/key rotation and owner-created app links remain available for active projects. Existing project reads/writes continue to use the archive denial rule (§4.4).
- **Registration/deletion race:** writes serialize within the database transaction model. If registration commits first, ordered deletion then revokes and scrubs that publisher/removes the app link. If deletion commits first, its tombstone and missing `projects` row make registration abort. The T2 gate tests both serializations and verifies the selected D1 batch behavior.
- **Canonical identity:** `(provider, repo_id)` is immutable. The `BEFORE UPDATE` trigger rejects changing either field while leaving `slug`, `repo_full_name` (GitHub rename display), `default_branch`, and other metadata mutable. A `BEFORE INSERT` guard rejects collisions on `project_id`, `(tenant_id, slug)`, and `(tenant_id, repo_id)`, preventing `INSERT OR REPLACE` from deleting/rebinding a project through any declared UNIQUE key. Ordinary metadata updates remain available.
- **Owner decision:** none is introduced for P11-05/P11-06; active-project denial follows existing archive/deletion policy. R-4 protection expresses the canonical repository identity boundary. If a future product requires moving a project to a different provider/repository, that requires a separately approved migration/re-registration flow; this plan does not silently permit identity mutation.

## 6. Migration notes
Numbered forward-only files under `cloud/migrations/`; `0001` creates this schema and writes `schema_meta('schema_version','1')`. Any change is expand → backfill → contract with updated isolation tests. Fixtures are synthetic only. Rollback uses D1 point-in-time recovery/export (30 days paid / 7 days free per the independent audit; re-verify), rehearsed in staging. A future database-per-tenant layout keeps the same DDL.

## 7. Database-level negative test matrix (required; in addition to ProjectScope/DAL tests)
Fixture: tenants `t1`, `t2`; principals `u1∈t1`, `u2∈t2`; projects `p1`,`p2∈t1`, `p3∈t2`; connections `c1∈t1(u1)`, `c2∈t2(u2)`; publishers `pub1→p1`, `pub2→p2`, `pub3→p3`; handoffs `h1∈p1`, `h2∈p2`. Every case must fail (or succeed, where stated) **at the database** with a stable error class and leave `PRAGMA foreign_key_check` empty.

| ID | Statement | Expected |
|---|---|---|
| DB-01 | connection in `t1` with principal `u2` | FK violation (finding 1) |
| DB-02 | grant `(t1, c1, p3)`; grant `(t2, c1, p3)`; grant `(t1, c2, p1)` | rejected ×3 (FK or credential trigger) (finding 2) |
| DB-03 | handoff in `p1` with `ingested_by` = `pub2` (and `pub3`) | FK violation (finding 3) |
| DB-04 | handoff in `p1` superseding `h2` | FK violation (finding 4) |
| DB-05 | audit `(t1, p3)`; audit `(t2, p1)` | FK violation ×2 (finding 5) |
| DB-06 | conflict in `p1` with `pub2`; conflict in `p1` for `h2`'s key | FK violation ×2 (finding 6) |
| DB-07 | ref `PUBLISHER_REPORTED` by `pub2` on `p1`; `GITHUB_APP` without a link; `GITHUB_APP` with a publisher id; `GITHUB_APP` with another project's link | FK, `CHECK` or credential-use trigger ×4 |
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
| DB-18 | concurrent writers allocating `server_seq`; stale-read allocation; idempotent retry via `WHERE NOT EXISTS`; `ON CONFLICT DO NOTHING` on a guarded table | contiguous unique sequence; stale read rejected by `UNIQUE`; retry writes nothing and raises nothing; `ON CONFLICT` rejected |
| DB-19 | `PRAGMA foreign_key_check`; `PRAGMA integrity_check` after the suite | empty / `ok` |
| DB-20 | same-status rewrite of `status_reason`, `status_changed_at` or `status_actor_principal_id` on RETRACTED/SUPERSEDED/ACTIVE rows; `SET status = status, …`; same-value `status` with other attribution changed; clearing attribution | `ABORT`; row and event count unchanged (×8) |
| DB-21 | no-op updates (`SET status = status`, `SET x = x`, re-assert identical values, `SET summary = summary`) | accepted; nothing changes; no event |
| DB-22 | valid transitions: `ACTIVE→SUPERSEDED` (insert), `ACTIVE→RETRACTED`, `SUPERSEDED→RETRACTED` with later time and new actor; `SUPERSEDED→RETRACTED` with a time before the supersession | first three **succeed** with exactly one mirroring event each; backward time `ABORT` |
| DB-23 | hand-inserted status event for an ACTIVE handoff; duplicate of a genuine event; wrong actor; impossible transition; cross-tenant/project reference | `ABORT`/`UNIQUE`/FK; event count unchanged (×5) |
| DB-24 | `INSERT OR REPLACE`/`OR IGNORE` on audit, handoffs (same pk and same key), events, decisions, evidence, tasks; `ON CONFLICT DO UPDATE` on handoffs | `ABORT`; original rows intact |
| DB-25 | clear, rewrite or delete the `project_identities` deletion marker; change identity keys | `ABORT` (×5) |
| DB-26 | `PRAGMA foreign_key_check`/`integrity_check` on the regression fixture | empty / `ok` |
| DB-27 | **P11-03.** `INSERT OR REPLACE`, `OR IGNORE`, `ON CONFLICT DO NOTHING` and `ON CONFLICT(project_id) DO UPDATE` on `project_identities` for a deleted tombstone with an audit reference, a deleted tombstone without one, an active identity with projects/audit, and an active identity without references, each on the composite key (same tenant) and on `project_id` with a different tenant | `ABORT`; identity and audit rows byte-identical; `foreign_key_check` empty (×32). Afterwards: a project row still cannot be recreated for a deleted identity, a new project identity/project can still be created, the ordered deletion procedure still works and its fresh tombstone survives a `REPLACE` |
| DB-28 | **P11-04.** `INSERT OR REPLACE` with a new `event_id` and the same `(handoff_pk, to_status)` as a genuine `SUPERSEDED→RETRACTED` event but `from_status = 'ACTIVE'`; the same with different reason/actor/time; `OR IGNORE`; `ON CONFLICT DO NOTHING`; `ON CONFLICT(handoff_pk, to_status) DO UPDATE`; `OR REPLACE` with the genuine `event_id`; with `trg_events_no_overwrite` dropped the provenance predicate alone still rejects the forged `from_status` | `ABORT`; event table unchanged; genuine event intact (×8). Valid paths preserved: `ACTIVE→RETRACTED`, and `ACTIVE→SUPERSEDED` then `SUPERSEDED→RETRACTED`, each with the correct `from_status` |
| DB-29 | Exhaustive probe: every PK/UNIQUE path of the immutable and credential tables × {`OR REPLACE`, `OR IGNORE`, `ON CONFLICT DO NOTHING`, `ON CONFLICT DO UPDATE`} (132 probes), plus an inventory check that every unique index reported by `PRAGMA index_list` is covered or subsumed | no probe mutates a row; every `REPLACE`/`DO UPDATE` probe is rejected; no `foreign_key_check` violation; remaining mutable tables are reported, not asserted |
| DB-30 | **R-1 resurrection.** Un-revoke a publisher / connection / app link by `UPDATE`; rewrite a revoked `revoked_at`; `INSERT OR REPLACE` each revoked row as active; re-register a revoked key under a new publisher id; re-link a revoked installation; delete credential rows outside project deletion | `ABORT` each (×13), credential rows unchanged |
| DB-31 | **Grant reactivation and valid grants.** Un-revoke a grant; `OR REPLACE` a revoked grant; duplicate active grant (new id) and `OR REPLACE` of it; grant for a revoked connection, by a disabled owner, a MEMBER, another tenant's principal; for another tenant's or an ARCHIVED project; created pre-revoked. Valid: explicit re-authorization row after a revocation, history retained, initial grant on a new connection, one-way grant revocation, connection revocation cascading to its grants, no grant on the revoked connection | rejected (×12 negatives); valid cases **succeed** (×6) |
| DB-32 | **Key swaps and identity immutability.** `UPDATE` of `public_key`, `key_fpr`, `publisher_id`, `project_id`, `tenant_id`, `agent_kind`, `expires_at`, `created_at` on an ACTIVE publisher; `OR REPLACE` with a different key; `UPDATE` of connection principal/client/provider grant/tenant/created_at, grant ids/grantor/created_at, app link installation/creator/created_at/project. Allowed: publisher `label`, connection `last_used_at`/`client_label` | `ABORT` (×23); allowed edits **succeed** (×2) |
| DB-33 | **Alternate unique-key conflicts** on credential tables: new publisher id colliding on `(project_id, key_fpr)`, new connection colliding on `provider_grant_id`, each as `OR REPLACE`, `OR IGNORE`, `DO NOTHING`, `DO UPDATE` | rejected, rows unchanged (×8) |
| DB-34 | **Authorized key rotation.** Register a new publisher (new id, new key) while the old is active; the new one ingests; revoke the old (one-way); the old cannot ingest, cannot be reactivated, its key cannot be re-registered; old attribution retained; label edit still allowed; observations by the revoked publisher or a revoked app link rejected, by the new publisher or an unrevoked link accepted | rotation steps **succeed**; revoked-credential uses `ABORT` |
| DB-35 | Project deletion with credential triggers: grants/links removed, publishers scrubbed and revoked (an already revoked publisher keeps its `revoked_at`), other projects untouched, connections survive, scrubbed publisher still cannot be reactivated | succeeds; `foreign_key_check` empty |
| DB-36 | No blanket lock: `UPDATE` of `projects`, `principals`, `tenants`, `schema_meta`, a valid `project_refs` update, `publisher_nonces` insert/prune | all **succeed** |
| DB-37 | `PRAGMA foreign_key_check`/`integrity_check` on the credential fixtures | empty / `ok` |
| DB-38 | **P11-05.** Register publisher after deletion (tombstone survives, no project row), with missing project, and with ARCHIVED project; registration/deletion in both serialized orders. Valid registration and new-key rotation for ACTIVE project | rejected for deleted/missing/archived; registration-first is scrubbed/revoked by deletion, deletion-first registration aborts; active registration/rotation succeed |
| DB-39 | **P11-06.** Register a GitHub App link for ARCHIVED, deleted, or missing project; valid active-owner link for ACTIVE project; non-owner remains rejected | rejected for archived/deleted/missing or non-owner; valid ACTIVE owner link succeeds |
| DB-40 | **R-4.** `UPDATE` provider/repo_id; `INSERT OR REPLACE` collisions on project id, `(tenant_id, slug)`, and `(tenant_id, repo_id)`; ordinary `UPDATE` of slug, `repo_full_name`, `default_branch`, status | identity changes and replacement collisions `ABORT` without row reassignment; metadata updates succeed |

## 8. Local SQLite verification record
Revision 6's §3 DDL was extracted from this file and executed on fresh databases with `PRAGMA foreign_keys=ON` and `PRAGMA recursive_triggers=OFF` (the default) on 2026-11-20. The observed SQLite version, table/trigger counts, foreign-key check, integrity check and DB-01…DB-40 totals are recorded below after exact-source execution.

The documented DB-01…DB-40 case rows were exercised against the verbatim extracted §3 DDL using a temporary Python harness: **40/40 case scenarios passed, 174/174 assertions**, SQLite 3.54.1, `foreign_keys=ON`, `recursive_triggers=OFF`, 19 tables and 65 triggers. `foreign_key_check` returned no rows and `integrity_check` returned `ok`. This was case-row coverage and did not replace the earlier 259-assertion scratch harness.

**Focused DB-27/DB-29 recovery run (revision-6 source at input HEAD `a1146e462459ce000980208d09306e1ad006cb22`; temporary harness only, not committed):** the harness extracted the first complete SQL fence in §3 verbatim, asserted it begins with the foreign-key pragma, opened fresh in-memory SQLite databases for each probe, enabled `foreign_keys`, disabled `recursive_triggers`, and snapshotted every row in all 19 tables plus `foreign_key_check` and `integrity_check` immediately before and after each expected rejection. SQLite **3.54.1** loaded **19 tables / 65 triggers**. Final `foreign_key_check` was empty and `integrity_check` was `ok`.

- DB-27 recreated all **32/32** documented combinations: four identity states × two collision paths × four conflict forms. Each rejection proved the complete table row sets unchanged, the before/after FK and integrity results equal, and clean FK/integrity results. It also ran two project-identity controls: deleted-identity project recreation rejected unchanged; new identity/project creation accepted. Result: **32 probes, 97 assertions plus 2 control assertions, all pass**.
- DB-28's adjacent status-event overwrite/provenance guard was rechecked in **8/8** documented variants; each proved full-row and DB-integrity invariants. The no-overwrite trigger was dropped for the defense-in-depth provenance case. Result: **24 assertions, all pass**.
- DB-29 enumerated `PRAGMA index_list`, `index_info` and `index_xinfo` for all immutable/credential tables and `projects`. It found **30 physical unique paths** in that scope: **22 independent** and **8 subsumed** by narrower unique paths. It attempted `INSERT OR REPLACE`, `INSERT OR IGNORE`, untargeted `ON CONFLICT DO NOTHING`, and exact-target `ON CONFLICT … DO UPDATE` for every path: **120 probes, 360 row/FK/integrity assertions, all pass**. The active-grant partial index `(connection_id, project_id) WHERE revoked_at IS NULL` and all four `projects` keys (PK, tenant/project, tenant/repo, tenant/slug) were included. A separate all-table PRAGMA census found **42 physical unique paths** total; the other 12 are in mutable administrative tables (`schema_meta`, `tenants`, `principals`, `publisher_nonces`, `project_refs`) and remain DAL-guarded under the existing contract. They were inventoried, not incorrectly treated as immutable.
- Across DB-27, DB-28 and DB-29: **160 expected-rejection probes and 520 probe/inventory assertions passed** (DB-27 97, DB-28 24, DB-29 399; the DB-27 subtotal includes its assertion-count check). Two DB-27 lifecycle controls and 10 positive assertions also passed, for **532 total assertions, 0 failures**. Positive controls cover publisher rotation/use denial, connection revocation cascade, revoked-grant denial, fresh-grant reauthorization, project deletion scrubbing/audit retention, DB integrity, and permitted metadata edits. These are targeted controls, not a rerun of every DB-01…DB-40 scenario.

**Historical coverage mapping and limitation:** the prior DB-27 specification is fully reconstructed at the documented case level (32/32). The previous DB-29 record says **132 probes**; the old scratch harness and its exact PRAGMA path inventory are unavailable. This run reconstructs every current revision-6 immutable/credential/project unique path found in the stated scope (120 probes), but **does not identify or recreate the remaining 12 historical probes**; the historical record implies 33 paths while this revision-6 scope enumerates 30. Therefore the historical **259 assertions are not proven equivalent** and the overall historical recovery verdict remains **PARTIAL**. This evidence does not assert D1 behavior or actual concurrent transaction behavior. No D1/Miniflare test was run. The throwaway harness remains outside the planning PR; committed database tests remain part of RH-P5-T2.

**Canonical project validation (exact HEAD `7f5887ea15812f03fd5d6d04ff7a05653c2b0185`; macOS ARM64, Python 3.15.2, Node 26.7.0, real Relate v1.0.1):** `scripts/test_bootstrap.py`, `scripts/test_entrypoints.py`, `scripts/check_secret_tracking.py`, `scripts/validate_project_profile.py` and `scripts/validate.py` all exited 0; `validate.py` was **8/8 PASS**, clean tree. `RELATE_REQUIRE_CLI=1 npm test` was **15/15 PASS, 0 skipped**; `npm run test:security` **5/5 PASS**; `npm run build` exited 0. These validate the existing local Relate/MCP engine, not the proposed cloud schema. No D1/Miniflare test was run.

**Canonical project validation (this evidence-record commit, exact HEAD `b3a7e38293176dd3e96c3e091a0b55e8f8aca869`; macOS ARM64, Python 3.15.2, Node 26.7.0, real Relate v1.0.1):** bootstrap, entrypoints, secret tracking, project-profile validation all exited 0; `scripts/validate.py` was **8/8 PASS** on a clean tree; `RELATE_REQUIRE_CLI=1 npm test` was **15/15 PASS, 0 skipped**; `npm run test:security` was **5/5 PASS**; `npm run build` and `git diff --check` exited 0. The focused SQLite matrix was rerun after this commit with the same 160 probes/532 assertions and clean FK/integrity results. No D1/Miniflare test was run.

This is **local SQLite evidence only**. Executing §3 and §7 on Miniflare and on a real D1 staging database (including trigger support, `STRICT`, `randomblob()`, partial unique indexes, migration handling, and D1's `recursive_triggers` setting) remains an explicit T2 gate and is **UNVERIFIED**.

## 9. Regression record: status-history integrity (revision 2 → 3)
**Finding (targeted check of revision 2, reproduced on SQLite 3.54.1 with the revision-2 DDL).** `trg_handoffs_status_event` fires only when `status` changes and the content-immutability trigger deliberately excludes the four status columns, so after a retraction or supersession the attribution could be rewritten with **no new event**:
- `UPDATE handoffs SET status_reason = 'FORGED'` on a RETRACTED row (also `status_changed_at`, and `status_actor_principal_id` reassigned to another same-tenant owner), including `SET status = status, status_reason = …`; the same on SUPERSEDED rows. Events stayed at 1 while the row diverged.
- While reproducing it, the same invariant (history cannot change without an event) was found to be bypassable by: hand-inserting a status event for an ACTIVE handoff (the table had no insert guard); and `INSERT OR REPLACE` into `audit_log`, `handoffs` (same primary key) or `handoff_status_events`, which SQLite executes without firing `DELETE` triggers (`recursive_triggers` = 0), silently overwriting audit, handoff and event rows. `ON CONFLICT DO UPDATE` was already stopped by the immutability trigger.

**Fix (revision 3).** `trg_handoffs_status_frozen` (attribution frozen unless `status` changes), `trg_handoffs_status_time` (no backward time), `trg_events_mirror_state` plus `UNIQUE (handoff_pk, to_status)` (events must mirror a valid transition and cannot be forged or duplicated), `BEFORE INSERT` no-overwrite triggers on handoffs, audit, events, decisions, evidence, artifacts, conflicts and tasks, frozen/undeletable `project_identities` deletion marker, and the DAL/ingestion rule of §1 and §5.2 (`INSERT … WHERE NOT EXISTS`, no `OR REPLACE`/`ON CONFLICT`). Valid `ACTIVE → SUPERSEDED | RETRACTED` and `SUPERSEDED → RETRACTED` transitions, supersession by insert, and idempotent retries are preserved (DB-14, DB-18, DB-21, DB-22).

**Verification.** The new cases DB-20…DB-26 fail against the revision-2 DDL (28 of 119 assertions fail there, including all reproduced bypasses) and pass against revision 3 (119/119). One residual, by design: SQLite cannot identify the calling Worker, so the *first* write of `deleted_at` is permitted to any statement allowed to update `project_identities`; it is restricted to `deleteProject` by the DAL and an API-level test, and is frozen afterwards.

## 10. Regression record: overwrite paths on alternate unique keys (revision 3 → 4)
**P11-03 — reproduced (SQLite 3.54.1, `foreign_keys=ON`, `recursive_triggers=OFF`, revision-3 DDL).** `INSERT OR REPLACE INTO project_identities VALUES ('t1','p2','2026-01-01',NULL,NULL)` was **accepted** for a deleted identity that an audit row references: the deletion marker became `NULL`, `foreign_key_check` stayed empty, and `INSERT INTO projects` for that identity was then accepted, i.e. a deleted project could be resurrected. The same held for a deleted identity without audit rows, for active identities, and for `INSERT OR REPLACE ... ('t2', <project_id>, ...)` moving an unreferenced identity to another tenant through `UNIQUE (project_id)`. `trg_identities_frozen` (UPDATE) and `trg_identities_no_delete` (DELETE) did not apply, and no `BEFORE INSERT` guard existed for this table.

**P11-04 — reproduced.** A genuine `SUPERSEDED→RETRACTED` event was silently replaced by `INSERT OR REPLACE INTO handoff_status_events VALUES ('forged', …, 'ACTIVE','RETRACTED', …)`: `trg_events_no_overwrite` compared only `event_id`, while the table also has `UNIQUE (handoff_pk, to_status)`, and `trg_events_mirror_state` accepted `ACTIVE→RETRACTED` as a standalone legal transition. Transition provenance was rewritten with no error and a clean `foreign_key_check`.

**Fix (revision 4).** `trg_identities_no_overwrite` (both unique paths); `trg_events_no_overwrite` extended to `(handoff_pk, to_status)`; and a previous-status provenance clause in `trg_events_mirror_state` as defense in depth. Existing tombstone behavior (`trg_projects_no_resurrect`, frozen marker, ordered deletion, retained audit rows) and all valid status transitions are preserved (DB-14, DB-16, DB-22, DB-27.z1–z6, DB-28.9).

**Analogous paths in the other immutable tables.** The probe of §3.1/DB-29 ran every PRIMARY KEY / UNIQUE path of the nine immutable tables against four conflict forms (84 probes): on revision 3 it found exactly the seven mutations above (the P11-04 path and six `project_identities` cases) and no others; the existing guards for `handoffs`, `tasks`, `decisions`, `evidence`, `artifacts`, `ingest_conflicts` and `audit_log` already covered all of their unique paths. On revision 4 no probe mutates any row (0 of 84).

**Residual risks (not remediated; outside the immutable-table scope of this change).**
- **R-1 (closed in revision 5 for the four credential tables, see §11; original finding):** the mutable administrative tables had no overwrite guard. `INSERT OR REPLACE` changed rows in `publishers` (replacing `public_key`), `project_refs`, `projects` and `schema_meta`, reset a **revoked publisher** to `ACTIVE`/`revoked_at = NULL`, and cleared a **revoked grant**'s `revoked_at` (credential-revocation resurrection). A plain `UPDATE` can also un-revoke a publisher: no one-way-revocation trigger exists. Today the only control is the DAL rule (no `OR REPLACE`/`ON CONFLICT`, static scan) plus `deleteProject`/revoke being the only writers. Recommended for T2 (owner decision): no-overwrite triggers and one-way-revocation triggers for `publishers`, `oauth_connections`, `connection_project_grants` and `github_app_links`.
- **R-2:** SQLite cannot identify the calling Worker, so the first write of `project_identities.deleted_at` is permitted to any statement allowed to update that table; it is restricted to `deleteProject` by the DAL and an API-level test, and frozen afterwards.
- **R-3 (UNVERIFIED):** D1's `recursive_triggers` setting, trigger support, `STRICT` and migration handling are not verified; with `recursive_triggers=ON` `REPLACE` additionally fires `DELETE` triggers (the revision-3 DDL then also rejected the P11-03/P11-04 `REPLACE` forms), but the design does not rely on that.

## 11. Regression record: credential tables (revision 4 → 5, residual R-1)
**Finding (independent review 5988533009, reproduced).** On the revision-4 DDL: `INSERT OR REPLACE` swapped a revoked publisher's public key and reset it to ACTIVE; `INSERT OR REPLACE` cleared a revoked reader grant; a plain `UPDATE` un-revoked a publisher, because no credential-table trigger existed and the grant key `(connection_id, project_id)` allowed neither history nor re-authorization.

**Fix (owner decision; revision 5).** See §3 (credential triggers, `UNIQUE (provider_grant_id)`, `grant_id` primary key with `granted_by_principal_id`, partial unique index of active grants) and §5.5 (rotation and re-authorization semantics). Credential identity and key material are immutable, revocation is permanent, revoked credentials cannot act, every unique path is guarded, and the project-deletion procedure still works (its publisher scrub is allowed only after the identity is marked deleted).

**Verification.** DB-30…DB-37 and the 132-probe DB-29 (0 mutations on immutable and credential tables) pass on revision 5 (259/259), including valid initial grants, explicit re-authorization, authorized key rotation, and the no-blanket-lock cases.

**Residual risks after revision 5.**
- **R-2** and **R-3** are unchanged (§10).
- **R-4 (narrowed by revision 6):** `projects.provider` and `projects.repo_id` are database-immutable; a no-overwrite trigger blocks `INSERT OR REPLACE` conflicts on its primary and unique keys while ordinary metadata UPDATEs remain allowed. `project_refs` and `schema_meta` can still be replaced if the DAL ban on REPLACE/upsert is violated. `tenants`, `principals`, `publisher_nonces` and these ordinary tables otherwise remain DAL-guarded; no blanket lock was added.
- **R-5:** expiry (`expires_at`) is enforced by the application against the clock, not by the database. A `DISABLED` owner principal does not automatically revoke existing credentials; the data layer does that on disabling.
- **R-6 (design change, needs owner approval D15):** the grant primary key changed to `grant_id`; the OAuth-library KV grant state remains application-authoritative for token validity, with D1 authoritative for project authorization.

## 12. Regression record: project lifecycle and repository identity (revision 5 → 6)
**P11-05 reproduced against the complete revision-5 source DDL** (Python SQLite 3.54.1; `foreign_keys=ON`, `recursive_triggers=OFF`): after marking the identity deleted and deleting its `projects` row, an ACTIVE publisher insert referencing the surviving identity was accepted; FK check remained empty and integrity was `ok`. **P11-06 reproduced against the same DDL:** inserting an owner-created link for a project with `status='ARCHIVED'` was accepted. Both were schema-only local reproductions; no deployed D1 exists.

**R-4 reproduced against revision 5:** `UPDATE projects SET repo_id=...` was accepted, and `INSERT OR REPLACE` replaced the project's `repo_id` and default branch while an associated publisher remained attached to the same `project_id`.

**Fix (revision 6).** `trg_publishers_project_active` and `trg_app_links_project_active` require an existing ACTIVE project joined to a non-deleted identity. The publisher and GitHub App insert checks are in the DDL transaction, so serialized registration/deletion orders either result in deletion scrubbing/revocation or fail registration. `trg_projects_repository_identity_immutable` freezes only `provider` and `repo_id`; `trg_projects_no_overwrite` rejects collisions on the project primary key, `(tenant_id, slug)`, and `(tenant_id, repo_id)` before REPLACE conflict handling. `slug`, `repo_full_name`, `default_branch`, status and other project metadata remain mutable. R-4 is narrowed to DAL-only replace/upsert risks on `project_refs`, `schema_meta` and remaining mutable administrative tables.

**Verification boundary.** Revision 6's exact extracted DDL passes the case-row run (40/40, 174 assertions) and focused DB-27/DB-29 recovery run (32 DB-27 plus 120 DB-29 probes; historical 12-probe DB-29 gap remains), with the adjacent DB-28 guard at 8/8. The historical 259-assertion equivalence is unproven; resolve the 12-probe mapping before calling the regression-evidence gap closed or requesting a focused re-audit. D1/Miniflare behavior, trigger parity and actual concurrent transaction behavior remain UNVERIFIED and gated on T2. No new owner decision was added: P11-05/P11-06 follow the existing active/archive/delete policy; future transfer to a different repository needs a separately approved product flow.
