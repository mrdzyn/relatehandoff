# Repository Handoffs

## Purpose

`docs/HANDOFFS.md` is the canonical repository-backed handoff log for work that must continue across AI agents, tools, conversations, or human/agent boundaries.

A handoff records the **minimum operational state needed to continue correctly**. It prevents chat history, copied transcripts, or agent memory from becoming the only continuation mechanism.

This file is **not** part of routine full-file startup context. `docs/STATUS.md` identifies the active handoff ID; the next agent reads only that matching section.

## Relationship to other repository context

Each artifact has one job:

- `docs/STATUS.md` — what is true now; stores only the current **Active handoff** ID plus current phase/status.
- active task/phase specification — objective, scope, acceptance criteria, validation, and stop conditions.
- `docs/HANDOFFS.md` — concise continuation state passed between agents/conversations.
- `docs/PROJECT-MEMORY.md` — durable decisions and rationale; not routine startup context.
- code/tests/PR — authoritative implementation evidence.

Do not duplicate the task contract, STATUS, architecture, or durable decisions inside a handoff. Link to those sources and capture only what the next agent needs to resume.

## When a handoff is required

Create a handoff when responsibility for meaningful work passes to another agent, tool, conversation, or reviewer and continuation state would otherwise have to be reconstructed.

Typical cases:
- implementation is complete and an independent reviewer takes over;
- an agent reaches a bounded checkpoint and another agent continues implementation;
- work moves to a new conversation because context is getting large;
- a review/fix cycle changes the exact branch/head state that the next agent must use;
- work is blocked and another agent/person must resume from a known state.

Do **not** create a handoff after every trivial response or mechanical action. Prefer one handoff per meaningful transfer of responsibility.

## Startup rule

After reading `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, and the active task/phase specification:

1. Read the `Active handoff` value from `docs/STATUS.md`.
2. If it is `None`, continue without loading handoff history.
3. If it contains an ID, locate that exact `## Handoff: <ID>` section in this file.
4. Read only that section unless an older handoff is specifically required to resolve an ambiguity.
5. Verify its branch/PR/SHA against the repository before changing code. Repository state remains authoritative if the handoff is stale.

Never load the full handoff history merely because this file exists.

## Handoff IDs

IDs must be unique within the repository and stable after publication.

Recommended convention:

```text
<TASK-OR-PHASE-ID>-C<n>
```

Examples:
- `P7.0-C1`
- `MKT-MCP2-C1`
- `SEC-005-C2`

For specification-stage handoffs that are intentionally distinct from later implementation handoffs, the master template may use:

```text
<TASK-OR-PHASE-ID>-SPEC<n>
```

Example: `P8.0-SPEC1`.

Projects may use another concise convention when it is already established. Never reuse an ID for a different repository state.

## Required handoff content

Keep each handoff compact. Include only:

- **Task / phase** — active repository-backed specification.
- **From** — agent/role that produced the handoff.
- **To** — expected next role when known, otherwise `next agent`.
- **Branch** — branch the next agent should inspect.
- **Implementation head** — exact code/docs SHA the handoff describes.
- **PR** — PR number/link when one exists.
- **State** — ready for review / ready to continue / blocked / fixes required / other concise state.
- **Completed** — short summary of what changed.
- **Validation** — checks actually run and result; summarize rather than paste logs.
- **Continuation notes** — only constraints, findings, or decisions needed for the next step.
- **Next action** — one exact recommended action.

If a field is not applicable, write `N/A` rather than inventing content.

## Entry template

```markdown
## Handoff: [UNIQUE-ID]

- **Task / phase:** [PATH OR ID]
- **From:** [AGENT / ROLE]
- **To:** [NEXT AGENT / ROLE]
- **Branch:** `[BRANCH]`
- **Implementation head:** `[SHA]`
- **PR:** [# / LINK / N/A]
- **State:** [READY FOR REVIEW / READY TO CONTINUE / BLOCKED / FIXES REQUIRED]

### Completed
- [CONCISE OUTCOME]
- [CONCISE OUTCOME]

### Validation
- `[COMMAND OR CHECK]` — [PASS / FAIL / NOT RUN]
- Required CI: [STATE]

### Continuation notes
- [ONLY WHAT THE NEXT AGENT NEEDS]
- [RISK / FINDING / CONSTRAINT OR "None"]

### Next action
[ONE EXACT NEXT ACTION]
```

## Append and update rules

- Append a new handoff; do not rewrite an older handoff to represent a new repository state.
- Before appending, refresh the branch/PR and confirm the handoff is based on the current intended head.
- If another agent has already appended a newer handoff, reconcile before writing; never overwrite or silently supersede concurrent work.
- If an old handoff contains a factual error, append a correction in a new handoff or clearly mark the correction without changing the historical repository state it described.
- After appending a handoff, update `docs/STATUS.md` so `Active handoff` contains that ID.
- When no continuation handoff is active, set `Active handoff: None`.
- The handoff should reference the final implementation SHA **before the handoff-only documentation commit** when a separate handoff commit is used. The current branch head remains authoritative for subsequent work.

## Content boundaries

Do not put the following in handoffs:
- secrets, tokens, private keys, credentials, or signing material;
- sensitive production/customer data;
- large build/test logs;
- full diffs or copied source files;
- long chat transcripts;
- complete task specifications already stored elsewhere;
- durable architecture/product/security decisions that belong in their canonical docs or `docs/PROJECT-MEMORY.md`;
- speculative future backlog unrelated to the immediate continuation.

Link to the authoritative repository artifact instead.

## Greenfield initialization

Repositories created from the master template keep this policy and entry template but must remove the inherited master-template handoff block during bootstrap.

Remove the block delimited by `MASTER_TEMPLATE_HANDOFFS_START` / `MASTER_TEMPLATE_HANDOFFS_END`, keep the generic `HANDOFF_ENTRIES_START` / `HANDOFF_ENTRIES_END` markers, set `docs/STATUS.md` to `Active handoff: None`, then start the new project's handoff history only when its first meaningful transfer occurs. Until that bootstrap cleanup is complete, a generated child still in `repositoryMode: "template"` must ignore any inherited master active-handoff ID.

## Brownfield adoption

If an existing repository already has a handoff/continuation mechanism:
- reconcile it using the KEEP / MERGE / ADD / RETIRE process in `docs/REPOSITORY-SETUP.md`;
- choose one canonical mechanism;
- do not maintain two competing active handoff logs;
- if an approved equivalent path remains canonical, adapt Project Baseline deliberately rather than duplicating the same handoff state here solely to satisfy CI.

## Handoff entries

<!-- HANDOFF_ENTRIES_START -->
<!-- Append project handoff sections before HANDOFF_ENTRIES_END. -->
## Handoff: RH-P0-H1

- **Task / phase:** `tasks/RH-P0-greenfield-bootstrap.md`
- **From:** ChatGPT / Phase 0 initializer
- **To:** project owner and separate local validation/review agent
- **Branch:** `phase-0/relatehandoff-initialization`
- **Implementation head:** `e73e1030c26421a1588ec7c0d9dc74c8f19e7f15` (before handoff-only documentation commit)
- **PR:** #1 (OPEN, Draft at handoff creation)
- **State:** PENDING EXACT-HEAD LOCAL VALIDATION AND INDEPENDENT REVIEW

### Completed
- Project profile converted from template to project; master-only artifacts and unselected packs pruned.
- Project-specific docs, proposed local-first Relate architecture, bounded next task, hackathon checklist and development validation contract added.
- GitHub static tree check confirmed core files present and inherited master-only files absent.

### Validation
- GitHub static inspection: PASS for required file inventory and cleanup at implementation head `e73e1030c26421a1588ec7c0d9dc74c8f19e7f15`.
- Local Python/CLI checks: NOT RUN; runtime Relate tests: NOT IMPLEMENTED.
- Local git clone attempt from this environment: BLOCKED by DNS resolution, not a code failure.
- GitHub Actions and independent audit: NOT RUN.
- License, repository ruleset, and GitHub topics: owner action/verification pending.

### Continuation notes
- Final PR HEAD after this handoff-only commit supersedes the implementation SHA for exact-HEAD validation.
- Never claim a Relate graph exists until the Phase 1 real integration is implemented.
- Owner merge approval is independent of any technical validation; no merge authorized.

### Next action
On a trusted local checkout of PR #1's **current full HEAD**, run `python scripts/test_bootstrap.py`, `python scripts/check_secret_tracking.py`, `python scripts/validate_project_profile.py --repository mrdzyn/relatehandoff`, and `python scripts/validate.py --repository mrdzyn/relatehandoff`; then request independent review, and seek separate owner approval before merging.

## Handoff: RH-P0-H2

- **Task / phase:** `tasks/RH-P0-greenfield-bootstrap.md`
- **From:** ChatGPT / Phase 0 audit-remediation implementer
- **To:** project owner and independent Claude (or equivalent) re-auditor
- **Branch:** `phase-0/relatehandoff-initialization`
- **Implementation head:** `845eadaf6e5b5a38cda7fbe7bc9271de21b874e1` (before this handoff-only documentation commit)
- **PR:** #1 (open, Draft; no merge)
- **State:** REMEDIATED — PENDING EXACT-HEAD LOCAL VALIDATION AND INDEPENDENT RE-AUDIT

### Completed
- Claude audit comment #6881370268 on `a6e04d25bc17434f3e8a8d1d47b303f0a82c0b59` reported PARTIAL, reproducing 7/7 local PASS but exposing a missing retained `scripts/test_entrypoints.py` governance reference.
- F1: restored `docs/AGENT-ORCHESTRATION.md` link in README and added bootstrap assertion for every mandatory orchestration-document pointer. Full `scripts/test_entrypoints.py` now documented as an **additional separately run** P0 test; it must not run inside the bootstrap test because the self-test invokes `scripts/validate.py`.
- F2: conditionalized design/store/Android pack references; required future work must first restore selected packs from the master template, never assume absent files are present.
- F3: documented portable Python 3 invocation and **appended this corrected handoff**, preserving H1 as a truthful historical snapshot rather than rewriting it.
- F4: clarified that 2026-11-14 16:28 UTC = 2026-11-15 00:28 Philippine time; the existing 2026-11-15 adoption date is correct.
- F5: optional hosted `workflow_dispatch` CI remains unchanged, appropriately disclosed as informational, not a security or CI defect.

### Validation and limits
- Owner's Mac validation: 7/7 PASS at **superseded** `a6e04d25`.
- Claude's Linux validation: reproduced 7/7 PASS and `test_entrypoints.py` FAIL at **superseded** `a6e04d25`.
- GitHub source/static remediation inspection: files/branch updated at `845eadaf6e5b5a38cda7fbe7bc9271de21b874e1`.
- Local Python check on new HEAD: **NOT RUN** in ChatGPT GitHub-only environment; cannot claim PASS.
- Runtime Relate integration: NOT IMPLEMENTED. GitHub Actions: NOT RUN. License and GitHub ruleset: owner gates still open.

### Continuation and next action
On a clean checkout at the **new current exact PR HEAD after this handoff-only commit**, run `python3 scripts/test_bootstrap.py`, `python3 scripts/test_entrypoints.py`, `python3 scripts/check_secret_tracking.py`, `python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff`, and `python3 scripts/validate.py --repository mrdzyn/relatehandoff`. Confirm full SHA, clean tree, and report all results. Then request a fresh independent COMMENT-only PASS/PARTIAL/FAIL audit of F1–F3. Never merge or deploy without explicit owner approval.

## Handoff: RH-P1-H1

- **Task / phase:** `tasks/RH-P1-relate-handoff-mvp.md`
- **From:** ChatGPT / Phase 0 merger and Phase 1 handoff preparer
- **To:** one primary implementation agent (Codex or compatible CLI agent), once the handoff and branch are approved
- **Branch:** `docs/rh-p1-implementation-handoff` (documentation-only transition, not the implementation branch)
- **Verified Phase 0 merge baseline:** `7e21fcebc0192ee6f6fecd553ef3619b9ea7465b` (`main`, PR #1 merged)
- **Audited PR #1 implementation head:** `3a32213394d762ab33928ed939fc65756d2320db`
- **PR:** separate docs-only Draft transition; number assigned at PR creation
- **State:** HANDOFF PREPARED — Phase 1 code NOT STARTED; exact-HEAD validation and review of this docs-only change pending

### Completed
- PR #1 passed final-owner-reported Mac local 7/7 and separate entrypoint self-tests, plus independent Claude Linux PASS re-audit at the audited exact head. See https://github.com/mrdzyn/relatehandoff/pull/1#issuecomment-6893352785.
- Owner explicitly approved squash merge of precisely the audited PR head. GitHub returned successful squash merge SHA `7e21fcebc0192ee6f6fecd553ef3619b9ea7465b`; remote `main` was verified equal to that SHA.
- Updated Phase 0 task to Done, prepared the RH-P1 bounded implementation contract, and corrected the bootstrap test's P0-only active-task assertion for this transition.

### First execution objective and evidence
- Starting from a fresh verified `main`, verify the actual Relate release/CLI or API, local install, real persisted directory graph across restart, and read-only MCP behavior **before** implementing a broader recorder. Verify platform support rather than inventing compatibility.
- Build the minimum demonstrable agent handoff: validated writer → persistent Relate graph → independent read-only MCP client → SHA-A-to-SHA-B stale-evidence detection; prove each using real local integration tests and synthetic records.
- Git/repo instructions remain canonical; graph is a derived context index. No generic write-Cypher MCP, shell execution, private transcripts, secrets or autonomous merging.

### Validation and limits
- Phase 0 evidence is attached to **PR #1's audited head**; the new squash `main` SHA is not a claim that Phase 1 runtime checks passed.
- This handoff-preparation branch: project checks and independent audit **NOT RUN YET**; no product code or Relate binary was executed.
- Host CI, license decision, repository protections, cross-device and agent-host compatibility remain unverified until explicitly checked. No deployment or publication.

### Next action
Review the docs-only phase transition, run `python3 scripts/test_bootstrap.py`, `python3 scripts/test_entrypoints.py`, `python3 scripts/check_secret_tracking.py`, `python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff`, and `python3 scripts/validate.py --repository mrdzyn/relatehandoff` on the exact clean Draft PR HEAD. Seek independent audit and separate owner merge approval. Only after transition acceptance should the implementation agent create `phase-1/relate-handoff-mvp` from the then-current main and start real Relate feasibility testing.

## Handoff: RH-P2-H1

- **Task / phase:** `tasks/RH-P2-real-agent-handoff-followup.md`
- **From:** Antigravity / RH-P2 remediation implementer
- **To:** Independent reviewer (Claude or equivalent)
- **Branch:** `phase-2/real-agent-handoff-followup`
- **Implementation head:** `phase-2/real-agent-handoff-followup` exact HEAD at Draft PR #4 re-audit
- **PR:** #4 (OPEN, Draft; no merge)
- **State:** REMEDIATED — PENDING INDEPENDENT EXACT-HEAD RE-AUDIT

### Completed
- Hardened `src/mcp_client.mjs` (`callRelateMcpBatch`, `resumeTaskViaReadOnlyMcp`) with `DEFAULT_MCP_TIMEOUT_MS = 15000`, `killSignal: "SIGKILL"`, safe JSON-RPC parsing, id-based response lookup, and stderr diagnostics.
- Hardened `test/e2e_mcp.test.mjs` with `--test-timeout=30000`, per-RPC timeouts, `error`/`exit` handlers, guaranteed `SIGKILL` cleanup, diagnostic persistent-reader characterization, and `(fake)` fault-injection tests.
- Sanitized `docs/RH-P2-REAL-AGENT-PROOF.md` (removed private paths and unsupported internal claims, added `RH-P2-CODEX-CLAUDE-1` with exact SHA, unsigned evidence distinction, and placeholder clock disclosure).
- Added `tasks/RH-P2-real-agent-handoff-followup.md` and reconciled `docs/STATUS.md`.

### Validation
- See `docs/STATUS.md` (`Verification truth`) and PR #4 re-audit comment for exact-HEAD `scripts/validate.py`, Python entrypoints, `npm run build`, `npm run test:security`, `npm test`, `npm run demo`, and orphan-process check.

### Continuation notes
- Persistent `relate serve --mcp stdio --read-only` hosts must restart to observe external writes; `src/mcp_client.mjs` spawns a fresh short-lived process per `resume` batch.
- Keep PR #4 Draft until independent exact-HEAD re-audit and separate owner merge approval.

### Next action
Run independent COMMENT-only exact-HEAD re-audit on Draft PR #4 (`phase-2/real-agent-handoff-followup`) and await separate human owner merge approval.

## Handoff: RH-P2-H2

- **Task / phase:** `tasks/RH-P2-real-agent-handoff-followup.md` (Done; RH-P2 post-merge closeout)
- **From:** Antigravity / RH-P2 post-merge closeout
- **To:** Independent reviewer and project owner (for closeout PR #5 review and owner direction on RH-P3)
- **Branch:** `docs/rh-p2-postmerge-closeout`
- **Implementation head (pre-remediation):** `402a1a592578b8fda887a2bbfc92bbdbb4551f1f`
- **Audited PR #4 HEAD:** `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`
- **PR #4 squash merge commit (`main`):** `a6bb9bdd562205e5690318272bce8dda0ecf6306` (`2026-11-17T06:40:24Z`)
- **PR:** #5 (OPEN, Draft; no merge)
- **State:** RH-P2 MERGED — DOCS-ONLY CLOSEOUT REMEDIATED

### Completed
- Verified PR #4 squash commit `a6bb9bdd562205e5690318272bce8dda0ecf6306` (`2026-11-17T06:40:24Z`) on `origin/main`.
- Reconciled `docs/STATUS.md`, `tasks/RH-P2-real-agent-handoff-followup.md`, `docs/RH-P2-REAL-AGENT-PROOF.md`, and `docs/HANDOFFS.md` without modifying source, tests, fixtures, or historical RH-P0/RH-P1/RH-P2-H1 records.

### Validation & Limits
- PR #4 macOS ARM64 COMMENT-only PASS ([`6938739073`](https://github.com/mrdzyn/relatehandoff/pull/4#issuecomment-6938739073)) at `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`: reviewer session reports real `relate v1.0.1`, 15/15 tests, 8/8 `validate.py`, and no orphans; posted through the owner's GitHub account (not externally authenticated as independent certification).
- PR #4 Linux COMMENT-only PASS ([`6940763547`](https://github.com/mrdzyn/relatehandoff/pull/4#issuecomment-6940763547)) at `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`: real `relate` CLI unavailable; independently verified security, `(fake)` fault injection, process cleanup, and other runnable checks (posted through the owner's GitHub account).
- Author-reported exact-HEAD checks at `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`: 15/15 `npm test`, 5/5 `npm run test:security`, `npm run build`, `npm run demo`, and `scripts/validate.py` PASS.
- `RH-P2-CODEX-CLAUDE-1` macOS ARM64 real-agent handoff remains `OWNER-REPORTED`.

### Continuation notes
- Remaining limitations: persistent `relate serve --mcp stdio --read-only` startup snapshot, unsigned local store (`executionAuthenticity: "UNVERIFIED"` without `--verify`), and Linux `GLIBC_2.39` prebuilt binary block on Debian 12 (`GLIBC_2.36`).
- Do not start RH-P3 implementation from this docs-only closeout.

### Next action
Complete independent review and separate owner merge approval for Draft PR #5. RH-P3 planning may begin only on explicit owner direction. RH-P3 implementation remains unauthorized.

## Handoff: RH-P3-PLAN1

- **Task / phase:** `docs/RH-P3-PLAN.md` (RH-P3 planning proposal; implementation unauthorized)
- **From:** Antigravity / RH-P3 planner
- **To:** Independent reviewer and project owner
- **Branch:** `docs/rh-p3-planning`
- **Verified `main` baseline:** `f451b75acb3b85191886da3b2504822dcc60c2f5` (PR #5 squash merge)
- **PR:** Docs-only Draft PR against `main` (no merge)
- **State:** PLANNING PROPOSAL READY — OWNER DECISIONS REQUIRED BEFORE IMPLEMENTATION

### Completed
- Reconciled `docs/STATUS.md` with PR #5 squash merge (`f451b75acb3b85191886da3b2504822dcc60c2f5`).
- Drafted `docs/RH-P3-PLAN.md` covering clean-machine setup, Linux `GLIBC` compatibility, persistent MCP reader architecture evaluation (Options A/B/C), security/authenticity invariants, judge demo criteria, licensing, proposed phased tasks (`RH-P3-T1`–`RH-P3-T4`), stale `PRODUCT.md`/`ARCHITECTURE.md` corrections, and owner decisions.

### Validation
- See Draft PR description and `docs/STATUS.md` for exact-HEAD canonical checks (`git diff --check`, `test_bootstrap.py`, `test_entrypoints.py`, `check_secret_tracking.py`, `validate_project_profile.py`, `validate.py`).

### Continuation notes
- No source, tests, dependencies, fixtures, or schema changed.
- Do not start RH-P3 implementation, submission, release, or merge without explicit owner direction.

### Next action
Complete independent COMMENT-only review of the Draft PR and obtain explicit owner decisions on license, MCP reader strategy (`Option B` vs `Option C`), `PRODUCT.md`/`ARCHITECTURE.md` sync (`S2`), and submission gating.

## Handoff: RH-P3-READINESS1

- **Task:** `tasks/RH-P3-judge-readiness.md`
- **From:** ChatGPT documentation preparer
- **To:** Exact-HEAD reviewer and owner-side CLI tester
- **Branch:** `docs/rh-p3-judge-readiness-01`
- **Base:** `e61b84dd0e7aada50f2ea8e94e6b8f9b1cd1b0d8` (PR #6 squash)
- **State:** Unvalidated documentation proposal; no merge/release/submission authorization

### Completed
- Prepared pinned setup, documented GLIBC/long-lived MCP caveats, proposed S2 status corrections, updated verified hackathon rule checklist, and drafted original video capture guidance.
- Only docs/task files are intended to change. Prior handoff entries remain intact.

### Verification limitations and next action
- This shell lacks Node 24 and real Relate CLI and could not clone directly via GitHub DNS. No exact-HEAD canonical test or demo was executed.
- Run fresh macOS ARM64 / Linux x86_64 canonical tests and real CLI demo at final PR HEAD, independently audit, and obtain separate owner merge approval.
- License, GitHub topic, original video, release and submission remain owner decisions. S1 persistent MCP wrapper and S3 hosted CI have not been authorized or implemented.

## Handoff: RH-P3-READINESS2

- **Task:** RH-P3-T1/T4 judge-readiness documentation reconciliation
- **From:** ChatGPT RH-P3 follow-up
- **To:** Owner-side exact-HEAD validator, independent COMMENT-only reviewer and project owner
- **Branch:** `docs/rh-p3-judge-readiness-01`
- **Initial reviewed baseline:** `e61b84dd0e7aada50f2ea8e94e6b8f9b1cd1b0d8` (PR #6)
- **Latest verified `main`:** `3783f08fd78621302be3134f05d4d8d17551c287` (PR #8 squash)

### Changes and gate status
- Reconciled the now-approved, merged Apache-2.0 license in README, PRODUCT, STATUS, HACKATHON, video guide and Devpost draft; no original RH-P3-READINESS1 handoff text modified.
- Added an explicit persistent Relate directory-store / graph relationship explanation for judges.
- Devpost official rules rechecked 2026-11-18; public GitHub topic `relate` is required.
- **No exact-HEAD real Relate CLI or canonical tests executed by this documentation agent.** Earlier owner-side validation belongs to earlier PRs and does not transfer.
- PR #7 still needs independent COMMENT-only review and separate owner authorization to merge. Actual video, GitHub topic configuration, distribution license diligence and submission remain open. No source, dependencies, tests, fixtures or schema changed.

### Next action
Owner-side run the full RH-P3-T1/T4 clean-checkout test contract on the new PR #7 HEAD with Relate CLI v1.0.1, capture real demo output, then request independent review. Do not merge/release/submit automatically.

## Handoff: RH-P4-PLAN1

- **Task:** `tasks/RH-P4-cloudflare-judge-showcase.md` (planning only)
- **From:** Claude (planning)
- **To:** Exact-HEAD validator, independent COMMENT-only reviewer and project owner
- **Branch:** `docs/rh-p4-cloudflare-showcase-plan`
- **Base:** `81e8e208eeb8a23417e18f2a8d3f379f441e6ed8`

### Completed
- Added the RH-P4 task contract, showcase plan and security review; updated STATUS; added the RH-P4 task path to the `scripts/test_bootstrap.py` active-task allowlist (fail-closed checks unchanged).
- No UI, `site/`, Cloudflare configuration, dependency, source, test, fixture or schema change.

### Open gates
- Owner decisions D1–D8 in `docs/RH-P4-SHOWCASE-PLAN.md`; the design capability gate is closed; Cloudflare enablement, deployment, video and Devpost submission are not authorized.

### Next action
Validate the exact PR HEAD with real Relate CLI v1.0.1, obtain an independent COMMENT-only audit, and decide D1–D8 before any T1+ work.

## Handoff: RH-P5-PLAN1

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Claude (planning)
- **To:** Exact-HEAD validator, independent COMMENT-only reviewer and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan`
- **Base:** `282e10e600935ee1c1bba34522cb3e3373f3be1d`

### Completed
- Added the RH-P5 task contract, platform plan, D1 schema/data-access rules and threat model; updated STATUS; added the RH-P5 task path to the `scripts/test_bootstrap.py` allowlist (fail-closed checks unchanged).
- No code, `cloud/` directory, Worker, wrangler/D1/KV/R2 configuration, migration, dependency, source, test, fixture, workflow, profile or PRODUCT/ARCHITECTURE change.

### Open gates
- Owner decisions D0–D14 (notably D0: scope expansion versus the PRODUCT/ARCHITECTURE non-goals). UI design gate closed. Cloudflare resources, OAuth clients, deployment, production connection and submission are not authorized.

### Next action
Validate the exact PR HEAD with real Relate CLI v1.0.1, obtain an independent COMMENT-only audit, and decide D0–D14 before any T1+ work.

## Handoff: RH-P5-PLAN2

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Claude (planning remediation)
- **To:** Exact-HEAD validator, independent COMMENT-only re-auditor and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Audited HEAD remediated:** `7c75899d44e14314d156a604992ca7c742e5c9fa` (review 5957032620)

### Completed
- P11-01: `docs/RH-P5-D1-SCHEMA.md` revision 2 adds scoped UNIQUE parents and composite foreign keys for every actor, publisher, tenant and project relationship, plus `project_identities`, `github_app_links` and a relationship matrix.
- P11-02: documented and specified ordered atomic project deletion with a non-sensitive tombstone, in-statement `server_seq` allocation with idempotent retries, immutable handoff content with audited status transitions, server-controlled `GITHUB_APP` observations, and a DB-01…DB-19 database-level negative test matrix; plan and threat model updated.
- Local SQLite verification only; no D1/Miniflare run. No Worker, wrangler, migration, dependency, deployment or production change.

### Open gates
- D0–D14, design gate, D1/Miniflare execution (T2), trigger/`STRICT` support on D1 **[verify]**, Cloudflare resources, deployment and submission remain unauthorized.

### Next action
Exact-HEAD validation with real Relate CLI v1.0.1, a focused independent COMMENT-only re-audit, then owner decisions D0–D14.

## Handoff: RH-P5-PLAN3

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Claude (targeted D1 status-history integrity check)
- **To:** Exact-HEAD validator, independent COMMENT-only re-auditor and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Starting HEAD:** `c0eae0f1920962c752cc39d7193f0dde8ba77b7e`

### Completed
- Reproduced that `status_reason`, `status_changed_at` and `status_actor_principal_id` could be rewritten without a new event while `status` stayed unchanged, plus forged status events and `INSERT OR REPLACE` overwrites of audit, handoff and event rows.
- `docs/RH-P5-D1-SCHEMA.md` revision 3: frozen status attribution unless `status` changes, no backward status time, mirror-only unique status events, no-overwrite insert triggers, frozen deletion marker, DAL rule against `OR REPLACE`/`ON CONFLICT`; new matrix DB-20…DB-26 and regression record (§9). Valid ACTIVE→SUPERSEDED/RETRACTED and SUPERSEDED→RETRACTED transitions preserved.
- Plan and threat model updated. Local SQLite verification only; D1/Miniflare not run. No Worker, wrangler, migration, dependency or production change.

### Open gates
- D0–D14, design gate, D1/Miniflare execution (T2), trigger/`STRICT` support on D1 **[verify]**, Cloudflare resources, deployment and submission remain unauthorized.

### Next action
Exact-HEAD validation with real Relate CLI v1.0.1, a focused independent COMMENT-only re-audit, then owner decisions D0–D14.

## Handoff: RH-P5-PLAN4

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Claude (remediation of independent review findings P11-03 and P11-04)
- **To:** Exact-HEAD validator, independent COMMENT-only re-auditor and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Starting HEAD:** `3ab7b2fd05d20bc086ec4f872c04228f69e4ed37` (verified equal to the remote branch; no drift)

### Completed
- Reproduced P11-03 and P11-04 on the revision-3 DDL, plus six further `project_identities` overwrite variants and a resurrection of a deleted project.
- `docs/RH-P5-D1-SCHEMA.md` revision 4: `trg_identities_no_overwrite`, `trg_events_no_overwrite` on both unique paths, a previous-status provenance check on status events, overwrite-path inventory (§3.1), matrix DB-27…DB-29 and regression record (§10). Valid transitions and tombstone behavior preserved.
- Inventory of all other immutable-table unique paths found no further gap. Mutable credential tables (`publishers`, grants, connections, app links) remain unguarded and were demonstrated to allow revocation reset through `REPLACE`/`UPDATE`; recorded as residual R-1, not remediated.
- Local SQLite verification only (`recursive_triggers` OFF; ON informational); D1/Miniflare UNVERIFIED. No Worker, wrangler, migration, dependency, workflow, profile or production change.

### Open gates
- D0–D14, design gate, D1/Miniflare execution (T2), R-1 decision, Cloudflare resources, deployment and submission remain unauthorized.

### Next action
Exact-HEAD validation with real Relate CLI v1.0.1, a focused independent COMMENT-only re-audit, then owner decisions D0–D14 and the R-1 decision.

## Handoff: RH-P5-PLAN5

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Claude (owner-directed remediation of residual R-1; review 5988533009)
- **To:** Exact-HEAD validator, independent COMMENT-only re-auditor and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Starting HEAD:** `61188d97570e3b51cd7fcc44cb40d77dd2d9d1eb` (verified equal to the remote branch; no drift)

### Completed
- Reproduced R-1 on the revision-4 DDL (REPLACE key swap plus revoked-publisher reset, UPDATE un-revoke, REPLACE clearing a revoked grant).
- `docs/RH-P5-D1-SCHEMA.md` revision 5: no-overwrite guards, immutable identity and key material, permanent one-way revocation (connection revocation cascades), delete guards and credential-use checks for `publishers`, `oauth_connections`, `connection_project_grants`, `github_app_links`; `UNIQUE (provider_grant_id)`; grants re-keyed by `grant_id` with `granted_by_principal_id` and a partial unique index of active grants; rotation by a new publisher and re-authorization by a new grant row (§5.5); matrix DB-30…DB-37; regression record §11. Ordinary mutable tables are not blanket-locked.
- Plan decision D15 (credential lifecycle and grant-key change), threat model B18/B19, STATUS updated. Local SQLite verification only; D1/Miniflare UNVERIFIED. No Worker, wrangler, migration, dependency, workflow, profile or production change.

### Open gates
- D0–D15, design gate, D1/Miniflare execution (T2), residual R-2…R-6 (R-4: remaining mutable tables DAL-only), Cloudflare resources, deployment and submission remain unauthorized.

### Next action
Exact-HEAD validation with real Relate CLI v1.0.1, a focused independent COMMENT-only re-audit, then owner decisions D0–D15.

<!-- HANDOFF_ENTRIES_END -->
