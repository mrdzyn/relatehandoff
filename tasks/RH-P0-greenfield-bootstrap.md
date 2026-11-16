# RH-P0 — Greenfield Bootstrap and RelateHandoff Specification

- **Status:** Review — local exact-HEAD validation and independent review pending
- **Owner/orchestrator:** mrdzyn
- **Implementation agent:** ChatGPT (GitHub connector; documentation + repository hygiene)
- **Target branch:** `main`
- **Working branch:** `phase-0/relatehandoff-initialization`

## Objective
Convert the freshly generated master-template repository into a coherent RelateHandoff project without misrepresenting an unimplemented Relate integration.

## Context
Created from `mrdzyn/ai-native-project-template` for the December 2026 Relate hackathon. The repository initially contained master task history, handoffs, design/store packs and a `repositoryMode: template` profile.

## Delivery mode / UI design gate
- **Material user-facing UI:** No
- **UI design gate:** Not applicable
- **Requirements/product contract:** `docs/PRODUCT.md`
- **Shell/wiring scope:** Not applicable; no production code in this task
- **Test scope:** bootstrap, profile, safe tracking and local validation runner

## Agent context and delegation
- **Primary write owner:** ChatGPT via GitHub connector
- **Subagents:** None
- **Context budget:** Focused to canonical startup, onboarding and validators
- **Usage evidence:** NOT AVAILABLE

## Test objective / validation budget
Prove the project profile, repository hygiene, task pointers, and local-first validation contract are internally consistent on the proposed exact commit.
- **Minimum automated evidence:** `python3 scripts/test_bootstrap.py`; `python3 scripts/test_entrypoints.py` (separate governance self-test; intentionally not nested inside validate); `python3 scripts/check_secret_tracking.py`; `python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff`; `python3 scripts/validate.py --repository mrdzyn/relatehandoff`
- **Manual QA:** Inspect GitHub Draft PR, ensure preserved safeguards, check local checkout cleanliness and topic/ruleset settings.
- **Escalation:** Unexpected profile failure, policy regression, tracked secrets, or missing canonical core.
- **Required gates:** Exact-HEAD local validation, independent audit, applicable repository protection, separate human merge approval.

## Allowed scope
Project profile; README and canonical docs; phase tasks; bootstrap-only validator helper scripts; pruning of inherited master-only tasks/workflows and unselected design/store/integration packs.

## Forbidden scope
Runtime feature implementation, network/production deployment, GitHub topic/settings mutation, autonomous merge, license selection without owner approval, real user data or credentials.

## Acceptance criteria
- [x] Project profile changed to `repositoryMode: project`, with no unused capability selectors.
- [x] Project-specific README, product, architecture, security, testing, release and STATUS context created.
- [x] Inherited memory/handoff blocks, master task history and unused packs removed.
- [x] Required core operating model and CI caller/callee preserved.
- [x] Phase 1 bounded task and hackathon submission checklist documented.
- [x] GitHub static inventory confirms expected core paths and removal of master-only artifacts.
- [ ] Re-run the local validator commands **and `test_entrypoints.py`** against the updated exact Draft PR HEAD (prior owner Mac and independent Claude Linux 7/7 PASS were at `a6e04d25bc17434f3e8a8d1d47b303f0a82c0b59`, superseded by remediation).
- [ ] Obtain a **PASS re-audit** of Claude's initial PARTIAL findings F1–F3 after remediation; F4 is explained by Asia/Manila timezone, F5 is informational.
- [ ] Owner independently approves merge; no release or scope changes presumed.

## Security / privacy
No app code, network secrets, customers or real user data. New checks reject tracked sensitive filenames; future Relate clients default read-only.

## Third-party integration / deployment
No runtime or billing integration added. P1 must prove a real Relate process and persistent example store. No production release or deployment.

## Documentation updates
`README.md`, `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/RELEASE.md`, `docs/REPOSITORY-SETUP.md`, `docs/HANDOFFS.md`, `docs/HACKATHON.md`, `config/project-profile.json`, `config/validation-contract.json`; pruned core template historical blocks.

## Completion handoff
`RH-P0-H1` is the original historical handoff; the next handoff entry will summarize Claude's PARTIAL audit and the remediation. The current PR HEAD must be independently revalidated. This implementation session did not run local Python commands.
