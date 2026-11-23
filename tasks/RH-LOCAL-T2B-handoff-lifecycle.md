# RH-LOCAL-T2B — Handoff Lifecycle

- **Status:** In progress (`feat/rh-local-t2b-lifecycle` from `main@176e5c2005bf63583c4f33a918bd12e5d6005fb2`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Primary branch:** `main`
- **Working branch:** `feat/rh-local-t2b-lifecycle`

## Objective
Implement task-scoped handoff listing and filtering (`relatehandoff list`) and explicit immutable handoff supersession (`SUPERSEDES` edges via `supersedesHandoffId` / `--supersedes`), preserving all historical handoffs, immutable provenance, repository isolation, bounded reads (`MAX_DETAIL_ROWS = 100`), and existing `resume` behavior.

## Supersession & Conflict Semantics
- Historical `Handoff`, `Decision`, `Evidence`, and `Artifact` nodes are never mutated, overwritten, or deleted.
- Optional payload fields: `supersedesHandoffId` (`^[A-Za-z0-9._-]{1,128}$`) and `supersessionReason` (non-empty string, max 500 chars; requires `supersedesHandoffId`).
- Self-supersession, missing target, cross-task target, and cross-repository target fail closed (`SupersessionError`).
- Superseding an already-superseded handoff fails closed (`HandoffConflictError`); linear supersession chains (`H3 -> H2 -> H1`) are allowed.
- `canonicalFingerprint` includes `supersedesHandoffId` and `supersessionReason` only when `supersedesHandoffId` is non-null, preserving byte-identical fingerprints for all prior payloads.
- Read-side lifecycle status is derived: `"SUPERSEDED"` if an incoming `[:SUPERSEDES]` edge exists, otherwise `"ACTIVE"`. `resume` defaults to the latest `ACTIVE` handoff and accepts `--handoff <id>` to inspect any specific handoff.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (CLI/MCP query behavior only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Allowed scope
- `tasks/RH-LOCAL-T2B-handoff-lifecycle.md`
- `scripts/test_bootstrap.py` (one allowlist entry for this task)
- `src/schema.mjs`
- `src/recorder.mjs`
- `src/mcp_client.mjs`
- `src/resume_format.mjs`
- `src/cli.mjs`
- `package.json` (`test` script entry for `test/lifecycle.test.mjs`)
- `test/lifecycle.test.mjs`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any hosted RH-P5 implementation, `cloud/`, Cloudflare resources, OAuth, remote MCP endpoint, or deployment.
- Any mutation or deletion of existing handoff, decision, evidence, or artifact nodes.
- Any weakening of read-only consumer MCP, repository isolation, 100-row detail bounds, or freshness/authenticity semantics (`src/freshness.mjs`).
- Any modification to `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] `validateHandoffPayload` validates `supersedesHandoffId` and `supersessionReason` fail-closed.
- [x] `recordHandoff` creates immutable `[:SUPERSEDES]` edges only for existing same-repo/same-task active targets and preserves pre-T2B fingerprints.
- [x] `resumeTaskViaReadOnlyMcp` defaults to the latest `ACTIVE` handoff, supports `handoffId` selection, and returns derived `lifecycleStatus`, `supersedesHandoffId`, `supersededByHandoffId`, and `supersessionReason`.
- [x] `listHandoffsViaReadOnlyMcp` and `relatehandoff list` support `--task`, `--status active|superseded|all`, `--branch`, `--agent`, `--limit` (1..100), and `--format json|markdown` with strict repo isolation and fail-closed overflow (>100 rows).
- [x] `test/lifecycle.test.mjs` passes against real Relate v1.0.1 and exact-HEAD canonical validation (`scripts/validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`) passes.
