# RH-P5 — Multi-Project Remote MCP and Agent Handoff Platform: Plan

**State:** Proposal for owner review (revision 5: remediates independent audit findings P11-01 to P11-04 and, by owner decision, residual R-1 on credential tables; see [D1 schema](RH-P5-D1-SCHEMA.md) §3.1, §5.5, §9–§11). Baseline `main@282e10e600935ee1c1bba34522cb3e3373f3be1d`. Nothing in this document is implemented, deployed or connected. Companion documents: [D1 schema](RH-P5-D1-SCHEMA.md), [threat model](RH-P5-THREAT-MODEL.md). External facts were checked against vendor documentation on 2026-11-18 and are tagged **[verified]** or **[verify]** (must be re-checked before implementation). Source links are in §13.

## 0. Scope gate (D0)

`docs/PRODUCT.md` (MVP non-goals: no "cloud synchronization … or team tenancy") and `docs/ARCHITECTURE.md` ("store is local-only by default and is not automatically synchronized"; "no production deployment, hosted account … is planned") conflict with this platform. They stay authoritative until the owner approves **D0: expand product scope to an opt-in hosted index**. If approved, a separate docs PR amends those two files; this PR does not. Local-only use must remain fully functional with no cloud account.

## 1. Goals and non-goals

**Goals**
1. One owner, several GitHub repositories ("projects"), each with persistent context an agent can resume from, in ChatGPT Web, Codex, Claude, Grok and local/cloud coding agents.
2. Strict per-project isolation, designed so tenants/organizations can be added later without a rewrite.
3. Read-only remote MCP initially; writes only through a separate, validated, separately authenticated ingestion path.
4. Git remains the authority; the cloud index is derived, sanitized and clearly labeled.

**Non-goals (hard)**
- No arbitrary remote code execution; the Worker never runs repository code, tests, shell or user-supplied scripts.
- No public writable MCP. No MCP tool writes anything. No ingestion without a registered publisher credential.
- No cross-project reads, joins, search or caching of one project's data in another's context.
- No automatic merge, deployment, release or approval action, and no tool whose output authorizes one.
- No promotion of evidence trust: the cloud never turns self-asserted or unsigned evidence into `AUTHENTICATED` or `VERIFIED`.
- No transcripts, source files, secrets, or private/customer datasets in the index; digests only (§6).
- Not replacing the local Relate store or its read-only stdio MCP; those are unchanged.

## 2. Architecture

```
 Local/cloud agents (Codex, Claude Code, Grok, CI)            ChatGPT Web, Claude, Codex, Grok (readers)
   │ record → local Relate store (detail, authoritative)        │ OAuth 2.1 + PKCE, Streamable HTTP
   │ `relatehandoff publish` (opt-in, sanitized digest)         ▼
   │ Ed25519-signed request                          ┌────────────────────────┐
   ▼                                                  │ rh-mcp-gateway Worker  │  read-only MCP, resource server
 ┌───────────────────┐   service binding (WriteApi)   │ /mcp, RFC 9728 metadata│
 │ rh-ingest Worker  │──────────┐                     └───────────┬────────────┘
 │ /v1/ingest (only) │          ▼                                 │ service binding (ReadApi only)
 └───────────────────┘   ┌──────────────────┐◀───────────────────┘
                         │ rh-data Worker   │  sole holder of the D1 binding
                         │ ReadApi/WriteApi │  scoped DAL, audit log, migrations
                         └────────┬─────────┘
                                  ▼
                         D1 `relatehandoff-index`   (R2: not used initially)
 ┌──────────────────────┐
 │ rh-auth Worker       │  OAuth 2.1 authorization server + consent page; KV (library state)
 └──────────────────────┘  upstream sign-in: GitHub identity only (owner allowlist)
```

- **Four Workers, least privilege.** `rh-mcp-gateway` can only call `ReadApi`; `rh-ingest` can only call `WriteApi`; only `rh-data` holds the D1 binding. This yields real privilege separation (the gateway process has no database write path), instead of relying on code discipline. Cloudflare Worker-to-Worker RPC with named entrypoints is the intended mechanism **[verify]**; fallback is one Worker per concern with the DAL's write functions compiled out of the gateway bundle plus a static test (§7).
- **Split resource server and authorization server**, as `@cloudflare/workers-oauth-provider` recommends **[verified]**; the library stores tokens/codes/secrets only as hashes in KV, encrypts per-grant `props`, supports DCR, CIMD and RFC 8707 resource indicators, but **does not enforce scopes or tenancy itself — our handler must** **[verified]**.
- **MCP transport:** Streamable HTTP via the Agents SDK `createMcpHandler`, stateless per request; no Durable Object is required **[verified]**. `McpAgent` is marked deprecated in Cloudflare's guide, so it is not used **[verified]**.
- **D1** holds the project registry and sanitized index (limits and behavior **[verified]**: foreign keys are enforced by default and cannot be disabled by queries or migrations; 10 GB/database paid, 2 MB max row, 100 bound parameters, 1,000 queries per Worker invocation paid, 30 s query, `db.batch()` runs as a SQL transaction). **R2** only if a justified need appears (e.g., sanitized artifacts over the 2 MB row limit); not in scope now (D9).
- **Durable Objects:** not used initially; D1 serializes writes and per-project `server_seq` is enforced by a unique index. A per-project Durable Object sequencer is the escalation path if contention appears (D10).
- **Local engine unchanged.** `src/` (recorder, freshness, read-only stdio MCP client) is not modified by this platform. Only an opt-in `publish` command is added later (T3), reading the local store.
- **RH-P4 separation.** The static showcase, if enabled, is a different Worker/Pages site on a different hostname with no bindings. It does not link to, embed or proxy the MCP endpoint; its "no public MCP" non-goal is unaffected.

## 3. Identity, tenancy and authorization

- **Entities:** tenant → projects → (tasks, handoffs, decisions, evidence, artifacts). Initially one tenant (`owner`), many projects. Every row carries `tenant_id` and `project_id`.
- **Project = one GitHub repository**, keyed by the immutable numeric GitHub repository id; the `owner/name` string is display/validation data that fails closed on mismatch (rename requires an explicit owner update).
- **Principals:** the human owner (GitHub identity, numeric-id allowlist), **OAuth connections** (reader clients such as ChatGPT/Claude/Codex/Grok, each approved by the owner), and **publishers** (per-project ingestion credentials). Readers and publishers are disjoint: a reader token can never ingest and a publisher key can never read through MCP.
- **Per-project authorization:** the consent screen has the owner choose exactly which projects a connection may read. Grants live in D1 (`connection_project_grants`), not in the token, so revocation is immediate. Tokens carry only `connection_id`, audience and a minimal scope (`projects:read`); the project list is looked up on every request.
- **Explicit project selection:** every tool takes a `project` slug. There is no default project, no "current project" session state and no multi-project tool. `list_projects` returns only granted projects. An ungranted, archived, unknown or malformed `project` returns the same `NOT_FOUND` result (no existence oracle).
- **Tenant expansion path:** all queries are scoped by `(tenant_id, project_id)` from the authorization context; adding tenants adds rows, and strong isolation can later move to a D1 database per tenant (D1 supports very many databases **[verified]**) behind the same DAL.

## 4. Authentication

**Readers (MCP):** OAuth 2.1 authorization-code + PKCE (S256), per the MCP authorization specification **[verified]**:
- Protected Resource Metadata (RFC 9728) served by the gateway; `401` carries `WWW-Authenticate` with the metadata URL; authorization-server metadata (RFC 8414) advertises `S256`.
- Client registration: CIMD preferred by ChatGPT, DCR also supported **[verified]**; registration is restricted (allowlisted redirect URIs: ChatGPT's published redirect URIs, loopback for Codex/Claude Code) and rate limited; each new client needs explicit owner consent.
- Token audience = the gateway's canonical resource URI (RFC 8707 `resource` required, echoed into `aud`); gateway verifies signature/lookup, `iss`, `aud`, `exp`, scope and a live, unrevoked connection on **every** request. No token passthrough; the GitHub token used at login is never stored, forwarded or exposed.
- ChatGPT does not support machine-to-machine grants or custom API keys **[verified]**, so ChatGPT is a reader only. Optional hardening: validate ChatGPT's OpenAI-managed client certificate (mTLS) and egress ranges **[verify availability on Cloudflare]**.
- Short-lived access tokens, refresh-token rotation, owner-visible connection list with revoke.

**Owner sign-in (upstream IdP):** GitHub identity only (no repository scopes), single numeric user id allowlist. Alternative: Cloudflare Access (D2).

**Publishers (ingestion):** a separate hostname and mechanism. Each publisher is bound to **one project** and holds an Ed25519 private key; the owner registers its public key out-of-band. Requests are signed over method, path, timestamp, nonce and SHA-256 of the body; the server enforces a skew window, nonce replay rejection, body-size limits and project binding. No bearer secrets in agent environments beyond the private key; keys are revocable (permanently) and optionally expiring; rotation registers a new publisher and revokes the old one, and a key can never be re-registered or swapped in place; a leaked key can only publish to its one project and can never read or upgrade trust. Ed25519 support in the Workers WebCrypto runtime **[verify]**. Optional later: GitHub Actions OIDC as a CI publisher identity (T8, D12).

## 5. MCP tool contracts (read-only)

Common rules: transport Streamable HTTP; each tool declares read-only/non-destructive annotations and `securitySchemes: oauth2 (projects:read)`; inputs are validated against strict JSON Schemas (unknown fields rejected); outputs are bounded (≤ 100 detail rows, ≤ 20 items per list page, response ≤ 128 KB); no tool accepts SQL, Cypher, paths, URLs or shell text; errors are uniform and never reveal other projects.

| Tool | Input | Output (all include `provenance`) |
|---|---|---|
| `list_projects` | none | granted projects: `slug`, `displayName`, `repository`, `defaultBranch`, `lastIngestedAt` |
| `get_project_status` | `project` | latest handoff summary, per-branch observed heads, counts, freshness summary |
| `get_latest_handoff` | `project`, optional `task`, optional `branch` | handoff + decisions + evidence + artifacts + freshness |
| `list_handoffs` | `project`, optional `task`, `limit` ≤ 20, `cursor` | summaries, project-bound signed cursor |
| `get_handoff` | `project`, `handoffKey` | one handoff in full (bounded) |
| `list_evidence` | `project`, `handoffKey` | evidence rows with trust labels |
| `check_freshness` | `project`, `handoffKey`, `currentHeadSha` (40-hex, supplied by the caller's local Git) | `CURRENT`/`STALE`/`UNVERIFIED` with reason codes |

**Provenance block (required on every response):** `source: "relatehandoff-cloud-index"`, `schemaVersion`, `project`, `repository`, `indexedAt`, `handoffHeadSha`, `observedHeadSha` (or null) with `observedBy`/`observedAt`, `metadataFreshness`, `executionAuthenticity`, `limits` (e.g., `UNSIGNED_CLOUD_INGESTED_EVIDENCE`, `REMOTE_PR_STATE_UNVERIFIED`), and `warnings`.

**Freshness and trust rules (fail closed):**
- Reuse the local engine's vocabulary and reason codes (`HEAD_SHA_MISMATCH`, `EVIDENCE_SHA_MISMATCH`, `UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE`, `EVIDENCE_FAILED`, `REMOTE_PR_STATE_UNVERIFIED`, …) with a parity test against `src/freshness.mjs`.
- `metadataFreshness = CURRENT` only when the handoff SHA equals a caller-supplied `currentHeadSha`, or equals a trusted observed head newer than the configured TTL; otherwise `STALE`; with no comparison basis `UNVERIFIED`. A mismatched, malformed or missing SHA never yields `CURRENT`.
- `executionAuthenticity` is capped at `UNVERIFIED` in the cloud (`UNSIGNED_CLOUD_INGESTED`). **No cloud tool emits `VERIFIED` or `AUTHENTICATED`.** Full verification still happens locally (`resume --verify`), at the caller's checked-out HEAD.
- A handoff recorded at SHA A never inherits `PASS` claims for SHA B.
- Free text (summary, next action, decisions, evidence commands) is **untrusted agent-authored data**. Responses place it in clearly named fields, strip control characters, bound length, and carry a fixed advisory string. The server never converts it into instructions, links or commands to run.
- Any D1 error, schema mismatch or bound violation returns an error, never partial or guessed data.

## 6. Ingestion and synchronization

**Data minimization.** Only a sanitized digest leaves the machine: the validated handoff payload (same fields as the local `schemaVersion 1.0.0`: ids, branch, `headSha`, agents, summary, next action, decisions, artifact **paths**, evidence rows). No file contents, diffs, transcripts, environment, local absolute paths or secrets. Detailed graph and verification stay in the local Relate store.

**Flow.** `relatehandoff record` (unchanged) → local store. Opt-in `relatehandoff publish --project <slug>` (T3) reads that handoff, re-validates, builds the digest, signs and POSTs it. Cloud-hosted agents without a local store call the same ingestion API with their own publisher key, still limited to one project.

**Server-side validation (shared, parity-tested):** reuse the local validator rules, `MAX_DETAIL_ROWS = 100`, secret-pattern rejection, sensitive-artifact-name rejection, repo-relative path normalization, ID regex, evidence status set `PASS|FAIL|UNVERIFIED`, and rejection of client-supplied trust fields (`executionMode` other than `SELF_ASSERTED`, `validationProfile`, `exitCode`, `attestationSha256`). The payload `repository` must equal the project's repository and the signing publisher's project; otherwise `403`.

**Identity and idempotency.** Handoff identity is `handoffKey = <repository>::<taskId>::<handoffId>`, matching the local scoped keys. The server computes `payload_sha256` over canonical JSON.
- Same key + same hash → idempotent success, no write, returns existing `server_seq`.
- Same key + different hash → `409 CONFLICT`; nothing is overwritten; an `ingest_conflicts` row records the attempt (hash, publisher, time).
- Handoffs are **append-only and immutable**; the database rejects content updates, rejects any rewrite of status reason/time/actor unless `status` itself changes, rejects overwrite-by-insert (`OR REPLACE`), and only allows the status transitions `ACTIVE → SUPERSEDED | RETRACTED` and `SUPERSEDED → RETRACTED`, each recorded in `handoff_status_events` and the audit log. A correction is a new handoff with `supersedes`; the old one becomes `SUPERSEDED` atomically through the insert. Only an owner action can set `RETRACTED` (reason required, audited); retracted rows are excluded from default reads. Trigger support on D1 is **[verify]**; if unavailable these rules are enforced in the DAL and tested, and this plan must say so.
- Ordering: the server assigns a per-project monotonic `server_seq` **inside the insert statement itself** (`COALESCE(MAX(server_seq),0)+1` in the same `INSERT … SELECT … WHERE NOT EXISTS`, never read-then-write in application code, and never `OR REPLACE`/`ON CONFLICT`), in the same D1 batch that inserts the handoff, its children and the audit row; a unique index on `(project_id, server_seq)` is the fail-closed backstop, with a bounded retry (3×, jittered) and then a retryable `503` with nothing written. Client clocks never decide order. Details and retry/idempotency semantics: schema document §5.2.
- Branch heads: `project_refs` records the latest head a publisher (or, later, a read-only GitHub App) observed per branch, with source and time. The `source` is **server-derived, never client-supplied**: the ingestion path hard-codes `PUBLISHER_REPORTED` with the authenticated publisher id, and `GITHUB_APP` rows require an owner-created link and a separate server-only entrypoint (schema document §5.4). Only newer `observedAt` replaces an older value from the same source. The index cannot know ancestry, so a force-push is reported as a changed head (`STALE`), never as "newer".
- All-or-nothing: a handoff and its decisions/evidence/artifacts commit in one batch; failure leaves nothing.
- Quotas: per-publisher and per-project rate limits and row caps; oversized payloads rejected before parsing.
- Schema versions: unknown major `schemaVersion` rejected; the gateway reports `schemaVersion` per row.

**Remote state.** Optional later (T8, D8): a read-only GitHub App (metadata only, no contents) to observe branch heads and PR state and thereby let `REMOTE_PR_STATE_UNVERIFIED` clear. Until then it stays `UNVERIFIED`.

## 7. Tests (required before each phase's merge)

**Unit/contract**
- Shared-validator parity: every local validator negative test also rejects at the ingestion boundary; schema enums and ID rules mirror `src/schema.mjs`; freshness reason-code parity with `src/freshness.mjs`.
- Tool schema tests: unknown fields rejected, bounds enforced, SHA format (`40`-hex lowercase) enforced.
- D1 migration tests: apply all migrations from empty on local SQLite/Miniflare **and a real D1 staging database**, check constraints, composite foreign keys, triggers and `STRICT` behavior. Cloudflare documents that D1 enforces foreign keys by default and that queries/migrations cannot change `PRAGMA foreign_keys`; trigger and `STRICT` support on D1 are still **[verify]** and gated in T2.
- **Database-level negative suite (DB-01…DB-37 in the schema document §7), required in addition to application-level `ProjectScope` tests:** cross-tenant and cross-project inserts for connections, grants, publishers, handoffs, supersession, conflicts, refs and audit rows must fail at the database; valid same-project inserts must succeed; immutable-content and status-transition rules, project hard deletion (ordered, atomic, with a non-sensitive tombstone, including forced-failure rollback at each step), concurrent `server_seq` allocation with safe idempotent retries, and `PRAGMA foreign_key_check`/`integrity_check` are all asserted. A local SQLite run exists for revision 2 of the DDL (see the schema document); it does not replace the D1/Miniflare run.

**Cross-project and tenant isolation negatives (mandatory, run on every PR touching `cloud/`)**
1. Connection granted `A` only: `get_handoff(project=B, …)` → `NOT_FOUND`, identical bytes to an unknown project (no oracle).
2. `get_handoff(project=A, handoffKey=<key owned by B>)` → `NOT_FOUND`; same handoff id/task id in A and B never collide or merge.
3. `list_projects` returns A only; archived or revoked-grant projects vanish on the next request (no cache).
4. Grant revoked mid-session → next call fails; token still cryptographically valid.
5. Cursor from project A replayed with project B → rejected (cursors are signed and project-bound); tampered cursors rejected.
6. Slug normalization attacks (case, Unicode confusables, trailing dots, whitespace, `..`, null bytes) never resolve to another project.
7. Project rename/transfer: grant follows the immutable repo id, not the string; stale name does not resolve.
8. Static test: no DAL read or write function can be called without a `ProjectScope` value created by authorization; no raw SQL outside the DAL; all statements parameterized (`bind`); a SQL-injection corpus across every parameter returns no foreign rows.
9. IDOR: opaque random IDs; every by-id lookup also filters `(tenant_id, project_id)`; guessing another project's ids fails.
10. Publisher for A posting a payload with `repository`/headSha of B → `403`, nothing written; publisher key cannot read; reader token cannot ingest; publisher signature rejected at the gateway; OAuth token rejected at ingestion.
11. Cross-tenant (synthetic second tenant fixture): all of the above across `tenant_id`.
12. Output audit test: every response is scanned to ensure it contains only the requested project's ids.
13. Ingestion negatives tied to P11-02: a payload carrying a `source`, `GITHUB_APP`, `status`, `server_seq` or any unknown field is rejected; `GITHUB_APP` observations can only be created through the separate server-controlled entrypoint; superseding or retracting is impossible through the ingestion path except by a newer same-project handoff; deletion of a project through the ingestion or gateway Workers is impossible (no entrypoint); `deleteProject` is owner-only with typed confirmation and is idempotent on retry.
14. Concurrency: two simultaneous writers for different handoffs obtain distinct contiguous-or-gapped increasing `server_seq`; two simultaneous identical requests produce exactly one row and two successes; same key with different payloads produce one winner and one `409` plus one conflict row; a `server_seq` uniqueness failure writes nothing and is retried or returned as a retryable `503`.

**Security / protocol**
- Missing, expired, wrong-`aud`, wrong-`iss`, wrong-`resource`, stripped-scope tokens → `401`/`403` with correct `WWW-Authenticate`; no token in query strings; `Origin` validation for Streamable HTTP and a deny-by-default CORS policy; DNS-rebinding test.
- OAuth: exact redirect-URI matching, PKCE required, `state` checked, authorization-code single use and replay failure, refresh rotation and reuse detection, DCR flood/rate-limit, consent required for each new client, CIMD fetch restricted to public hosts (SSRF), clickjacking protection on the consent page, no open redirect.
- Ingestion: replay (nonce), skew, body-hash mismatch, signature on altered path/body, oversize, unknown fields, client-supplied trust fields, duplicate IDs, conflicting payloads (`409`), idempotent replay, batch atomicity under injected D1 failure, no trust promotion path.
- Read-only: the gateway bundle exposes no write tool; static analysis asserts the gateway has no write entrypoint; MCP `tools/list` is snapshot-tested.
- Prompt-injection hygiene: stored malicious summaries (instruction-like text, control characters, markdown/HTML, very long strings) are returned inert, bounded and labeled untrusted.
- Secrets: seeded canary secrets in payloads are rejected; log scanning test proves tokens, signatures and payload bodies are not logged.
- Fail-closed: D1 outage, missing observation, unknown project/grant state → error or `UNVERIFIED`, never `CURRENT`.

**Integration/E2E (local, then staging with synthetic data)**
- Real MCP SDK client against local `wrangler dev`/Miniflare; MCP Inspector; end-to-end record → publish → read → `check_freshness` with a changed SHA producing `STALE`.
- Client matrix (T6): ChatGPT developer-mode connector, Claude Code (`claude mcp add --transport http`), Codex (`codex mcp add`/`codex mcp login`), Grok remote MCP via the xAI API **[verify; Grok consumer-app OAuth behavior was not confirmed]**.
- Local engine regression: existing `npm test` 15/15, `test:security`, `build`, `demo` unchanged.

**Validation policy.** `scripts/validate.py` and the 8/8 contract stay mandatory and unchanged. Cloud tests live in a separate package (§10); whether they join the mandatory contract is D6. Mock, fake or author-reported evidence is never presented as real or independent.

## 8. Observability and operations
Structured logs with request ids; never log tokens, signatures, bodies, free-text fields or full SHAs of other projects; per-project audit log (grants, publisher registration, ingestion, conflicts, revocations, admin actions); retention documented before production (D11); alerting on auth failures, conflicts, rate-limit hits and D1 errors; kill switch to disable the gateway, ingestion or one project without a deploy.

## 9. Operational constraints
Cloudflare account, domain/DNS, secrets and dashboard actions belong to the owner. No agent holds production credentials. Secrets (OAuth signing, ChatGPT client-registration material, publisher public keys are not secret) live in Workers secrets, never in the repository, chat or CI logs. Staging uses a separate D1, KV and hostname with synthetic data only. Production enablement needs explicit approval per `docs/SECURITY.md` privileged-action rules.

## 10. Repository layout and dependencies (proposed; created from T1/T2)
```
cloud/
  package.json            # separate lockfile; root package.json/lockfile unchanged
  packages/schema/        # shared validators extracted without behavior change
  workers/{gateway,ingest,data,auth}/
  migrations/             # forward-only numbered SQL
  test/                   # unit, isolation, protocol, e2e
```
Allowed runtime dependencies (minimal, pinned): `@cloudflare/workers-oauth-provider`, the Agents SDK/MCP SDK, and a schema validator only if needed; dev: `wrangler`, a Workers test harness. Anything else needs an explicit review. The root engine keeps its single dependency (`@relate/relate@1.0.1`) and its current `npm ci` unchanged.

## 11. Migration strategy
1. **No data migration for local users.** The local store and CLI behave exactly as today; hosted use is opt-in.
2. **Schema migrations:** forward-only numbered SQL applied with Wrangler's D1 migrations; expand-then-contract for any column change; each migration reviewed with an isolation-test diff; a `schema_meta` version row checked by every Worker at startup (mismatch ⇒ fail closed). Rollback = restore from D1 point-in-time recovery/export **[verify D1 Time Travel retention]**, rehearsed in staging before production.
3. **Environments:** local Miniflare → staging (synthetic) → production (one real project first). Separate D1/KV/hostnames/secrets; no copying of production data downward.
4. **Backfill:** `publish --backfill` replays existing local handoffs idempotently (same keys ⇒ same hashes ⇒ no-ops), so retries are safe. Every backfill is project-explicit and dry-run first.
5. **Tenant evolution:** new tenants add rows; the optional move to database-per-tenant is a copy by `tenant_id` behind the DAL, verified by the isolation suite on both layouts.
6. **Decommission and deletion:** disabling the platform leaves Git and local stores untouched; an export (JSON per project) and the ordered, atomic `deleteProject` procedure (no cascades; retained non-sensitive `project_identities` tombstone, scrubbed publisher rows and audit rows; schema document §5.1) are part of T7, tested for crash/retry safety.

## 12. Phased implementation tasks

| Task | Deliverable | Key gates |
|---|---|---|
| **T0** | This planning PR | audit; owner merge; D0 answered |
| **T1** | Decisions D1–D14 recorded; docs amendment for D0; `cloud/` skeleton without Workers; shared-schema extraction with parity tests | owner approval |
| **T2** | D1 schema + migrations + `ProjectScope` DAL + isolation tests (local Miniflare only) | isolation suite green; independent audit |
| **T3** | Ingestion API, publisher auth, opt-in `publish`/`publisher register` CLI, conflict rules, ingestion tests | no network to production; synthetic data |
| **T4** | Read-only MCP gateway and tools, provenance/freshness, injection hygiene; local auth test double | tool snapshot tests; read-only static test |
| **T5** | OAuth authorization server, consent and connection-management page, revocation | **UI design gate** (closed): owner approval, restore web guidance, mockups, approval |
| **T6** | Staging deployment, ChatGPT/Claude/Codex/Grok client QA with synthetic data | explicit owner approval to create Cloudflare resources |
| **T7** | Pen-test-style review, rate limits, audit/retention, runbooks, export/delete | independent review |
| **T8** | Production enablement for one real project; optional GitHub App freshness, optional OIDC CI publisher, optional R2 | explicit owner approval; not automatic |

Each task: its own branch/PR, bounded allowed/forbidden scope, exact-HEAD local validation with the real Relate CLI, independent COMMENT-only audit and separate owner merge approval. Each task's STATUS update must add its task file to the `scripts/test_bootstrap.py` allowlist the same way PR #9 and this PR do; the fail-closed checks (unknown path rejected, missing file rejected) must stay.

## 13. Sources checked 2026-11-18
- Cloudflare remote MCP server guide (Streamable HTTP, `createMcpHandler`, OAuth resource/authorization servers): https://developers.cloudflare.com/agents/guides/remote-mcp-server/
- `@cloudflare/workers-oauth-provider`: https://github.com/cloudflare/workers-oauth-provider
- MCP authorization specification (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- OpenAI Apps SDK authentication (ChatGPT OAuth, CIMD/DCR, PKCE, resource, mTLS, no M2M): https://developers.openai.com/apps-sdk/build/auth
- D1 limits and batch/transactions: https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 foreign keys (enforced by default; `defer_foreign_keys` caveat): https://developers.cloudflare.com/d1/sql-api/foreign-keys/ . Trigger and `STRICT` support on D1 were not confirmed from Cloudflare's own pages.
- Re-check the MCP authorization baseline against the latest supported specification before T1 (the independent audit notes that Cloudflare's OAuth provider references a newer revision than the 2025-06-18 text cited here).
- Codex remote MCP/OAuth and xAI remote MCP tools were confirmed only via secondary summaries; verify against official docs (https://developers.openai.com/docs/extend/mcp and https://docs.x.ai/developers/tools/remote-mcp).

## 14. Owner decisions required
- **D0** Approve expanding scope to an opt-in hosted index and amending `PRODUCT.md`/`ARCHITECTURE.md` (§0).
- **D1** Confirm the four-Worker privilege-separated architecture versus a simpler two-Worker variant.
- **D2** Owner sign-in: GitHub identity with numeric-id allowlist (recommended) versus Cloudflare Access.
- **D3** Confirm reader-only ChatGPT; writers only via signed publishers.
- **D4** Approve the publisher model (one project per key, Ed25519 signed requests) and key rotation/expiry policy.
- **D5** Approve the digest field list (§6) and the explicit exclusion of contents/transcripts.
- **D6** Whether `cloud/` tests join the mandatory validation contract (changes `config/validation-contract.json`) and whether `cloud/` uses its own lockfile (recommended).
- **D7** Open the UI design gate for the consent/connection page (enables `design=true`, `platforms=["web"]`).
- **D8** Optional read-only GitHub App for observed heads/PR state (later) — yes/no.
- **D9** R2: confirm "not initially".
- **D10** Durable Object sequencer: confirm "not initially".
- **D11** Data retention, export and deletion policy; audit-log retention.
- **D12** Optional GitHub Actions OIDC publisher (later) — yes/no, noting local-first and manual-CI policy.
- **D13** Hostnames/domain, Cloudflare plan and cost ceiling; confirmation of ChatGPT plan/developer-mode availability **[verify]**.
- **D14** Which agents are in the first client matrix and the acceptance bar for "supported" (including how to treat Grok).
- **D15** Approve the credential lifecycle and grant model of schema revision 5: immutable credential identity and keys, permanent one-way revocation, key rotation by registering a **new** publisher, re-authorization as a **new grant row** (`grant_id` primary key, `granted_by_principal_id`, one active grant per connection and project), revoked connections replaced by a new OAuth consent, and revoked app links replaced by a new installation id. Owner direction to fix R-1 was given; this decision confirms the semantics and the grant-key change.
