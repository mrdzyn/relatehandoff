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
- **To:** Independent reviewer and project owner (for closeout PR review and RH-P3 planning)
- **Branch:** `docs/rh-p2-postmerge-closeout`
- **Audited PR #4 HEAD:** `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`
- **PR #4 squash merge commit (`main`):** `a6bb9bdd562205e5690318272bce8dda0ecf6306` (November 17, 2026 UTC)
- **PR:** Docs-only closeout Draft PR against `main` (no merge)
- **State:** RH-P2 MERGED — DOCS-ONLY CLOSEOUT PENDING REVIEW

### Completed
- Verified PR #4 squash commit `a6bb9bdd562205e5690318272bce8dda0ecf6306` on `origin/main`.
- Reconciled `docs/STATUS.md`, `tasks/RH-P2-real-agent-handoff-followup.md`, `docs/RH-P2-REAL-AGENT-PROOF.md`, and `docs/HANDOFFS.md` without modifying source, tests, fixtures, or historical RH-P0/RH-P1/RH-P2-H1 records.

### Validation & Limits
- PR #4 independent COMMENT-only audit: PASS at `2c7dcef50a6cde26516f415c5879f3749c9dbe2d` (did not independently reproduce real-CLI execution).
- Author-reported exact-HEAD checks at `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`: 15/15 `npm test`, 5/5 `npm run test:security`, `npm run build`, `npm run demo`, and `scripts/validate.py` PASS.
- `RH-P2-CODEX-CLAUDE-1` macOS ARM64 real-agent handoff remains `OWNER-REPORTED`.

### Continuation notes
- Remaining limitations: persistent `relate serve --mcp stdio --read-only` startup snapshot, unsigned local store (`executionAuthenticity: "UNVERIFIED"` without `--verify`), and Linux `GLIBC_2.39` prebuilt binary block on Debian 12 (`GLIBC_2.36`).
- Do not start RH-P3 implementation from this docs-only closeout.

### Next action
Complete independent review and separate owner merge approval for this docs-only closeout Draft PR, then proceed to RH-P3 planning only (no RH-P3 implementation authorized yet).

<!-- HANDOFF_ENTRIES_END -->
