# RH-LOCAL-T4 — Security & Cross-Platform Reliability

- **Status:** In progress (`feat/rh-local-t4-security-reliability` from `main@1a77147e3bb237d94ee3d4e4e5f5d5907be55c70`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Primary branch:** `main`
- **Working branch:** `feat/rh-local-t4-security-reliability`

## Objective
Harden and adversarially test RelateHandoff's local-first security, read-only preservation, Git worktree/detached-HEAD reliability, concurrent read-only execution, MCP fault tolerance, 100-row bounds, and fail-closed evidence authenticity, and document an honest cross-platform validation matrix in `docs/PLATFORM-RELIABILITY.md`.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (CLI/MCP reliability tests, Git read-only hardening, and documentation only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Agent context and delegation
- **Primary write owner:** Antigravity
- **Subagent decision:** None (single bounded implementation task inside isolated worktree)
- **Context budget:** Focused (`docs/AGENT-ORCHESTRATION.md`)

## Test objective / validation budget
- **Test objective:** Prove with real Git and real Relate v1.0.1 (plus deterministic fake MCP fault injections) that read-only commands never mutate `.git/index` or the Relate store (including across linked Git worktrees, detached HEAD, and 4 concurrent readers), cross-repo isolation and 100-row bounds fail closed at write and read time, malformed/killed/timed-out MCP responses fail closed, and unsigned/tampered/`SELF_ASSERTED`/failed/stale evidence never yields `AUTHENTICATED` or `VERIFIED`.
- **Minimum automated evidence:** `python3 scripts/test_bootstrap.py`, `python3 scripts/validate.py` (8/8), `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`, and `git diff --check origin/main...HEAD`.
- **Manual QA:** Not applicable (automated CLI/MCP integration and unit tests cover all behaviors).

## Allowed scope
- `tasks/RH-LOCAL-T4-security-reliability.md`
- `scripts/test_bootstrap.py` (one allowlist entry for this task, preserving fail-closed checks)
- `src/git.mjs` (pass `--no-optional-locks` on read-only `git` invocations in `getGitState` so `resume`/`list` never mutate `.git/index`)
- `test/reliability_adversarial.test.mjs`
- `package.json` (`test` script entry for `test/reliability_adversarial.test.mjs`)
- `docs/PLATFORM-RELIABILITY.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any hosted RH-P5 implementation, `cloud/`, Cloudflare resources, OAuth, remote MCP endpoint, or deployment.
- Any weakening of read-only consumer MCP, repository isolation, 100-row detail bounds, path traversal/secret checks, or freshness/authenticity semantics (`src/freshness.mjs`).
- Any modification to `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.
- Any unverified claims of Linux native or Windows native execution on this HEAD.

## Acceptance criteria
- [x] `src/git.mjs` uses `--no-optional-locks` so read-only `resume` and `list` never mutate `.git/index` even when tracked file mtimes differ from the index stat cache.
- [x] `test/reliability_adversarial.test.mjs` covers linked Git worktrees and detached HEAD (`record`, `resume`, `list`, `doctor` with `.git/index` SHA-256 invariance), repository mismatch & cross-repo isolation, 4 concurrent parallel read-only readers with byte-identical store directory SHA-256, read-only store preservation across all read-only CLI commands, adversarial MCP fault injection (partial line without newline, invalid JSON, missing response ID, signal kill, timeout), 100-row bounds & 101-row `BoundExceededError` at write and read time, and fail-closed evidence authenticity (`tampered`/`unsigned` never `AUTHENTICATED`/`VERIFIED`, `SELF_ASSERTED` -> `UNVERIFIED`, `FAIL` -> `BLOCKED`, advancing HEAD -> `STALE`).
- [x] `docs/PLATFORM-RELIABILITY.md` presents an honest platform validation matrix (`macOS ARM64` `VERIFIED`, `Linux native` `UNVERIFIED` on this HEAD with Debian 12 `GLIBC_2.36` vs `GLIBC_2.39` finding, `Windows native` `UNVERIFIED` on this HEAD with `test/doctor.test.mjs` `win32` dependency-injected coverage).
- [x] `docs/STATUS.md` and `docs/HANDOFFS.md` (`RH-LOCAL-T4-1`) are updated and exact-HEAD canonical validation passes.

## Required validation
- `python3 scripts/test_bootstrap.py`
- `python3 scripts/validate.py`
- `RELATE_REQUIRE_CLI=1 npm test`
- `npm run test:security`
- `npm run build`
- `git diff --check origin/main...HEAD`

## Security / privacy considerations
- Strengthens read-only guarantees by preventing opportunistic `.git/index` stat-cache writes during `resume` and `list` (`--no-optional-locks`) and verifies fail-closed boundaries across repo isolation, MCP fault tolerance, 100-row bounds, and evidence authenticity.

## Deliverable
- Draft PR from `feat/rh-local-t4-security-reliability` against `main` (do not merge or deploy).

## Completion handoff
When complete, append `## Handoff: RH-LOCAL-T4-1` to `docs/HANDOFFS.md` and update `docs/STATUS.md` `Active handoff` to `RH-LOCAL-T4-1`.
