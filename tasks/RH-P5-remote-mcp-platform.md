# RH-P5 — Multi-Project Remote MCP and Agent Handoff Platform (planning task)

- **Status:** Draft. This contract covers **planning documents only**. No implementation, Cloudflare resource, deployment or production connection is authorized.
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Implementation agent:** unassigned; planning prepared by Claude
- **Target branch:** `main` (baseline `282e10e600935ee1c1bba34522cb3e3373f3be1d`)
- **Working branch:** `docs/rh-p5-remote-mcp-platform-plan`

## Objective
Plan a platform in which one owner can register several GitHub projects and let ChatGPT Web, Codex, Claude, Grok and local/cloud coding agents share **persistent, per-project isolated** handoff context through an authenticated **read-only** remote MCP server, while the local Relate v1.0.1 engine stays the detailed graph and Git stays authoritative.

## Context
RH-P1–P4 delivered a local-first recorder, read-only stdio MCP, judge package and a static-showcase plan. This phase is a **material scope expansion**: `docs/PRODUCT.md` lists "cloud synchronization" and "team tenancy" as MVP non-goals and `docs/ARCHITECTURE.md` says no hosted account or production deployment is planned. Those statements remain true until the owner approves decision **D0** in `docs/RH-P5-PLATFORM-PLAN.md`; this PR does not edit them. The RH-P4 static showcase is optional and separate and is neither a dependency nor a surface of this platform.

Planning set: `docs/RH-P5-PLATFORM-PLAN.md` (architecture, tools, sync, tests, migration, phases, decisions), `docs/RH-P5-D1-SCHEMA.md` (D1 schema and data-access rules), `docs/RH-P5-THREAT-MODEL.md` (OAuth, ingestion, isolation, injection).

## Delivery mode / UI design gate
- **Material user-facing UI:** Yes, one small page later: the OAuth consent/connection-management screen (RH-P5-T5). No other UI.
- **UI design gate:** **Required and currently CLOSED** (`capabilities.design=false`). This PR contains no UI. Enabling design work needs explicit owner approval and the restoration steps in `AGENTS.md` and `docs/CAPABILITY-PACKS.md`.
- **Screen designs / human design approval:** not started / PENDING.

## Agent context and delegation
- **Primary write owner:** one agent; no subagents by default. **Context budget:** STANDARD (soft). **Usage evidence:** NOT AVAILABLE.

## Test objective / validation budget
- **Test objective (this PR):** the planning change leaves canonical validation intact and the active-task allowlist fail-closed.
- **Minimum automated evidence:** `git diff --check`, `scripts/test_bootstrap.py`, `scripts/test_entrypoints.py`, `scripts/check_secret_tracking.py`, `scripts/validate_project_profile.py`, `scripts/validate.py` (8/8), `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`.
- **Manual QA:** not applicable. **Escalation triggers:** any source, dependency, schema, workflow or profile change.
- **Required gates:** exact-HEAD local validation, independent COMMENT-only audit, separate owner merge approval.

## Allowed scope (this PR)
`tasks/RH-P5-remote-mcp-platform.md`, `docs/RH-P5-PLATFORM-PLAN.md`, `docs/RH-P5-D1-SCHEMA.md`, `docs/RH-P5-THREAT-MODEL.md`, `docs/STATUS.md`, append-only `docs/HANDOFFS.md`, and one allowlist entry in `scripts/test_bootstrap.py`.

## Forbidden scope
Any `cloud/` code, Worker, `wrangler` configuration, D1/KV/R2 resource, migration file, OAuth client or secret, DNS, Cloudflare dashboard/API change, change to `src/`, `test/`, fixtures, schema, dependencies, workflows or `config/project-profile.json`, edits to `docs/PRODUCT.md`/`docs/ARCHITECTURE.md` (pending D0), design-pack restoration, deployment, publication, release, Devpost submission, merge.

## Phased tasks (proposed; each needs owner go-ahead)
RH-P5-T0 this plan · T1 decisions, repository layout and shared-schema extraction · T2 D1 schema, migrations, scoped data-access, isolation tests (local only) · T3 ingestion contract, publisher auth, opt-in `publish` CLI · T4 read-only MCP gateway and tools · T5 OAuth authorization server and consent page (design gate) · T6 staging deployment and client QA (synthetic data) · T7 security review, audit/observability, runbooks · T8 production enablement for one real project. Details and gates: plan §12.

## Acceptance (this PR)
- [ ] Architecture, D1 schema, MCP tool contracts, sync/conflict rules, OAuth/ingestion threat model, tests (including cross-project isolation negatives), migration strategy and phases are documented and mutually consistent.
- [ ] The conflict with `PRODUCT.md`/`ARCHITECTURE.md` non-goals is explicit and gated (D0).
- [ ] Audit findings P11-03 (project-identity tombstone overwrite) and P11-04 (alternate-key status-event overwrite) are remediated in schema revision 4 with an exhaustive overwrite-path inventory and probe; residual risks R-1…R-3 are recorded; D1/Miniflare remains UNVERIFIED.
- [ ] Audit findings P11-01 (composite-FK isolation) and P11-02 (deletion, sequencing, immutability, server-controlled sources) are remediated in the schema, plan and threat model, with a database-level negative test matrix and a local SQLite verification record; D1/Miniflare execution remains a T2 gate.
- [ ] STATUS names this task active; `scripts/test_bootstrap.py` allows it and still rejects unknown or missing task files.
- [ ] Exact-HEAD canonical validation with real Relate CLI v1.0.1, truthfully reported; independent COMMENT-only audit; separate owner merge approval.
- [ ] Owner answers D0–D14 before any T1+ work. No deployment, publication or submission follows automatically.
