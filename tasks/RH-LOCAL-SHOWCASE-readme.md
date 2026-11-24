# RH-LOCAL-SHOWCASE — Final GitHub Showcase README

- **Status:** In progress (`docs/rh-local-showcase-readme` from post-PR-#20 `main@dc6d80c0c3444f53d217f8376348e44f21265c60`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Implementation agent:** Antigravity
- **Primary branch:** `main`
- **Working branch:** `docs/rh-local-showcase-readme`

## Objective
Deliver a visually polished, hackathon-quality `README.md` featuring GitHub-native Mermaid diagrams (Architecture and Handoff Lifecycle), a real-Relate animated terminal demonstration GIF (`assets/readme/relatehandoff-demo.gif`) and static PNG fallback (`assets/readme/relatehandoff-demo.png`), refreshed T1–T5 merge status and baselines, concise judge-ready layout with collapsible detailed workflows, and zero changes to runtime code, tests, security boundaries, or hosted/cloud hold status.

## Context
`RH-LOCAL-T1` (`doctor`), `RH-LOCAL-T2A` (`resume --format`), `RH-LOCAL-T2B` (`list` & `[:SUPERSEDES]`), `RH-LOCAL-T3` (local MCP hardening & integration recipes), `RH-LOCAL-T4` (adversarial reliability & `--no-optional-locks`), `RH-LOCAL-T5` (DX, onboarding & `RH21-01`/`RH19-01`), and `RH-LOCAL-DEMO` (PR #20 `dc6d80c0c3444f53d217f8376348e44f21265c60`) are squash-merged to `main`, while hosted `RH-P5` remains **ON HOLD**. Note `README.md` previously reflected pre-T3 status and lacked visual diagrams and a real-Relate animated terminal showcase.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (repository README documentation and terminal capture assets only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Agent context and delegation (when applicable)
- **Primary write owner:** Antigravity (isolated worktree `.claude/worktrees/rh-local-showcase`)
- **Subagent decision:** None (single bounded documentation and asset generation task).
- **Context budget:** Focused (`docs/AGENT-ORCHESTRATION.md`).

## Allowed scope
- `tasks/RH-LOCAL-SHOWCASE-readme.md`
- `scripts/test_bootstrap.py` (add `"tasks/RH-LOCAL-SHOWCASE-readme.md"` to allowlist while preserving T3–T5 allowlists and fail-closed checks)
- `README.md`
- `assets/readme/relatehandoff-demo.gif`
- `assets/readme/relatehandoff-demo.png`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only `## Handoff: RH-LOCAL-SHOWCASE-*`)

## Forbidden scope
- Any modifications to `src/`, `test/`, `spike/`, `examples/`, `package.json`, `package-lock.json`, `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.
- Modifying PR #20 (`docs/rh-local-demo-readiness`) outside its task contract.
- Any hosted `RH-P5` work, `cloud/` code, Cloudflare resources, OAuth, remote MCP, deployment, package publishing, video upload, Devpost submission, or autonomous PR merge.
- Any real secrets, credentials, personal home-directory paths, or false real-agent claims.

## Acceptance criteria
- [x] Bounded task contract `tasks/RH-LOCAL-SHOWCASE-readme.md` created and allowlisted in `scripts/test_bootstrap.py` with fail-closed checks intact.
- [x] Animated GIF `assets/readme/relatehandoff-demo.gif` (~960px wide, 12–18s loop, `< 5 MB`) and static fallback `assets/readme/relatehandoff-demo.png` generated from genuine local CLI execution against `Relate v1.0.1` (`doctor`, `record`, `resume`, immutable supersession, `STALE` freshness), explicitly labeled **Synthetic CLI Demonstration**, using dark charcoal, white, `#22C6F0` cyan, and restrained red (zero yellow/gold), with zero secrets or personal paths.
- [x] `README.md` follows the requested section order (Hero -> Animated Demo -> Why It Matters -> How It Works -> Mermaid Architecture -> Mermaid Handoff Lifecycle -> Quickstart -> CLI Reference -> Real-vs-Synthetic Evidence -> Compatibility -> Documentation -> License), retains `docs/AGENT-ORCHESTRATION.md` link and detailed CLI/offline instructions (via docs/collapsible sections), updates merged T1–T5 baselines truthfully, and keeps native Linux/Windows `UNVERIFIED` claims accurate.
- [x] Both GitHub-native Mermaid diagrams (`Architecture` and `Handoff Lifecycle`) use valid syntax, readable light/dark contrast, and no yellow/gold palette.
- [x] Visual inspection of rendered PNG/GIF frames and Markdown links/anchors passes; `git diff --check origin/main...HEAD` and mandatory exact-HEAD validation (`scripts/test_bootstrap.py`, `scripts/check_secret_tracking.py`, `scripts/validate.py`, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`) pass.

## Required validation
- `python3 scripts/test_bootstrap.py`
- `python3 scripts/check_secret_tracking.py`
- `python3 scripts/validate.py --repository mrdzyn/relatehandoff`
- `RELATE_REQUIRE_CLI=1 npm test` (`53/53 PASS`, `0` skipped)
- `npm run test:security` (`5/5 PASS`)
- `npm run build`
- `git diff --check origin/main...HEAD`
- Link, anchor, Mermaid syntax, asset size/dimension/duration checks, and visual frame inspection.

## Security / privacy considerations
Documentation and media assets only. All captured CLI outputs originate from a sanitized scratch `/tmp` Git repository and Relate store (`mrdzyn/relatehandoff-synthetic`), verified free of tokens, credentials, private transcripts, and personal workstation paths.
