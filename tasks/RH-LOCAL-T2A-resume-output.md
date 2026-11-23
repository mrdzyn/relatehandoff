# RH-LOCAL-T2A — Deterministic Multi-Agent Resume Output

- **Status:** In progress (`feat/rh-local-t2a-resume-output` from `main@c9e3a46db8723928b37c2d639122934541ee7fcc`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Primary branch:** `main`
- **Working branch:** `feat/rh-local-t2a-resume-output`

## Objective
Make `relatehandoff resume` produce deterministic, safe, and clear handoff summaries in both default JSON and `--format markdown` modes for local coding agents and human reviewers, without altering existing freshness/authenticity semantics, read-only MCP boundaries, or 100-row detail bounds.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (CLI output formatting only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Allowed scope
- `tasks/RH-LOCAL-T2A-resume-output.md`
- `scripts/test_bootstrap.py` (one allowlist entry for this task)
- `src/resume_format.mjs`
- `src/mcp_client.mjs` (deterministic ordering of retrieved collections only; no MCP/query/bounds relaxation)
- `src/cli.mjs` (`--format json|markdown` on `resume`, exit code 2 on invalid `--format`)
- `package.json` (`build` and `test` entries for new module/test file)
- `test/resume_output.test.mjs`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any hosted MCP, OAuth, Cloudflare, remote synchronization, or deployment.
- Any recorder/schema mutation (`src/recorder.mjs`, `src/schema.mjs`, `src/freshness.mjs`) or handoff supersession implementation.
- Any breaking change to `record`, `doctor`, or default `resume` JSON output.
- Any modification to `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] `resume` defaults to `--format json` and preserves existing JSON structure for backward compatibility.
- [x] `--format json|markdown` is supported; invalid `--format` values exit with code `2`.
- [x] Output is deterministic for identical repository state and Relate-store snapshots (stable ordering of `tools`, `evidence`, `artifacts`, `decisions`, and `dirtyFiles`).
- [x] Markdown output includes repository & task identity, handoff ID & recorded HEAD, current HEAD, freshness status & reasons, execution authenticity & evidence limitations, recorded decisions & evidence, next action, and relevant artifacts.
- [x] Exact freshness/authenticity semantics are preserved (never relabels self-asserted or unauthenticated evidence as `VERIFIED`).
- [x] Untrusted stored text is sanitized/escaped against Markdown injection and terminal/ANSI escape sequences.
- [x] Read-only MCP access, project isolation, parameterized queries, and 100-row detail bounds remain intact.
- [x] Focused tests (`test/resume_output.test.mjs`) pass, and exact-HEAD canonical validation (`scripts/validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`) passes.
