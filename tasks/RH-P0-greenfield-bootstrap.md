# RH-P0 — Greenfield Bootstrap and RelateHandoff Specification

- **Status:** Done — exact audited head `3a32213394d762ab33928ed939fc65756d2320db` squash-merged through PR #1 into `7e21fcebc0192ee6f6fecd553ef3619b9ea7465b`
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
- [x] Owner Mac local validator 7/7 PASS and separate `test_entrypoints.py` PASS at final PR #1 HEAD; independently reproduced by Claude Linux.
- [x] Claude independent COMMENT-only PASS re-audit at the final PR #1 HEAD; F1–F3 resolved, F4 timezone clarified, F5 informational.
- [x] Owner explicitly approved squash merge of PR #1 at the exact audited head; GitHub merged successfully to `main`. No deployment or release approved.

## Security / privacy
No app code, network secrets, customers or real user data. New checks reject tracked sensitive filenames; future Relate clients default read-only.

## Third-party integration / deployment
No runtime or billing integration added. P1 must prove a real Relate process and persistent example store. No production release or deployment.

## Documentation updates
`README.md`, `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/RELEASE.md`, `docs/REPOSITORY-SETUP.md`, `docs/HANDOFFS.md`, `docs/HACKATHON.md`, `config/project-profile.json`, `config/validation-contract.json`; pruned core template historical blocks.

## Completion handoff
`RH-P0-H1` and `RH-P0-H2` preserve historical evidence. PR #1 was fully revalidated and independently re-audited prior to owner-authorized squash merge. `RH-P1-H1` is the next phase transition entry; no Phase 1 runtime is implemented.
