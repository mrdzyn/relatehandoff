# RH-LOCAL-T5 — Developer Experience & Onboarding

- **Status:** In progress (`docs/rh-local-t5-dx-onboarding` from `main@1a77147e3bb237d94ee3d4e4e5f5d5907be55c70`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Implementation agent:** Antigravity
- **Primary branch:** `main`
- **Working branch:** `docs/rh-local-t5-dx-onboarding`

## Objective
Bring developer documentation, copy-paste multi-agent workflows, platform installation/troubleshooting guidance, offline clean-clone reproducibility verification, and distribution/licensing readiness review up to date with all shipped local-only RelateHandoff commands (`doctor`, `record`, `resume`, `list`) without editing `src/` or enabling hosted/cloud work.

## Context
`RH-LOCAL-T1` (`doctor`), `RH-LOCAL-T2A` (`resume --format json|markdown`), and `RH-LOCAL-T2B` (`list`, `record --supersedes` / `--supersession-reason`, `resume --handoff`) are squash-merged to `main` (`1a77147e3bb237d94ee3d4e4e5f5d5907be55c70`), while `RH-P5` hosted platform work remains **ON HOLD**. `README.md` still reflects pre-`RH-LOCAL` status and lacks copy-paste multi-agent lifecycle workflows and verified offline clean-clone guidance.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (documentation and local onboarding verification only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Agent context and delegation (when applicable)
- **Primary write owner:** Antigravity
- **Subagent decision:** None (single-owner bounded documentation and offline reproducibility task).
- **Context budget:** Focused (`docs/AGENT-ORCHESTRATION.md`).

## Allowed scope
- `tasks/RH-LOCAL-T5-dx-onboarding.md`
- `scripts/test_bootstrap.py` (one allowlist entry for this task, preserving fail-closed checks)
- `README.md` (documentation only)
- `docs/ONBOARDING-AND-DISTRIBUTION.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any modifications to `src/`, `test/`, `spike/`, `examples/`, `package.json`, `package-lock.json`, `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.
- Any hosted `RH-P5` work, `cloud/` code, Cloudflare resources, OAuth, remote MCP, or deployment.
- Any package publishing (`npm publish`, GitHub release, binary distribution) or PR merge without explicit owner approval.
- Any weakening of `scripts/test_bootstrap.py`, `scripts/validate.py`, or `scripts/verify_release.py`.

## Acceptance criteria
- [x] Bounded task contract `tasks/RH-LOCAL-T5-dx-onboarding.md` created and allowlisted in `scripts/test_bootstrap.py` with fail-closed checks intact.
- [x] `README.md` updated (no `src/` edits) to reflect current local-only status and all shipped CLI commands (`doctor`, `record --verify/--supersedes/--supersession-reason`, `resume --format json|markdown --handoff --verify`, `list --task --status --branch --agent --limit --format`), copy-paste multi-agent workflows, Linux `GLIBC_2.36` vs `GLIBC_2.39` source-build guidance, offline reproducibility steps, and `docs/AGENT-ORCHESTRATION.md` reference.
- [x] `docs/ONBOARDING-AND-DISTRIBUTION.md` created with platform-by-platform installation & troubleshooting (macOS, Linux, Windows — explicitly marking native Linux/Windows runs `UNVERIFIED` on this macOS host), verified offline clean-clone reproducibility results (`git clone --local` in `/tmp`, `npm ci --offline`, `doctor`, `resume`, `RELATE_REQUIRE_CLI=1 npm test`, temp dir cleaned), and distribution/licensing readiness review (`Apache-2.0`, `@relate/relate@1.0.1` + Neo4j Labs experimental disclaimer, Relate CLI notices, `koffi@2.16.4` MIT notice, explicit gate forbidding publishing without owner approval).
- [x] `docs/STATUS.md` updated and `## Handoff: RH-LOCAL-T5-1` appended to `docs/HANDOFFS.md`.
- [x] `git diff --check origin/main...HEAD` exits 0 and exact-HEAD canonical validation passes (`scripts/test_bootstrap.py`, `scripts/validate.py`, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`).

## Required validation
- `git diff --check origin/main...HEAD`
- `python3 scripts/test_bootstrap.py`
- `python3 scripts/validate.py --repository mrdzyn/relatehandoff`
- `RELATE_REQUIRE_CLI=1 npm test`
- `npm run test:security`
- `npm run build`
- Temporary `/tmp` offline clean-clone reproducibility test (`git clone --local`, `npm ci --offline`, `doctor`, `resume`, `RELATE_REQUIRE_CLI=1 npm test`), followed by cleanup of `/tmp` directory.

## Security / privacy considerations
Documentation-only changes; all workflows and fixtures remain strictly local, offline-capable, and free of real credentials, private transcripts, or customer data. Temp verification directories are cleaned up after verification.
