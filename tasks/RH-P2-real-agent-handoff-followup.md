# RH-P2 — Real-Agent Handoff Follow-up & MCP Reader Hardening

- **Status:** Done (PR #4 squash-merged to `main` as `a6bb9bdd562205e5690318272bce8dda0ecf6306`, `2026-11-17T06:40:24Z`; audited PR HEAD `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`)
- **Owner/orchestrator:** Product owner
- **Implementation agent:** Codex / Antigravity
- **Target branch:** `main`
- **Working branch:** `phase-2/real-agent-handoff-followup` (merged; post-merge closeout on `docs/rh-p2-postmerge-closeout`)

## Objective

Document the sanitized RH-P2 real-agent Codex-to-Claude handoff proof, harden `src/mcp_client.mjs` and `test/e2e_mcp.test.mjs` with bounded timeouts, safe parsing, and guaranteed child-process cleanup, and characterize the long-lived `relate serve --mcp stdio --read-only` snapshot behavior without mutating immutable historical records.

## Context

- Approved `main` baseline: `f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd` (PR #3 squash merge).
- Owner reported a real-agent Codex-to-Claude handoff on macOS ARM64 (`Relate v1.0.1`, read-only MCP stdio) where a persistent MCP reader did not observe a newly recorded handoff until restart.
- PR #4 BLOCKED review (`issuecomment-6936940636`) identified unbounded subprocess/RPC waits, missing child cleanup/fault-injection coverage, private path/unsupported internal claims in docs, and missing RH-P2 task/handoff reconciliation.

## Delivery mode / UI design gate

- **Material user-facing UI:** No
- **UI design gate:** Not applicable

## Test objective / validation budget

- **Test objective:** Prove `callRelateMcpBatch` and `resumeTaskViaReadOnlyMcp` fail closed under bounded timeouts, malformed output, crashes, and wrong-answer fakes without leaving orphan processes; prove fresh short-lived `resume` sees newest commits immediately; pass all canonical Python and Node.js validations.
- **Minimum automated evidence:** `scripts/validate.py --repository mrdzyn/relatehandoff`, all Python entrypoints, `npm run build`, `npm run test:security`, `npm test` (including `(fake)` fault-injection tests), `npm run demo`, and `ps` orphan-process check.
- **Manual QA:** Not applicable.
- **Required CI / release gates:** Local-first exact-HEAD validation + independent COMMENT-only re-audit + separate owner merge approval.

## Allowed scope

- `package.json`
- `src/mcp_client.mjs`
- `test/e2e_mcp.test.mjs`
- `scripts/test_bootstrap.py`
- `docs/RH-P2-REAL-AGENT-PROOF.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md`
- `tasks/RH-P2-real-agent-handoff-followup.md`

## Forbidden scope

- Do not weaken read-only MCP enforcement, schema validation, B1–B4 guarantees, or `MAX_DETAIL_ROWS = 100`.
- Do not mutate `examples/example-store/` or historical RH-P0/RH-P1 records.
- Do not merge, deploy, publish, or release.

## Acceptance criteria

- [x] `callRelateMcpBatch` and `resumeTaskViaReadOnlyMcp` enforce bounded `timeoutMs` + `SIGKILL`, safe JSON parsing, id-based response lookup, and stderr diagnostics.
- [x] `test/e2e_mcp.test.mjs` enforces per-RPC timeout, `error`/`exit` handlers, guaranteed `SIGKILL` cleanup, fresh-resume invariant, diagnostic persistent-reader characterization, and `(fake)` fault-injection tests.
- [x] `docs/RH-P2-REAL-AGENT-PROOF.md` removes private paths and unsupported internal claims, adds sanitized `RH-P2-CODEX-CLAUDE-1` with exact SHA, distinguishes unsigned evidence, and discloses placeholder timestamps.
- [x] `docs/STATUS.md` and `docs/HANDOFFS.md` reconcile `Active task` (`tasks/RH-P2-real-agent-handoff-followup.md`), `Active handoff` (`RH-P2-H1` -> `RH-P2-H2`), and `OWNER-REPORTED` / `AUTHOR-REPORTED` truth labels.
- [x] All canonical Python and Node.js validations passed on audited exact HEAD `2c7dcef50a6cde26516f415c5879f3749c9dbe2d` with zero orphan processes (`AUTHOR-REPORTED PASS`: 15/15 `npm test`, 5/5 `npm run test:security`, `npm run build`, `npm run demo`, and `scripts/validate.py` PASS; PR #4 macOS ARM64 reviewer session `6938739073` posted under owner's account reports real `relate v1.0.1`, 15/15 tests, 8/8 `validate.py`, not externally authenticated; PR #4 Linux audit `6940763547` verified security, fault injection, process cleanup, and other runnable checks without real `relate` CLI).

## Security / privacy considerations

Preserves `--read-only` MCP enforcement, repository isolation, and bounded `MAX_DETAIL_ROWS = 100`. Removes local filesystem home paths from docs.

## Completion handoff

Appended `## Handoff: RH-P2-H2` in `docs/HANDOFFS.md` (preserving `RH-P2-H1` as historical evidence) and updated `Active handoff: RH-P2-H2` in `docs/STATUS.md`.
