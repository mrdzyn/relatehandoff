# RH-P4 — Cloudflare Judge Showcase (planning task)

- **Status:** Draft. This task contract covers **planning documents only**. Site implementation (RH-P4-T2 onward) is **not authorized** until the owner approves the gates below.
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Implementation agent:** unassigned for T2+; planning prepared by Claude
- **Target branch:** `main` (baseline `81e8e208eeb8a23417e18f2a8d3f379f441e6ed8`)
- **Working branch:** `docs/rh-p4-cloudflare-showcase-plan`

## Objective
Define a bounded, truthful plan for a lightweight static Cloudflare Pages showcase that helps hackathon judges understand RelateHandoff in under two minutes, **without changing the local-first engine** and without adding any public backend.

## Context
RH-P3 made the repository reproducible for judges (`README.md`, `docs/JUDGE-WALKTHROUGH.md`, `docs/RH-P3-*`). A short visual page can explain the handoff model faster than the CLI. The showcase is an explanatory view; it never replaces Git, tests or the local Relate store as the source of truth. See `docs/RH-P4-SHOWCASE-PLAN.md` and `docs/RH-P4-SECURITY-REVIEW.md`.

## Delivery mode / UI design gate
- **Material user-facing UI:** Yes (a public web page), at T2 and later.
- **UI design gate:** **Required, currently CLOSED.** `config/project-profile.json` has `capabilities.design=false` and no platform; the design pack was deliberately pruned (`AGENTS.md`). This planning PR contains **no UI**.
- **Requirements/product contract:** `docs/RH-P4-SHOWCASE-PLAN.md` §1–§3
- **Screen map / user flows:** `docs/RH-P4-SHOWCASE-PLAN.md` §4
- **Screen designs / mockups:** not started (T1 deliverable, after owner approval to enable the design capability)
- **Human design approval:** PENDING
- **UI shell scope (T2):** one static page, recorded-data fixture only, no wiring
- **Wiring scope:** none. No API, auth, storage, analytics or live Relate call.
- **Test scope:** static content/security checks via Node built-ins, plus manual accessibility/responsive QA

## Agent context and delegation
- **Primary write owner:** one implementation agent; no subagents by default
- **Context budget:** FOCUSED (soft)
- **Usage evidence:** NOT AVAILABLE

## Test objective / validation budget
- **Test objective (this PR):** prove the planning change does not break the repository's canonical validation and that the active-task allowlist stays fail-closed.
- **Minimum automated evidence:** `git diff --check`, `scripts/test_bootstrap.py`, `scripts/test_entrypoints.py`, `scripts/check_secret_tracking.py`, `scripts/validate_project_profile.py`, `scripts/validate.py` (8/8), `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`.
- **Manual QA:** not applicable to this PR.
- **Escalation triggers:** any source, dependency, schema or workflow change; any profile selector change.
- **Required gates:** local exact-HEAD validation, independent COMMENT-only audit, separate owner merge approval.

## Allowed scope (this PR)
`tasks/RH-P4-cloudflare-judge-showcase.md`, `docs/RH-P4-SHOWCASE-PLAN.md`, `docs/RH-P4-SECURITY-REVIEW.md`, `docs/STATUS.md`, append-only `docs/HANDOFFS.md`, and `scripts/test_bootstrap.py` (one allowlist entry for this task).

## Forbidden scope
Site code or assets, `site/` directory, `wrangler` config, Cloudflare dashboard/API changes, workflows, dependencies, `src/`, `test/`, fixtures, schema, `config/project-profile.json`, design-pack restoration, video recording, Devpost submission, deployment, merge.

## Phased tasks (proposed; each needs owner go-ahead)
| ID | Deliverable | Gate |
|---|---|---|
| RH-P4-T0 | This planning PR | independent audit + owner merge |
| RH-P4-T1 | Owner approves design capability; enable `design=true`, `platforms=["web"]`; restore only selected design guidance from the master template; screen designs/mockups; human design approval | owner approval (closed) |
| RH-P4-T2 | Static shell in `site/` with recorded-data fixture, `_headers`, content/security checks | T1 approved |
| RH-P4-T3 | Recorded-data capture from a real exact-HEAD `npm run demo`; manual a11y/responsive QA; local preview evidence | T2 merged |
| RH-P4-T4 | Cloudflare Pages project and **manual** deploy by owner | explicit owner approval to enable the site |

## Acceptance (this PR)
- [ ] Plan, security review and task contract exist and agree with `AGENTS.md`, `docs/SECURITY.md` and RH-P3 documents.
- [ ] STATUS names this task as active; `scripts/test_bootstrap.py` allows it and still rejects unknown or missing task files.
- [ ] Exact-HEAD canonical validation with real Relate CLI v1.0.1, truthfully reported.
- [ ] Independent COMMENT-only audit.
- [ ] Owner decisions D1–D8 in the plan answered before any T1+ work.
- [ ] Separate owner merge approval. No deployment, publication or submission follows automatically.
