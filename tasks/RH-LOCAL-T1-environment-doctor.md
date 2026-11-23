# RH-LOCAL-T1 — CLI Reliability & Environment Doctor

- **Status:** In progress (`feat/rh-local-t1-doctor` from `main@1d89213c3c8ab8a7bef205ab8696e0b5659d97e3`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Primary branch:** `main`
- **Working branch:** `feat/rh-local-t1-doctor`

## Objective
Implement a strictly read-only `relatehandoff doctor` CLI command (`src/doctor.mjs`, wired in `src/cli.mjs`) that diagnoses local runtime, Git, Relate CLI v1.0.1, local Relate store access, and common environment issues (including unsupported Linux `GLIBC` versions) offline, without modifying Git, the Relate store, or system configuration.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (CLI/diagnostic command only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Allowed scope
- `tasks/RH-LOCAL-T1-environment-doctor.md`
- `src/doctor.mjs`
- `src/cli.mjs`
- `test/doctor.test.mjs`
- `package.json`
- `scripts/test_bootstrap.py` (one allowlist entry for this task)
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any `cloud/` code, Worker, D1/KV/R2 resource, deployment, or network calls.
- Any modification to `src/recorder.mjs`, `src/schema.mjs`, `src/attestation.mjs`, `src/freshness.mjs`, or `src/mcp_client.mjs` write/MCP contracts.
- Any mutation of Git state, Relate store files, or system configuration during `doctor` execution.
- Any modification to `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] `relatehandoff doctor` checks Node.js runtime compatibility, Git availability and repo/worktree health, Relate CLI v1.0.1 availability and compatibility (including Linux `GLIBC` mismatch detection), local Relate store read-only access (including read-only MCP `initialize`/`tools/list` probe when CLI is available), and common malformed environment issues.
- [x] Reports clear `PASS`, `WARN`, and `FAIL` diagnostics with actionable remediation, supports `--json` and `--strict`, and returns useful nonzero exit codes (`1` on `FAIL`, `2` on invalid usage).
- [x] Works offline; never mutates Git, the Relate store, or system configuration; never exposes secrets or sensitive local data.
- [x] Supports macOS, Windows, and Linux path/executable conventions.
- [x] Preserves existing `record`, `resume`, and read-only MCP behavior.
- [x] Deterministic unit tests (`test/doctor.test.mjs`) cover successful checks, missing executables, inaccessible stores, unsupported runtime versions, Linux `GLIBC` errors, malformed environments, and read-only store/Git preservation.
- [x] Exact-HEAD validation passes (`scripts/test_bootstrap.py`, `scripts/validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`).

## Test objective / validation budget
- **Minimum automated evidence:** `python3 scripts/test_bootstrap.py`, `python3 scripts/validate.py` (8/8), `RELATE_REQUIRE_CLI=1 npm test` (with real Relate CLI v1.0.1), `npm run test:security`, `npm run build`, and `node src/cli.mjs doctor --repo . --store examples/example-store`.
