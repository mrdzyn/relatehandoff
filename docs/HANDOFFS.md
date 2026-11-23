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
- D0–D15, design gate, D1/Miniflare execution (T2), residual R-2/R-3/R-5/R-6, Cloudflare resources, deployment and submission remain unauthorized.

### Next action
Exact-HEAD validation with real Relate CLI v1.0.1, a focused independent COMMENT-only re-audit, then owner decisions D0–D15.

## Handoff: RH-P5-PLAN6

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Codex (remediation after independent audit 5991551668)
- **To:** exact-HEAD validator, focused independent COMMENT-only re-auditor and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Starting HEAD:** `88875144e9cc73b90f43b664ea1d84cfdddc17ff`; local worktree and origin-tracking ref matched. Live `git fetch` was blocked by the read-only `.git` boundary; GitHub audit reported this exact audited HEAD.

### Completed
- Revision 6 adds active, non-deleted project guards for new publisher registrations and GitHub App links; fixes P11-05/P11-06 while preserving active-project registration, rotation and owner-created link paths.
- R-4 fix protects `(provider, repo_id)` against UPDATE and project-row replacement collisions while leaving `slug`, `repo_full_name`, `default_branch` and other metadata mutable. No unrelated mutable table was locked and no new owner decision was introduced.
- Reproduced P11-05, P11-06 and R-4 against the complete revision-5 DDL. Revision-6 exact-source SQLite run: 19 tables, 65 triggers, DB-01…DB-40 case rows 40/40, 174/174 assertions, `foreign_key_check=[]`, `integrity_check=ok` (Python SQLite 3.54.1; FKs on; recursive triggers off).
- The previous 259-assertion throwaway harness was absent. This run does not recreate exhaustive DB-27/DB-29 alternate-unique-key permutations; do not characterize it as equivalent. D1/Miniflare and true concurrent D1 transaction behavior are UNVERIFIED.
- At exact commit `7f5887ea15812f03fd5d6d04ff7a05653c2b0185`, canonical checks passed on macOS ARM64/Python 3.15.2/Node 26.7.0 with real Relate v1.0.1: bootstrap, entrypoints, secret tracking, profile validation, `validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test` 15/15 (0 skipped), security 5/5 and build. This validates existing local engine behavior, not D1.

### Open gates
- Re-run canonical validation on the final post-evidence commit; address any result honestly.
- Recover/re-run exhaustive DB-27/DB-29 probes before re-audit. D0–D15 and design gate remain owner-gated; no cloud resource, deployment, merge or publication is authorized.

### Next action
Finish exact-HEAD validation, verify the remote PR head before normal push, update the Draft PR description with evidence/limitations, and request a focused independent COMMENT-only re-audit. Keep PR #11 Draft.

## Handoff: RH-P5-PLAN7

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Codex (revision-6 overwrite-evidence recovery)
- **To:** exact-HEAD validator, focused independent reviewer and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Input HEAD:** `a1146e462459ce000980208d09306e1ad006cb22`; local and origin-tracking heads matched; worktree was clean.

### Verified evidence
- Verbatim extracted revision-6 DDL, SQLite 3.54.1, 19 tables/65 triggers, FKs on and recursive triggers off. Focused local run passed 32 DB-27, 8 DB-28 and 120 DB-29 overwrite probes with 532 assertions, plus 10 positive lifecycle/metadata assertions; final FK check empty and integrity check `ok`. Exact specifications, index inventory scope, assertion breakdown and limitations are in schema §8.
- Canonical validation at input HEAD: bootstrap, entrypoints, secret tracking, profile validation passed; `scripts/validate.py` 8/8; real Relate CLI v1.0.1; `RELATE_REQUIRE_CLI=1 npm test` 15/15, 0 skipped; security 5/5; build exited 0.
- The old 259-assertion scratch harness is unavailable. DB-27's 32 historical permutations were recreated; DB-29 current scope has 30 physical paths / 120 probes versus the historical 132. The implied remaining 12 probes are not mapped, so historical equivalence and closure verdict are PARTIAL. Do not request re-audit as complete until resolved.
- No previous-head differential or D1/Miniflare/concurrent D1 execution was performed. D1/Miniflare remains UNVERIFIED; D0–D15 remain owner-gated.

### Remaining
- Canonical exact-HEAD validation and the focused SQL matrix were repeated after the evidence commit; results are recorded in schema §8.
- Keep PR #11 Draft; no merge, deployment or production changes. Preserve planning-only allowlist. Owner decisions and implementation gates remain unchanged.

## Handoff: RH-P5-PLAN8

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Antigravity (12-probe DB-29 reconciliation & current-schema unique-path coverage)
- **To:** focused independent COMMENT-only reviewer and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Input HEAD:** `8b520036c076266639b86e82b7658ba8a02dbbc2`

### Verified evidence
- Independent `sqlite_master` + `PRAGMA index_list`/`index_xinfo` comparison of revision 5 (`88875144e9cc73b90f43b664ea1d84cfdddc17ff`: 19 tables, 61 triggers, 6 explicit indexes, 38 unique paths) and revision 6 (`8b520036c076266639b86e82b7658ba8a02dbbc2`: 19 tables, 65 triggers, 6 explicit indexes, 38 unique paths) confirms **0** unique-path changes (only 4 triggers added in rev 6).
- All 38/38 physical unique paths in revision 6 are mapped in `docs/RH-P5-D1-SCHEMA.md` §8 (30 guarded paths across 14 immutable/credential/project tables + 8 intentional mutable/DAL-guarded administrative paths across 5 tables, correcting the earlier `42/12` note).
- Executed 120 baseline DB-29 probes (360 assertions) + 52 revoked-credential/archived-project state-variant probes (156 assertions) = **172 probes / 516 assertions** on verbatim revision-6 DDL (SQLite 3.54.1, `foreign_keys=ON`, `recursive_triggers=OFF`), with 0 row mutations, 0 FK/integrity errors, and 0 credential/project resurrections.
- Historical 132-probe / 259-assertion equivalence is **not claimed** (lost rev-5 scratch harness; historical counting discrepancy documented), while **complete current-schema unique-path coverage (38/38)** is independently demonstrated.

### Remaining
- Focused independent COMMENT-only re-audit on the resulting exact HEAD.
- D1/Miniflare execution and D0–D15 remain gated. Keep PR #11 Draft; do not merge, deploy, or push without owner direction.

## Handoff: RH-P5-PLAN9

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (planning only)
- **From:** Antigravity (evidence-attribution clarification for PR #11 COMMENT-only review)
- **To:** focused independent COMMENT-only reviewer and project owner
- **Branch:** `docs/rh-p5-remote-mcp-platform-plan` (Draft PR #11)
- **Input HEAD:** `780cc1e92b0d111be1c445c5e99f32d28c6c143d`

### Verified evidence
- Addressed PR #11 COMMENT-only review wording finding in `docs/RH-P5-D1-SCHEMA.md` (§8, §12) and `docs/STATUS.md` with no schema or application changes:
  - **38/38 unique paths were inventoried** (confirmed by independent source-level review at `780cc1e92b0d111be1c445c5e99f32d28c6c143d`);
  - **30 protected paths were tested locally** in owner/implementer-side SQLite runs (**172 probes / 516 assertions**: 120 baseline + 52 revoked-credential/archived-project state variants; not independently re-executed by the external reviewer);
  - **8 mutable administrative paths remain DAL-controlled** (inventoried, intentionally not DB overwrite-denial tested);
  - Historical 259-assertion equivalence remains **unproven**.

### Remaining
- Focused independent COMMENT-only re-audit on the new exact HEAD.
- D1/Miniflare parity, actual concurrent D1 transaction/race behavior, and D0–D15 owner gates remain UNVERIFIED / gated. Keep PR #11 Draft; do not merge or deploy.

## Handoff: RH-P5-CLOSEOUT

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (RH-P5 planning post-merge closeout)
- **From:** Antigravity (post-merge synchronization & owner-decision packet)
- **To:** project owner (`mrdzyn`) and next authorized RH-P5-T1 agent (after D0–D15 approval)
- **Branch:** `docs/rh-p5-post-merge-closeout`
- **Merged baseline:** `main@19fcf51f7f8d362b9fd25b57bdb842f1c0583546` (PR #11 squash merge, `2026-11-22T16:39:56Z`)

### Verified evidence
- Verified `origin/main` at `19fcf51f7f8d362b9fd25b57bdb842f1c0583546` and GitHub PR #11 `MERGED` state.
- Synchronized `docs/STATUS.md` and `docs/HANDOFFS.md` for post-merge closeout: RH-P5 planning (T0) is complete and merged; `PRODUCT.md` and `ARCHITECTURE.md` remain unchanged pending owner decision **D0**.

### Remaining
- Owner review and answers to **D0–D15** before authorizing **RH-P5-T1**.
- All `cloud/` implementation, Cloudflare resources (Workers/D1/KV/R2), OAuth client creation, UI design-gate opening (`D7`), deployment and production changes remain **blocked** until separately approved.

## Handoff: RH-P5-D0-D6

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (owner decisions D0–D6 & proposed scope amendments)
- **From:** Antigravity (RH-P5 decisions D0–D6 documentation)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `docs/rh-p5-decisions-d0-d6`
- **Merged baseline:** `main@bab22382194da309c051d27444faf2384ce0ecb5` (PR #12 squash merge)

### Verified evidence
- Recorded owner-approved core local-first architecture decisions **D0–D6** in `docs/RH-P5-PLATFORM-PLAN.md` (§0, §14): local-first and offline functionality preserved; hosted index strictly opt-in and future-only; 4-Worker privilege separation; GitHub numeric-id allowlist; reader-only ChatGPT; per-project Ed25519 publisher keys; digest-only sync; separate `cloud/` lockfile.
- Staged proposed `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` scope amendments in `docs/RH-P5-PLATFORM-PLAN.md` §15 for review without modifying `PRODUCT.md` or `ARCHITECTURE.md`.
- Kept **D7–D15** explicitly **PENDING**; updated `docs/STATUS.md` and appended this handoff.

### Remaining
- Independent COMMENT-only review of this Draft PR and owner merge approval.
- Owner decisions **D7–D15** and separate approval before **RH-P5-T1** implementation, `cloud/` creation, Cloudflare resource creation, or deployment.

## Handoff: RH-P5-D0-D6-R1

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (PR #13 COMMENT-only audit remediation)
- **From:** Antigravity (DOC-13-01 & DOC-13-02 documentation fixes)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `docs/rh-p5-decisions-d0-d6` (Draft PR #13)
- **Input HEAD:** `be76fec8fccfc6c147bb8b153b2b2603f879625a`

### Verified evidence
- **DOC-13-01:** Updated `docs/STATUS.md` to clarify that **D0–D6 are approved architecture decisions**, while **D7–D15 remain pending**, and preserved all D1/Miniflare verification limitations.
- **DOC-13-02:** Updated `docs/RH-P5-PLATFORM-PLAN.md` §14 D1 description to OAuth, MCP reader, ingestion, and data Worker, consistent with §2.
- No architecture decisions, implementation, or infrastructure modified.

### Remaining
- Independent COMMENT-only re-audit on the new exact HEAD.
- Keep PR #13 Draft; do not merge or deploy.

## Handoff: RH-LOCAL-ONLY-1

- **Task:** `tasks/RH-P5-remote-mcp-platform.md` (owner decision: **LOCAL-ONLY FOR NOW**, 2026-11-23)
- **From:** Antigravity (local-only direction & RH-P5 hold documentation)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `docs/local-only-direction`
- **Merged baseline:** `main@45865fe6c3f0c5bce128fe9d7599fa9fc015930c` (PR #13 squash merge)

### Verified evidence
- Updated `docs/STATUS.md` to reflect the active **LOCAL-ONLY FOR NOW** direction (2026-11-23) and placed the hosted RH-P5 roadmap **ON HOLD** (`RH-P5-T1` through `T8` not executed).
- Added a dated `ON HOLD (2026-11-23)` supersession note to `docs/RH-P5-PLATFORM-PLAN.md` while preserving its approved D0–D6 architecture proposals as historical reference.
- Preserved `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` local-only restrictions untouched.
- Proposed a focused local-only improvement roadmap in `docs/LOCAL-ONLY-ROADMAP.md` covering CLI reliability, agent handoffs, local stdio MCP, testing, and installation.

### Remaining
- Independent COMMENT-only review of this Draft PR and owner merge approval.
- Owner selection and task-contract approval before implementing any item in `docs/LOCAL-ONLY-ROADMAP.md`.
- Keep `RH-P5-T1`–`T8`, `cloud/`, Cloudflare resources, and deployment on hold / blocked.

## Handoff: RH-LOCAL-T1-1

- **Task:** `tasks/RH-LOCAL-T1-environment-doctor.md` (RH-LOCAL-T1: CLI Reliability & Environment Doctor)
- **From:** Antigravity (implementation & local validation)
- **To:** independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t1-doctor`
- **Base:** `main@1d89213c3c8ab8a7bef205ab8696e0b5659d97e3` (PR #14 squash merge)

### Verified evidence
- Implemented strictly read-only `relatehandoff doctor` (`src/doctor.mjs`, wired in `src/cli.mjs` and `package.json`), checking Node.js compatibility, environment PATH/vars, Git CLI and repository/worktree health, Relate CLI v1.0.1 availability and Linux `GLIBC` mismatch detection, and local Relate store read-only access (including read-only MCP `initialize`/`tools/list` probe).
- Added deterministic tests in `test/doctor.test.mjs` (8 tests) covering healthy PASS, unsupported Node versions, missing executables, Linux `GLIBC_2.39` errors, inaccessible stores, malformed environments, Windows `Path`/`relate.exe`, secret redaction, and real read-only Git/store preservation.
- Added `tasks/RH-LOCAL-T1-environment-doctor.md` and allowlisted it in `scripts/test_bootstrap.py`.

### Remaining
- Independent COMMENT-only audit and owner merge approval on the Draft PR.
- Keep `RH-P5-T1`–`T8`, `cloud/`, Cloudflare resources, and deployment on hold / blocked.

## Handoff: RH-LOCAL-T1-2

- **Task:** `tasks/RH-LOCAL-T1-environment-doctor.md` (PR #15 audit remediation RH15-01…RH15-04)
- **From:** Antigravity (audit remediation & regression tests)
- **To:** independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t1-doctor` (Draft PR #15)
- **Input HEAD:** `68c80ed1b643c34a1dcff59ff957a32a5a10db76`

### Verified evidence
- **RH15-01 (`src/doctor.mjs`):** Validated both MCP `initialize` (`id: 1`) and `tools/list` (`id: 2`, `Array.isArray(result.tools)`) JSON-RPC responses; rejects missing, malformed, partial, or error responses.
- **RH15-02 (`src/doctor.mjs`):** Passed `--no-optional-locks` to all repo `git` inspection calls (`rev-parse`, `status --porcelain`, `remote`, `config`) so `.git/index` is never refreshed or written; added `.git/index` SHA-256 integrity regression test.
- **RH15-03 (`src/doctor.mjs`):** Expanded `sanitizeDiagnosticText` (redacting `Authorization:`, `?token=`, `access_token=`, `secret=`, `password=`, `api_key=`, `ghp_`, `sk-`, `Bearer`, `Basic`, URL userinfo) and applied sanitization to all config-derived repo identities, paths, errors, and JSON/text check outputs.
- **RH15-04 (`src/cli.mjs`):** Returned exit code `2` for invalid CLI usage (`CliUsageError`) and unsupported `doctor` flags, while retaining exit code `1` for failed health checks.
- Added focused negative/regression tests in `test/doctor.test.mjs` for `RH15-01` through `RH15-04`.

### Remaining
- Independent COMMENT-only re-audit on the new exact HEAD.
- Keep PR #15 Draft and hosted RH-P5 (`RH-P5-T1`–`T8`) on hold / blocked.

## Handoff: RH-LOCAL-T1-3

- **Task:** `tasks/RH-LOCAL-T1-environment-doctor.md` (PR #15 follow-up remediation RH15-03 & RH15-05)
- **From:** Antigravity (strict repo-id validation & Git fail-closed remediation)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t1-doctor` (Draft PR #15)
- **Input HEAD:** `e6ab50280f2ec9f7e3975d3f02b0f57ec1f11011`

### Verified evidence
- **RH15-03 (`src/doctor.mjs`):** Strictly validated repository identities against canonical `owner/repo` (`CANONICAL_REPO_ID_RE`, no `..`); non-canonical or credential-bearing values (including SSH URLs) are suppressed and reported as `WARN` without echoing raw config strings in text or JSON output. Added SSH URL regression test in `test/doctor.test.mjs`.
- **RH15-05 (`src/doctor.mjs`):** Failed closed (`FAIL`, exit `1`) whenever any Git inspection command (`rev-parse --show-toplevel`, `rev-parse HEAD`, `rev-parse --abbrev-ref HEAD`, `status --porcelain`) returns an error, signal, or nonzero exit status. Added `git status --porcelain` exit-128 regression test with a valid `HEAD`.
- Preserved `RH15-01`, `RH15-02`, and `RH15-04` fixes and existing `record`/`resume` behavior.

### Remaining
- Focused independent COMMENT-only re-audit on the new exact HEAD.
- Keep PR #15 Draft and hosted RH-P5 (`RH-P5-T1`–`T8`) on hold / blocked.

## Handoff: RH-LOCAL-T2A-1

- **Task:** `tasks/RH-LOCAL-T2A-resume-output.md` (RH-LOCAL-T2A: Deterministic Multi-Agent Resume Output)
- **From:** Antigravity (implementation & local validation)
- **To:** independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t2a-resume-output`
- **Base:** `main@c9e3a46db8723928b37c2d639122934541ee7fcc` (PR #15 squash merge)

### Verified evidence
- Added `src/resume_format.mjs` (`canonicalizeResumeResult`, `formatResumeMarkdown`, `escapeMarkdownText`, `stripUnsafeControlChars`, `compareCodeUnits`) and wired deterministic ordering into `src/mcp_client.mjs` and `--format json|markdown` (default `json`, exit `2` on invalid `--format`) into `src/cli.mjs`.
- Preserved default JSON output, exact freshness/authenticity semantics (never relabels `SELF_ASSERTED`/unsigned evidence as `VERIFIED`), read-only MCP access, parameterized queries, and 100-row detail bounds.
- Added focused tests in `test/resume_output.test.mjs` covering JSON compatibility, deterministic ordering, Markdown escaping & ANSI stripping, stale HEADs, missing handoffs, authenticity statuses, 100-row bounds, invalid `--format` exit 2, and real Relate v1.0.1 `example-store` integration.

### Remaining
- Independent COMMENT-only audit and owner merge approval on the Draft PR.
- Keep `RH-P5-T1`–`T8`, `cloud/`, Cloudflare resources, and deployment on hold / blocked.

## Handoff: RH-LOCAL-T2A-2

- **Task:** `tasks/RH-LOCAL-T2A-resume-output.md` (PR #16 audit remediation RH16-01)
- **From:** Antigravity (authenticityLimitationNote alignment & regression tests)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t2a-resume-output` (Draft PR #16)
- **Input HEAD:** `d9e2fe2d8ef70a8a6fa921579296ee2e0b9564b3`

### Verified evidence
- **RH16-01 (`src/resume_format.mjs`):** Updated `authenticityLimitationNote` to handle the exact `executionAuthenticity` enum values returned by `evaluateFreshness` (`AUTHENTICATED`, `FAILED`, `UNVERIFIED`, `SELF_ASSERTED`, `MISSING`), accurately preserving unsigned-store and remote-PR limitations on `AUTHENTICATED` and explicit `BLOCKED`/failure messaging on `FAILED`.
- Added regression tests in `test/resume_output.test.mjs` using actual `evaluateFreshness` outcomes for both `AUTHENTICATED` and `FAILED`.
- Preserved all existing freshness semantics, JSON compatibility, deterministic ordering, Markdown safety, and read-only MCP behavior.

### Remaining
- Focused independent COMMENT-only re-audit on the new exact HEAD.
- Keep PR #16 Draft and hosted RH-P5 (`RH-P5-T1`–`T8`) on hold / blocked.

## Handoff: RH-LOCAL-T2B-1

- **Task:** `tasks/RH-LOCAL-T2B-handoff-lifecycle.md` (RH-LOCAL-T2B: Handoff Lifecycle)
- **From:** Antigravity (implementation & local validation)
- **To:** independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t2b-lifecycle`
- **Base:** `main@176e5c2005bf63583c4f33a918bd12e5d6005fb2` (PR #16 squash merge)

### Verified evidence
- Added fail-closed validation of `supersedesHandoffId` and `supersessionReason` in `src/schema.mjs` (rejects self-supersession and orphan reasons).
- Added immutable `[:SUPERSEDES]` edge creation in `src/recorder.mjs` (verifies same-repo/same-task target existence, rejects double supersession with `HandoffConflictError`, never mutates prior nodes, and preserves pre-T2B fingerprints).
- Updated `src/mcp_client.mjs` (`resumeTaskViaReadOnlyMcp` defaults to latest `ACTIVE` handoff and accepts `handoffId`, plus new `listHandoffsViaReadOnlyMcp` with `--task`, `--status`, `--branch`, `--agent`, `--limit`, strict repo isolation, and 100-row bounds) and `src/resume_format.mjs` (`formatHandoffListMarkdown` and lifecycle display in `formatResumeMarkdown`).
- Wired `record --supersedes / --supersession-reason`, `resume --handoff`, and `list` into `src/cli.mjs` with exit code `2` for invalid usage.
- Added `test/lifecycle.test.mjs` covering real Relate v1.0.1 supersession chains, conflict/error rejections, filtering, repo isolation, Markdown escaping, invalid CLI usage, and fake overflow/write-tool rejection.

### Remaining
- Independent COMMENT-only audit and owner merge approval on the Draft PR before proceeding to `RH-LOCAL-T3`.
- Keep `RH-P5-T1`–`T8`, `cloud/`, Cloudflare resources, and deployment on hold / blocked.

## Handoff: RH-LOCAL-T2B-2

- **Task:** `tasks/RH-LOCAL-T2B-handoff-lifecycle.md` (PR #17 audit remediation RH17-01 & RH17-02)
- **From:** Antigravity (CLI conflict-error redaction & selector exit-code remediation)
- **To:** focused independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `feat/rh-local-t2b-lifecycle` (Draft PR #17)
- **Input HEAD:** `8b8f4d26e29f1e872a1bfda9b92762508c350bfb`

### Verified evidence
- **RH17-01 (`src/cli.mjs`):** Replaced `--supersedes` conflict error with a generic field-level conflict message (`Supersession conflict: CLI --supersedes differs from payload supersedesHandoffId`) that never prints raw user-controlled values before payload secret validation; added negative test with fictional `ghp_` tokens in `test/lifecycle.test.mjs`.
- **RH17-02 (`src/cli.mjs`):** Validated `resume --handoff` (`ID_RE`), `list --task` (`ID_RE`), and non-empty `list --branch` / `list --agent` with `CliUsageError` (exit code `2`) while retaining library-side validation in `src/mcp_client.mjs` and exit code `1` for actual repository/MCP retrieval failures; added regression tests in `test/lifecycle.test.mjs`.
- Preserved all T2B lifecycle behavior (immutable supersession, idempotency, repository isolation, JSON compatibility, Markdown safety, and read-only MCP).

### Remaining
- Focused independent COMMENT-only re-audit on the new exact HEAD.
- Keep PR #17 Draft and hosted RH-P5 (`RH-P5-T1`–`T8`) on hold / blocked.

## Handoff: RH-LOCAL-T5-1

- **Task:** `tasks/RH-LOCAL-T5-dx-onboarding.md` (RH-LOCAL-T5: Developer Experience & Onboarding)
- **From:** Antigravity (documentation, offline clean-clone verification, and distribution readiness)
- **To:** independent COMMENT-only reviewer and project owner (`mrdzyn`)
- **Branch:** `docs/rh-local-t5-dx-onboarding`
- **Base:** `main@1a77147e3bb237d94ee3d4e4e5f5d5907be55c70` (PR #17 squash merge)

### Verified evidence
- Created bounded task contract `tasks/RH-LOCAL-T5-dx-onboarding.md` and added its allowlist entry to `scripts/test_bootstrap.py` with all fail-closed checks preserved.
- Updated `README.md` (no `src/` edits) to reflect current local-only status and all shipped commands (`doctor`, `record --verify/--supersedes/--supersession-reason`, `resume --format json|markdown --handoff --verify`, `list --task --status --branch --agent --limit --format`), copy-paste multi-agent workflows, Linux `GLIBC_2.36` vs `GLIBC_2.39` source-build guidance, offline clean-clone reproducibility steps, and `docs/AGENT-ORCHESTRATION.md` reference.
- Created `docs/ONBOARDING-AND-DISTRIBUTION.md` covering platform-by-platform installation & troubleshooting (macOS ARM64 verified on this host; native Linux and Windows explicitly marked `UNVERIFIED` on this macOS host), offline clean-clone reproducibility results in `/tmp` (`git clone --local`, `npm ci --offline`, `doctor`, `resume`, `RELATE_REQUIRE_CLI=1 npm test` 42/42 PASS after setting canonical `origin` offline; raw path-based `origin` failure also documented), and distribution/licensing readiness (`Apache-2.0`, `@relate/relate@1.0.1` + Neo4j Labs disclaimer, Relate CLI notices, `koffi@2.16.4` MIT notice, explicit gate against publishing without owner approval).
- Updated `docs/STATUS.md` to point to `docs/rh-local-t5-dx-onboarding` / `tasks/RH-LOCAL-T5-dx-onboarding.md` / `RH-LOCAL-T5-1`.

### Remaining
- Independent COMMENT-only audit and owner merge approval on the RH-LOCAL-T5 Draft PR.
- Native Linux and Windows validation on target OS hosts (`UNVERIFIED` on this macOS host).
- Keep `RH-P5-T1`–`T8`, package publishing, `cloud/`, Cloudflare resources, and deployment on hold / gated on explicit owner approval.

<!-- HANDOFF_ENTRIES_END -->
