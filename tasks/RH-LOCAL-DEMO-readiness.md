# RH-LOCAL-DEMO — Local Demo Readiness & Recording Runbook

- **Status:** In progress (`docs/rh-local-demo-readiness`, originally from `main@1a77147e3bb237d94ee3d4e4e5f5d5907be55c70` and reconciled onto merged T1–T5 `main@4a58146706cb3ca74e48098f10634024fbd78244`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Implementation agent:** Antigravity
- **Target branch:** `main`
- **Working branch:** `docs/rh-local-demo-readiness`

## Objective

Deliver a reproducible, sanitized local demo runbook (`docs/DEMO-RUNBOOK.md`) backed by real observed local command outputs (synthetic `/tmp` 7-act walkthrough, `examples/example-store` checks, `doctor`, and `npm run demo`), complete with a shot-by-shot screen capture sequence, a timed 90–120-second voiceover script (~210–240 words), and an owner pre-upload checklist, without modifying runtime product code or uploading/submitting anything.

## Context

`RH-LOCAL-T1` (`doctor`), `RH-LOCAL-T2A` (deterministic safe `resume` output), `RH-LOCAL-T2B` (`list` and immutable `[:SUPERSEDES]` handoff lifecycle), `RH-LOCAL-T3` (`src/mcp_client.mjs` hardening & `docs/LOCAL-MCP-INTEGRATION.md`, PR #18 `0b0b81dd56416caed183e8cadf84fc27bb764235`), `RH-LOCAL-T4` (`src/git.mjs` `--no-optional-locks`, `test/reliability_adversarial.test.mjs`, & `docs/PLATFORM-RELIABILITY.md`, PR #21 `cdc73f95dbc243335a46e0e753c0e51ff8107c88`), and `RH-LOCAL-T5` (`README.md`, `docs/ONBOARDING-AND-DISTRIBUTION.md`, & `RH21-01`/`RH19-01`, PR #19 `4a58146706cb3ca74e48098f10634024fbd78244`) are squash-merged into `main`. The project remains strictly local-first (`RH-P5` hosted roadmap is ON HOLD). This task prepares judge- and owner-ready demo documentation exercising the full merged local feature set against real `Relate v1.0.1` (`53/53` test suite) with `RH20-01` provenance-matched voiceovers and overlays.

## Delivery mode / UI design gate

- **Material user-facing UI:** No (documentation, task governance, and local CLI runbook only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Agent context and delegation (when applicable)

- **Primary write owner:** Antigravity (isolated worktree)
- **Subagent decision:** None (single bounded documentation and verification pass).
- **Context budget:** FOCUSED
- **Usage evidence:** Not applicable.

Apply `docs/AGENT-ORCHESTRATION.md`; token budgets never replace mandatory tests or release approvals.

## Test objective / validation budget

- **Test objective:** Confirm all documented demo commands execute cleanly against real `Relate v1.0.1`, all captured outputs in `docs/DEMO-RUNBOOK.md` are sanitized and non-fabricated, and exact-HEAD repository validation passes without regressions.
- **Minimum automated evidence:** `python3 scripts/test_bootstrap.py`, `python3 scripts/validate.py`, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`, and `git diff --check origin/main...HEAD`.
- **Manual QA:** Owner executes the recording runbook and pre-upload checklist before any video upload or Devpost submission.
- **Escalation triggers:** Any failure in `validate.py`, `npm test`, `test:security`, `build`, or unexpected secret/home-path leakage.
- **Required CI / release gates:** Independent COMMENT-only audit and explicit owner merge approval on the Draft PR; separate explicit owner approval for any video upload or Devpost submission.

Apply the stop/escalation policy in `docs/TESTING.md`.

## Allowed scope

Files/components that may be changed:
- `tasks/RH-LOCAL-DEMO-readiness.md`
- `scripts/test_bootstrap.py` (add `"tasks/RH-LOCAL-DEMO-readiness.md"` to the allowlist while preserving T3, T4, and T5 allowlists and fail-closed checks)
- `docs/DEMO-RUNBOOK.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only `## Handoff: RH-LOCAL-DEMO-1`, `RH-LOCAL-DEMO-2`, and `RH-LOCAL-DEMO-3`)

## Forbidden scope

Do not change:
- `src/`, `test/`, `spike/`, `examples/`, `package.json`, `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`
- Any hosted RH-P5 code (`cloud/`), Cloudflare resources, OAuth clients, remote MCP endpoints, or deployments
- Any video upload, Devpost submission, or PR merge (all remain owner-gated)
- Any real credentials, private transcripts, or unsanitized home-directory paths in tracked files

## Acceptance criteria

- [x] `tasks/RH-LOCAL-DEMO-readiness.md` created and allowlisted in `scripts/test_bootstrap.py` while preserving fail-closed checks.
- [x] Real local commands (`doctor`, `npm run demo`, `resume`, `list`, and full 7-act synthetic `/tmp` walkthrough) executed against real `Relate v1.0.1` and captured with sanitized outputs.
- [x] `docs/DEMO-RUNBOOK.md` documents the 7-act synthetic simulation, real vs. synthetic provenance distinction (`RH20-01`: Track A / Option A genuine Codex-to-Claude execution vs. Track B / Option B synthetic shell simulation), copy-paste commands, sanitized outputs, shot-by-shot capture sequences, provenance-matched 90–120s voiceover scripts, merged T1–T5 doc references (`LOCAL-MCP-INTEGRATION.md`, `PLATFORM-RELIABILITY.md`, `ONBOARDING-AND-DISTRIBUTION.md`), §7.1 integrated-`main` smoke checklist (`53/53` real Relate `v1.0.1` suite), §7.2 genuine capture checklist, and §7.3 mandatory owner pre-upload checklist.
- [x] `docs/STATUS.md` and `docs/HANDOFFS.md` updated cleanly (`RH-LOCAL-DEMO-1`, `RH-LOCAL-DEMO-2`, and `RH-LOCAL-DEMO-3` reconciled onto `main@4a58146706cb3ca74e48098f10634024fbd78244` without dropping any T1–T5 history).
- [x] `git diff --check origin/main...HEAD` exits 0 and exact-HEAD validation (`test_bootstrap.py`, `validate.py`, `RELATE_REQUIRE_CLI=1 npm test` 53/53 with 0 skipped, `npm run test:security`, `npm run build`, `npm run demo`, and preflight `doctor`/`resume`/`list` smoke checks) passes.

## Required validation

Targeted automated checks:
- `python3 scripts/test_bootstrap.py`
- `python3 scripts/validate.py`
- `RELATE_REQUIRE_CLI=1 npm test`
- `npm run test:security`
- `npm run build`
- `git diff --check origin/main...HEAD`

Manual QA:
- Owner reviews `docs/DEMO-RUNBOOK.md` and runs the pre-upload checklist before recording/uploading.

Required CI / release validation:
- Local exact-HEAD validation + independent COMMENT-only review + owner merge approval.

## Security / privacy considerations

No code or trust-boundary changes. All captured outputs in `docs/DEMO-RUNBOOK.md` are generated from synthetic repositories/stores (`mrdzyn/relatehandoff-synthetic` and committed synthetic `examples/example-store`), and local machine home paths or temporary directory names are sanitized to `<repo>` / `<tmp_demo_root>`.

## Design / accessibility considerations

Not applicable.

## Third-party integration considerations

None.

## Release / store / deployment considerations

None. No video uploaded, no Devpost submission made, and no deployment executed.

## Capability profile changes

None.

## Data / migration considerations

None.

## Documentation updates

- [x] `docs/STATUS.md`
- [x] `docs/HANDOFFS.md`
- [x] `docs/DEMO-RUNBOOK.md`

## Deliverable

Draft PR from `docs/rh-local-demo-readiness` targeting `main` containing the task contract, bootstrap allowlist update, `docs/DEMO-RUNBOOK.md`, and `STATUS.md`/`HANDOFFS.md` handoff updates. Do not merge.

## Stop / escalation conditions

Standard stop conditions per `AGENTS.md` and `tasks/TEMPLATE.md` apply.

## Completion handoff

Append `## Handoff: RH-LOCAL-DEMO-1`, `## Handoff: RH-LOCAL-DEMO-2`, and reconciled `## Handoff: RH-LOCAL-DEMO-3` to `docs/HANDOFFS.md` and update `docs/STATUS.md` (`Active handoff: RH-LOCAL-DEMO-3`).
