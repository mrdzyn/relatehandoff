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
<!-- MASTER_TEMPLATE_HANDOFFS_START -->
## Handoff: P7.0-C1

- **Task / phase:** `tasks/P7.0-repository-handoffs.md`
- **From:** ChatGPT / implementation agent
- **To:** independent reviewer
- **Branch:** `feat/repository-handoffs`
- **Implementation head:** `0d1ba3192f9eacfbcef79dde9ebba8ede40e7372`
- **PR:** #8
- **State:** READY FOR REVIEW

### Completed
- Added canonical repository-backed handoff policy/log and active-handoff startup/continuation behavior.
- Added HANDOFFS to core/template validation and integrated greenfield/brownfield adoption rules.

### Validation
- Validator/self-test changes are included and scoped to the handoff core-file requirement.
- Required CI: pending on final PR head.

### Continuation notes
- `docs/HANDOFFS.md` is the sole detailed handoff-policy source; other files use concise pointers.
- Do not merge; exact-head independent audit is still required.

### Next action
Confirm Project Baseline and Template Integrity at the final PR head, then independently audit PR #8.

## Handoff: P7.0-C2

- **Task / phase:** `tasks/P7.0-repository-handoffs.md`
- **From:** ChatGPT / implementation agent
- **To:** independent reviewer
- **Branch:** `feat/repository-handoffs`
- **Implementation head:** `fc28f1cebdc2d67b5ef4f40cdf166ab1a9bf8920`
- **PR:** #8
- **State:** READY FOR REVIEW

### Completed
- Added the repository-backed handoff protocol and integrated it into startup, task completion, validation, and project adoption.
- Added generated-child protection so inherited master active-handoff state is ignored/cleared during greenfield bootstrap.

### Validation
- Project Baseline and Template Integrity passed before the final bootstrap-safety refinement; final-head CI must be rechecked.
- Required CI: pending on the current PR head.

### Continuation notes
- `docs/HANDOFFS.md` is the sole detailed handoff-policy source.
- Review should specifically check startup context size, generated-child cleanup, STATUS/HANDOFFS separation, and stale/concurrent handoff behavior.

### Next action
Confirm both required CI workflows at the current PR head, then independently audit PR #8.

## Handoff: P7.0-C3

- **Task / phase:** `tasks/P7.0-repository-handoffs.md`
- **From:** ChatGPT / implementation agent
- **To:** independent reviewer
- **Branch:** `feat/repository-handoffs`
- **Implementation head:** `bcbb7c0b2d7e16eb8f5f61b6aabd720e8b71490e`
- **PR:** #8
- **State:** READY FOR REVIEW

### Completed
- Added explicit master-template handoff markers so child cleanup can be validated without blocking legitimate project handoffs.
- Project Baseline now rejects inherited master handoff state; regression coverage proves project-specific handoffs remain valid after cleanup.

### Validation
- Targeted validator/self-test coverage updated for inherited-master vs project-handoff behavior.
- Required CI: pending on the current PR head.

### Continuation notes
- Two Codex P2 review threads were identified; the inherited-handoff cleanup finding is remediated in this implementation head, and the earlier missing-active-handoff finding is already superseded by C2/C3.
- Do not merge until final-head CI and independent audit are complete.

### Next action
Confirm required CI at the current PR head, resolve the addressed review threads, then independently audit PR #8.

## Handoff: P7.0-C4

- **Task / phase:** `tasks/P7.0-repository-handoffs.md`
- **From:** ChatGPT / implementation agent
- **To:** independent reviewer
- **Branch:** `feat/repository-handoffs`
- **Implementation head:** `c33b2d328059213db9a42f7cc91fe326eee7b674`
- **PR:** #8
- **State:** READY FOR RE-AUDIT

### Completed
- Restored the explicit owner-approval merge gate in `docs/STATUS.md`.
- Added partial-marker regression coverage so a child with only one inherited master HANDOFFS marker still fails closed.

### Validation
- Targeted self-test coverage updated for the partial-marker case.
- Required CI: pending on the current PR head.

### Continuation notes
- Claude's independent audit found only two MINOR items at `d28b2fe4416d4ea0fcbb57525698fb71875f7d7b`; both are addressed in implementation head `c33b2d3`.
- No other production/process behavior was changed.

### Next action
Confirm Project Baseline and Template Integrity at the current PR head, then perform a targeted re-audit of the two MINOR fixes.

## Handoff: P8.0-SPEC1

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** ChatGPT / specification author
- **To:** project owner + independent reviewer
- **Branch:** `phase/p8-reusable-cicd-foundation`
- **Implementation head:** `687a6e56de3c61b5f8716d661ce245218148920e`
- **PR:** #10
- **State:** READY FOR SPEC REVIEW

### Completed
- Starting SHA: `cc9b6c78252d80ddff2a789481f1fe23175aa1e0`.
- Defined a bounded P8.0 specification with no executable CI/CD implementation.
- Proposed a narrowly combined architecture: deterministic validation scripts + one small same-repository reusable `workflow_call` foundation + explicit project-owned stack jobs.
- Kept framework/toolchain selection out of `config/project-profile.json` for P8.0 and preserved Template Integrity as master-only.

### Validation
- Current `ci.yml`, `template-integrity.yml`, validator/self-tests, testing/release/repository-setup policy, and referenced repository paths inspected.
- GitHub reusable workflow, permission, fork-PR secret, OIDC `id-token: write`, and Environment protection/secret behavior checked against current official GitHub documentation.
- No validated-inventory or executable workflow/validator behavior changed, so no extra local validator run was required for the specification-only diff.
- Required CI: Project Baseline CI and Template Integrity pending on final PR head.
- Production impact: None.

### Continuation notes
- Unresolved implementation details: final reusable-workflow filename, final stable required-check names, and whether a future central cross-repository workflow repository is later justified.
- Provider-specific deployment, release signing, marketplace submission, full secret scanning, and production infrastructure remain out of P8.0 scope.
- Do not implement workflows or merge this PR until the P8.0 task contract is independently reviewed and owner-approved.

### Next action
Owner / independent review of the P8.0 task contract. Resolve specification findings first; implementation begins only after the specification is approved and merged.

## Handoff: P8.0-SPEC2

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** ChatGPT / specification author
- **To:** independent reviewer
- **Branch:** `phase/p8-reusable-cicd-foundation`
- **Implementation head:** `1c0a1ec34752083612365581566c84b702a019b7`
- **PR:** #10
- **State:** READY FOR TARGETED RE-AUDIT

### Completed
- Resolved MINOR-1 by formally documenting `<TASK-OR-PHASE-ID>-SPEC<n>` for master-template specification-stage handoffs while retaining the standard `-C<n>` convention for normal continuation handoffs.
- Resolved MINOR-2 by adding `AGENTS.md` to the future P8.0 implementation scope as pointer-only, with an explicit prohibition on CI/CD policy restatement there.
- Resolved MINOR-3 by marking the no-`PROJECT-MEMORY` change documentation-impact item as confirmed rather than leaving it visually pending.

### Validation
- Diff remains specification/documentation-only; no workflow, script, config, secret, deployment, signing, or production behavior changed.
- Required CI: must be rechecked at the final PR head after this handoff/status bookkeeping.
- Production impact: None.

### Continuation notes
- The substantive P8.0 architecture is unchanged from `P8.0-SPEC1`.
- Targeted re-audit only needs to verify the three MINOR remediations and confirm no regression/scope expansion.
- Do not begin P8.0 implementation and do not merge PR #10 until the specification gate is clean and the project owner explicitly approves merge.

### Next action
Confirm final-head Project Baseline CI and Template Integrity, then perform a targeted re-audit of the three MINOR fixes.

## Handoff: P8.0-C1

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-ci-availability-fallback`
- **Implementation head:** `7fc67ed1ed38bb7e31b603da8f97518e6392deb3`
- **PR:** #12
- **State:** READY FOR REVIEW

### Completed
- Added a bounded hosted-CI availability/quota exception that is explicitly distinct from genuine failing CI.
- Added the canonical equivalent-validation + independent-review + owner/admin PR-only ruleset bypass process.
- Added economical trigger guidance to avoid duplicate full feature-branch push + pull-request runs by default.
- Added optional self-hosted-runner fallback guidance with isolation/security caveats.
- Confirmed the live template `Protect Main` ruleset still requires Project baseline + Template integrity and currently has no bypass actors; live ruleset mutation is external to this repository PR.

### Validation
- Current master `.github/workflows/ci.yml` inspected: already uses `pull_request` plus `push` to `main`.
- Current GitHub ruleset inspected: required checks present, bypass list empty.
- Current GitHub documentation checked for hosted Actions quota blocking without a payment method, free self-hosted runner usage, PR-only ruleset bypass, and skipped-required-check behavior.
- No executable workflow/script/config/deployment/signing/secret behavior changed.
- Required CI: pending / may be unavailable if account hosted-runner quota is exhausted.

### Continuation notes
- Audit the unavailable-CI vs failed-CI boundary carefully; policy must never excuse a real failing check.
- Audit whether the proposed PR-only bypass preserves the PR/review/audit trail without granting routine direct-push authority.
- The actual GitHub `Protect Main` bypass actor still must be configured manually because the connected GitHub tool exposes ruleset reads but not ruleset mutation.
- Do not merge PR #12 without explicit project-owner approval.

### Next action
Independently audit PR #12 at the exact final head, focusing on policy consistency, break-glass safety, duplicate-run guidance, and self-hosted-runner caveats.

## Handoff: P8.0-C2

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-ci-availability-fallback`
- **Implementation head:** `bbb4601bf73460f30c02d00f3382d20e621ee47d`
- **PR:** #12
- **State:** READY FOR TARGETED RE-AUDIT

### Completed
- Resolved MAJOR-1 by making `docs/REPOSITORY-SETUP.md` the sole detailed source for CI-unavailability, PR-only bypass, trigger-economy, and self-hosted-runner policy.
- Reduced `docs/TESTING.md` to a short invariant summary plus canonical pointer.
- Reduced the P8 task's hosted-CI section to task-specific requirements plus canonical pointer; removed the duplicated trigger YAML/rule list.
- Resolved MINOR-2 by adding an explicit public-repository warning for self-hosted runners and requiring a deliberate reviewed containment model if used there.

### Validation
- Verified the detailed rule set now exists only in `docs/REPOSITORY-SETUP.md`; TESTING/task carry concise pointers instead.
- No executable workflow, script, config, secret, signing, deployment, or production behavior changed.
- Required hosted CI remains unavailable at the prior exact head before runner assignment; do not treat that as executable-check failure.

### Continuation notes
- Targeted re-audit should check only MAJOR-1 policy deduplication and MINOR-2 public-repo self-hosted-runner caveat, plus confirm no policy meaning was lost.
- The live GitHub ruleset bypass still requires manual repository-admin configuration and is not changed by this PR.
- Do not merge PR #12 without explicit project-owner approval.

### Next action
Perform a targeted re-audit of the two audit remediations at the current final PR head and confirm whether the gate is clean.

## Handoff: P8.0-C3

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** Claude / independent reviewer
- **To:** project owner
- **Branch:** `phase/p8-ci-availability-fallback`
- **Implementation head:** `39f31d8657e08101fdc4050ec78501e89089c9a3`
- **PR:** #12
- **State:** READY FOR OWNER APPROVAL

### Completed
- Targeted re-audit confirmed MAJOR-1 policy deduplication is fully resolved with no policy meaning lost.
- Targeted re-audit confirmed MINOR-2 public-repository self-hosted-runner caveat is resolved.
- Re-audit found no remaining findings.

### Validation
- Independent targeted re-audit: PASS / no findings.
- Required hosted CI at the audited head: unavailable before runner assignment (`runner_id: 0`, `steps: []`) for both required workflows; no executable repository check ran or failed.
- Diff remains limited to documentation/task/status/handoff files; no workflow, script, config, secret, signing, deployment, or production behavior changed.

### Continuation notes
- The live `Protect Main` ruleset still requires manual repository-admin configuration for a pull-request-only bypass actor; this GitHub connector cannot mutate rulesets.
- The break-glass path is only for externally unavailable CI and must never override a genuine executable failure.
- Do not merge PR #12 without explicit project-owner approval.

### Next action
Project owner configures the one-time PR-only ruleset bypass, then explicitly approves merge of PR #12.

## Handoff: P8.0-C4

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md`
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-ci-availability-fallback`
- **Implementation head:** `eb101117230cc09e8c00f26de5354349cb1f5c9c`
- **PR:** #12
- **State:** READY FOR TARGETED RE-AUDIT

### Completed
- Addressed Codex P1 by making equivalent required validation a mandatory prerequisite for the CI-unavailable bypass; if equivalent validation cannot run, bypass is prohibited.
- Addressed Codex P2 by binding equivalent validation and independent review to the exact PR head SHA and requiring both to be repeated after any head change.
- Updated the suggested PR evidence record to include the validated SHA and explicit revalidation rule.

### Validation
- Policy text inspected against both unresolved review findings; both corrections are present.
- No workflow, script, config, secret, signing, deployment, or production behavior changed.
- Hosted GitHub Actions remains unavailable before runner assignment, so required hosted checks cannot provide executable validation.

### Continuation notes
- The branch must remain unchanged after this bookkeeping commit sequence until targeted re-audit completes, otherwise the new exact-head rule requires another validation/review cycle.
- The live `Protect Main` ruleset still has no bypass actor configured.
- Equivalent required validation for the final PR head is mandatory before any CI-unavailable bypass merge.
- Do not merge until targeted exact-head re-audit and equivalent validation are complete.

### Next action
Perform targeted re-audit of the mandatory-equivalent-validation and exact-head-binding fixes on the final branch head, then record equivalent required validation for that same SHA before merge.

## Handoff: P8.0-C5

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md` — M1
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-reusable-cicd-implementation`
- **Implementation head:** `0295d4de0c1726f7e1c3cc69c20620243dc4e91c`
- **PR:** #14
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Added `.github/workflows/common-validation.yml` as the same-repository `workflow_call` baseline.
- Converted `.github/workflows/ci.yml` into the thin child-project caller with `contents: read`.
- Preserved the pre-M1 baseline steps exactly inside the reusable workflow.
- Added the reusable workflow to the master-only Template Integrity required-file inventory.
- Kept stack-specific validation, secrets, OIDC, release, deployment, and signing outside M1.

### Validation
- GitHub parsed and invoked the caller/called-workflow relationship on PR #14.
- Emitted job context is `Project baseline / Common validation`.
- Project Baseline and Template Integrity jobs both stopped before runner assignment (`runner_id: 0`, `steps: []`), so no repository step executed.
- Equivalent validation confirmed the reusable baseline step block is identical to the pre-M1 baseline block, Template Integrity has only the expected inventory addition, no tracked local environment files exist, profile remains valid in template mode, and validator/self-test code is unchanged.

### Continuation notes
- Audit the **current PR #14 head**, not only the recorded implementation head; the only later change should be this handoff entry.
- The live ruleset still requires `Project baseline`, while M1 emits `Project baseline / Common validation`. Coordinate that required-check rename before/at merge and retain `Template integrity`.
- The live ruleset's repository-admin bypass remains **pull requests only** and must not be broadened.
- Do not expand PR #14 into M2.
- Do not merge without explicit project-owner approval.

### Next action
Perform independent exact-head audit of PR #14 against the P8.0 M1 contract, with particular attention to reusable-workflow permissions, caller/called semantics, preserved baseline behavior, generated-child compatibility assumptions, and the required-check rename dependency.

## Handoff: P8.0-C6

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md` — M2
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-m2-extension-contract`
- **Implementation head:** `dab0fbe1ab3ac01a5c4946fdcf22b5a38a9a3649`
- **PR:** #16
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Documented the project-owned stack CI extension contract in `docs/REPOSITORY-SETUP.md`.
- Defined required PR, optional informational, release-only, and manual/human gate classes in `docs/TESTING.md`.
- Documented ordinary PR CI vs privileged release/deployment trust boundaries, secrets, environments, and OIDC in `docs/RELEASE.md`.
- Added concise README discoverability for the reusable baseline and canonical CI/CD guidance.
- Kept executable workflows, validators, project profile, deployment automation, and production settings unchanged.

### Validation
- Changed paths are limited to approved M2 documentation/task/status/handoff scope.
- Required-check terminology uses the live `Project baseline / Common validation` context.
- The reusable baseline remains stack-neutral; stack jobs are explicit siblings owned by each project.
- No production/deployment secrets or `id-token: write` were added to ordinary PR CI.
- The M1 greenfield keep-list MINOR remains deliberately unfixed in this M2 branch and is still assigned to M3.

### Continuation notes
- Audit the **current PR #16 head**, not only the recorded implementation head; the only later change should be this handoff entry.
- Check for contradictory or duplicated policy across `docs/REPOSITORY-SETUP.md`, `docs/TESTING.md`, `docs/RELEASE.md`, README, and the P8 task.
- Do not expand PR #16 into M3 greenfield/brownfield integration work.
- Hosted GitHub Actions may remain unavailable; distinguish pre-runner failure from executable failure before applying the documented fallback.
- Do not merge without explicit project-owner approval.

### Next action
Perform independent exact-head audit of PR #16 against the P8.0 M2 contract, with particular attention to stack-extension ownership, gate-class semantics, least-privilege/secret/OIDC boundaries, release separation, and preservation of the M3 scope boundary.

## Handoff: P8.0-C7

- **Task / phase:** `tasks/P8.0-reusable-cicd-pipeline-foundation.md` — M2 remediation
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-m2-extension-contract`
- **Implementation head:** `c687dd296cd69a44909d1135fe279acb1d129e5f`
- **PR:** #16
- **State:** READY FOR TARGETED EXACT-HEAD RE-AUDIT

### Completed
- Remediated MAJOR-1: `docs/RELEASE.md` now forbids privileged `pull_request_target` or chained privileged `workflow_run` execution of untrusted PR code with secrets/write tokens, and states `main` CI does not authorize production release.
- Remediated MINOR-2: `docs/REPOSITORY-SETUP.md` now uses the exact `Project baseline / Common validation` emitted context and distinguishes merge-safety artifact checks from release-only artifact verification.
- Remediated MINOR-3: deduplicated project-owned PR credentials/OIDC guidance in repository setup in favor of the canonical `docs/RELEASE.md` pointer.
- Remediated MINOR-4: `docs/TESTING.md` says informational checks cannot substitute for required evidence and requires owner approval plus coordinated ruleset change to demote/retire a required check.
- STATUS now reflects the earlier PARTIAL audit and targeted re-audit requirement; noted the existing Codex STATUS review thread was already addressed by the prior updated Next actions.

### Validation
- Reviewed the diff against audited head `200c2f44def02891df6312debe8b82ddc688430d`: substantive fixes touch only the three docs above; STATUS and this handoff are bookkeeping.
- The two required GitHub-hosted workflows both executed and passed on substantive remediation head `8c1fd148bff45f0047ec96ad301394fd3da00b87`; no hosted-CI bypass needed.
- No executable workflow, validator, `config/project-profile.json`, deployment, or production setting changed.

### Continuation notes
- Review the **current PR #16 head** after this handoff, not merely the recorded implementation head; repeat exact-head CI evidence for the final SHA.
- Target only the four prior findings and cross-doc consistency. Do not expand into P8.0 M3 greenfield/brownfield integration.
- The original M1 MINOR (greenfield keep-list missing `.github/workflows/common-validation.yml`) remains scheduled for M3.
- Do not merge without explicit project-owner approval.

### Next action
Perform a targeted independent exact-head re-audit of PR #16, verify required GitHub-hosted checks for that head, and report PASS/PARTIAL/FAIL with any remaining findings.

## Handoff: P8.0-C8

- **Task:** `tasks/P8.0-ci-run-economy.md` — E1 trigger economy
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-ci-run-economy-e1`
- **Implementation head:** `594c04b48b632f643c74b3f76ef4061f3b3b284e`
- **PR:** #18
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- In `.github/workflows/ci.yml` and `.github/workflows/template-integrity.yml`, retained `pull_request` but replaced `push: main` with explicit manual `workflow_dispatch`.
- Both workflows preserve job names, read-only permissions, pinned checkout actions, concurrency policy, full step bodies, and master-only Template Integrity guard.
- `docs/REPOSITORY-SETUP.md` now documents the PR-only default, its exact post-merge/release-candidate trade-off, and brownfield migration limitations.
- Added the bounded E1 task contract and updated STATUS; deferred E2 Template Integrity consolidation/required-check migration and P8.0 M3 generated/brownfield integration.

### Validation
- Exact base commit: `f95d969b8deffdff9bb1ad4cb359822aac7d05cd`.
- Comparison to base proves each workflow's sole text change is the event trigger; common-validation remains unchanged.
- PR #18 automatically emitted and passed both required hosted checks on pre-handoff implementation commit `3a47f0490c8d54591abbba3351b8c907dcd02ef6`. Recheck final exact head after this append.
- No required-check renames, live ruleset changes, credentials, deployment, tests, or release behavior changes.

### Continuation
- Audit the **current PR #18 head** (this handoff append changes the commit), not only the implementation head.
- Verify that required PR statuses are still emitted and pass with real runners.
- Assess whether the removal of automatic post-merge validation is correctly caveated and suitable as a default for future child repositories.
- Do not expand E1 into E2 required-check cutover or M3 pruning.
- Do not merge without explicit owner approval.

### Next action
Perform independent exact-head review with PASS/PARTIAL/FAIL, severity-ranked findings, and merge recommendation.

## Handoff: P8.0-C9

- **Task / phase:** `tasks/P8.0-ci-run-economy-e2.md` — E2a master-integrity shadow
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `phase/p8-ci-run-economy-e2a`
- **Implementation head:** `1fb505d6698f7809fe36b6c203b1b8d82b0135a5`
- **PR:** #19
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Extracted the original inline master inventory/template-mode/design-token check into `scripts/validate_master_template.py`, adding the new script to its own inventory.
- Added two exact-repository-guarded master-only steps (inventory and capability self-test) to the existing reusable common runner; universal baseline steps remain unchanged.
- Retained required dedicated `Template integrity` job, with identical inventory semantics using the same script and its existing capability self-test.
- Documented owner-controlled ruleset cutover, separate E2b manual-only workflow change and rollback, and M3 child cleanup.
- No live ruleset mutation, required-check rename, release/production deployment, secrets, or OIDC modifications.

### Targeted validation
- Compared extracted validator source to the previous inline code: identical except addition of the new script to master inventory.
- Verified `common-validation.yml` retains the entire baseline as a prefix and appends only two conditional master-only steps.
- Both workflow triggers, job contexts and repository guards remain present. Ruleset still requires `Template integrity` plus `Project baseline / Common validation`.
- Hosted runs must be independently verified **against current PR #19 head after this one housekeeping commit**, including step execution in both jobs.

### Next action
Perform independent exact-head audit of PR #19. Inspect real runner logs proving master inventory and self-test are executed in the required common runner, and that child repositories skip master-only steps. Do not widen scope to E2b or M3 and do not merge without explicit owner approval.

## Handoff: P8.0-C10

- **Task / phase:** `tasks/P8.0-ci-run-economy-e2b.md` — E2b cutover decision preparation
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `docs/p8-e2b-cutover-prep`
- **Implementation head:** `2e1a17e9b834d101f356177c0a4d982dad31a981`
- **PR:** #20
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Documented the safe rollback order in canonical `docs/REPOSITORY-SETUP.md`: restore PR trigger first, prove that a later PR emits/passes Template Integrity, and only then re-require its check.
- Documented single-check tamper-evidence loss and distinguished enforced GitHub codeowner/approving-review protection from process-only independent audit that the current zero-approval ruleset does **not** enforce.
- Defined required explicit owner choice and approval gates in a dedicated E2b task and aligned the existing E2 cutover plan.
- Closed stale E2a STATUS pointers after its audited PR #19 merged.
- **No live ruleset change, workflow/script edit, check retirement, or deployment.**

### Validation and scope
- Base `main` merge commit `828c4ba717e1303219cd5378fe305086c7921acb`.
- Compare exact PR #20 diff; it must include only `docs/REPOSITORY-SETUP.md`, `docs/STATUS.md`, `docs/HANDOFFS.md` and the two E2 task files.
- Both currently required hosted checks must pass at the final exact head after this handoff.
- Master ruleset ID `23809419` should remain active with `Template integrity` and `Project baseline / Common validation` required.

### Next action
Perform independent exact-head review with severity-ranked findings. Confirm E2b security risk/rollback instructions are unambiguous, do not assume the owner has accepted residual risk, and recommend whether this documentation-only PR is merge-ready.

## Handoff: P8.0-C12

- **Task:** `tasks/P8.0-e2b-option-b-decision.md` — Option B process-only review decision
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent reviewer
- **Branch:** `docs/p8-e2b-option-b-decision`
- **Implementation head:** `03f12d6630b7ec7251d28cb214e6829e9f3901e0`
- **PR:** #22
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Owner selected Option B because no other human GitHub approver is available; Option A PR #21 was closed, not merged.
- Canonical `docs/REPOSITORY-SETUP.md` records conscious residual-risk acceptance: Claude AI audits and human-owner chat merge approvals remain **process-only**, not GitHub-enforced; a privileged actor could skip them. One required baseline job cannot independently detect removal of its own master integrity steps.
- Documented mandatory Grok/ChatGPT implementation and verification, Claude independent **exact-head** review of every PR, ChatGPT GitHub required-check/thread/SHA verification, and new explicit owner approval for every merge.
- Aligned existing E2b plan with Option B and created decision record.
- **No live ruleset, approving-review setting, collaborator, CODEOWNERS, workflow/script or production change.** Required `Template integrity` and `Project baseline / Common validation` both remain active.

### Validation and continuation
- Base main: `df5c7d2c65e2abc6307cdc9fed722fe5b2c2f26a`.
- Verify PR #22 current exact head after this handoff commit and both required hosted CI checks.
- Check only docs/STATUS, docs/HANDOFFS, docs/REPOSITORY-SETUP, and two task docs are changed; no executable/ruleset drift.
- Verify owner selection is **not** mistaken for permission to merge PR #22 or to remove Template Integrity from live ruleset.
- Independently audit risk characterization and mandatory per-PR process at exact head; report PASS/PARTIAL/FAIL and severity-ranked findings.

### Next action
Send exact-head audit to owner. Await explicit owner approval before PR #22 merge. **Separate future authorization is required for ruleset ID `23809419` cutover and later E2b workflow PR.**

## Handoff: P8.0-C13

- **Task / phase:** `tasks/P8.0-e2b-manual-only.md` — E2b redundant PR runner elimination
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent exact-head auditor
- **Branch:** `phase/p8-e2b-manual-only`
- **Implementation head:** `a1e2481919cabf9977f77ba6e710c14d1e1c7801`
- **PR:** #23
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT after hosted CI completion

### Implementation
- GitHub live `Protect Main` ruleset ID `23809419` was modified **by the project owner** outside this PR and verified read-only: active, requires only `Project baseline / Common validation` (integration ID `15368`), same PR-only admin bypass and pull-request rules.
- Removed **only** `on.pull_request` from `.github/workflows/template-integrity.yml`, preserving manual `workflow_dispatch`, original `Template integrity` job, master-repo guard, checkout pin, `contents: read`, and two deterministic master integrity checks.
- Existing `.github/workflows/ci.yml` and `common-validation.yml` unmodified; master inventory and capability self-test still execute under required baseline.
- Updated canonical repository setup and STATUS to reflect owner's Option B decision and completed ruleset cutover; added a bounded E2b task spec.
- No scripts, other workflows, GitHub rules, CODEOWNERS, secrets, releases or deployments changed. PR #23 is OPEN and must not be merged without fresh owner approval.

### Required independent validation
1. Pin the **current final PR head** after this handoff commit; compare to base `41298de96a09ad1eee7655294ca1cb2c038f5323`.
2. Verify exact diff scope and unchanged common runner. Confirm standalone `Template Integrity` keeps manual `workflow_dispatch`, master guard, read-only permissions, inventory and capability self-tests; the only executable change is deleting `pull_request`.
3. Inspect PR #23's GitHub Actions run list for the final SHA: a **single** automatically triggered `Project Baseline CI` runner (event `pull_request`) and **no PR-triggered** `Template Integrity` run. Avoid claiming no runner exists without evidence.
4. Inspect the baseline job steps/logs: original universal checks pass and master inventory reports `Complete master-template inventory is valid.` and self-test reports `Project capability profile self-test matrix passed.`.
5. Re-read live ruleset: active baseline context required only; all other protections unchanged.
6. Report PASS/PARTIAL/FAIL, severity-ranked findings, exact head, CI evidence and merge readiness. No commits, workflow dispatch, ruleset changes, merges, deployments or bypass.

### Human gate
Even on PASS, await explicit project-owner approval for squash merge. Preserve manual fallback and safe trigger-first, verify-second, ruleset-third rollback. P8 M3 remains separate.

## Handoff: P8.0-C14

- **Task / phase:** `tasks/P8.0-e2b-manual-only.md` — remediate PR #23 P8.0-C13 audit MAJOR-1/MINORs
- **From:** ChatGPT / implementation agent
- **To:** Claude / independent exact-head re-auditor
- **Branch:** `phase/p8-e2b-manual-only`
- **Remediation implementation head:** `9bca260cfb0dbcb3d2fa72ccfd70079e89148bd9`
- **PR:** #23
- **State:** READY FOR EXACT-HEAD RE-AUDIT after hosted CI completion

### Earlier review and remediation
- Original PR #23 independent P8.0-C13 audit at `4542a596f9eee4d59c4ed32fdf8517464ed5f677` gave PARTIAL: 0 BLOCKER, 1 MAJOR (canonical setup line 93 instructs requiring a check no longer emitted), 2 MINOR (unresolved Codex threads; stale E2 phase tenses).
- MAJOR fixed in `docs/REPOSITORY-SETUP.md`: the **sole required master PR context is now explicitly `Project baseline / Common validation`**; standalone `Template integrity` is manual-only. Restore its required status **only after** PR-trigger restoration, verification on a subsequent real PR, and separate owner approval.
- E2a/cutover history rewritten in past tense; E2b PR #23 is accurately marked awaiting audit/merge; Option A identified not selected; Option B's process-only risk acceptance preserved.
- `docs/STATUS.md` records the remediation/audit state and points to this new handoff. Recheck and resolve the two Codex threads once the changes are verified.
- **No additional executable changes beyond the original removal of `on.pull_request` from `.github/workflows/template-integrity.yml`**; common baseline, validator scripts and GitHub live rulesets remain untouched.

### Mandatory independent re-audit
1. Verify current PR head is the final exact SHA, with `9bca260cfb0dbcb3d2fa72ccfd70079e89148bd9` as the remediation implementation commit (handoff-only tip will be HEAD~1).
2. Review revised canonical setup at master branch protection / staged E2b sections, including fail-safe rollback order and consistency with live `Protect Main` ruleset ID `23809419`.
3. Confirm the original executable one-line change only: standalone manual `workflow_dispatch` preserved; no `pull_request`, no edits to baseline workflow or scripts.
4. Verify for **current exact PR head** the required `Project Baseline CI` emits and succeeds including both master-only validation steps, and no automatic `Template Integrity` runner starts.
5. Confirm formerly blocking review threads resolved without hiding substantive concerns, and zero new unresolved threads.
6. Check that owner-approved Option B is process-only and no release, ruleset, review privilege, or production mutation occurred.

### Human gate
Return PASS/PARTIAL/FAIL, severity-ranked findings, exact SHA and merge readiness. **Do not merge, dispatch workflow, change rulesets or deploy.** Await fresh owner squash-merge authorization if audit passes.

## Handoff: P8.0-C15

- **Task:** `tasks/P8.0-m3-generated-brownfield-integration.md`
- **From:** ChatGPT / architecture, docs, orchestration
- **To:** Grok / bounded implementation agent
- **Branch:** `phase/p8-m3-generated-brownfield-ci`
- **PR:** #24 — **Draft**, not merge-ready
- **Preparation commit:** `ed457c0914a63bf6f161955a727d8ba2e94016e7`
- **Base `main`:** `2d167b52bff2cce9506315b8615e53e84c62c642`
- **State:** IMPLEMENTATION HANDOFF (not independent audit)

### Completed
- Documentation establishes generated-child retention of `ci.yml` + `common-validation.yml` + `scripts/validate_project_profile.py`, and removal of master-only workflow and scripts.
- Brownfield KEEP/MERGE/ADD/RETIRE guidance preserves project-owned CI and dependent `push: main` release checks rather than blindly cloning the master.
- Updated `docs/CAPABILITY-PACKS.md`, P8 specification and STATUS after E2b #23 merged. No workflow YAML/ruleset changes.
- Direct ChatGPT tool attempt to edit validator scripts was blocked by tooling safety checks; **no validator/test implementation is present yet**.

### Immediate bounded work for Grok
1. Read repo `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, task spec; inspect only needed validator and self-tests.
2. Add conditional `ci.yml` caller → `common-validation.yml` existence check, but **do not** impose template filenames on brownfield repos using independent canonical CI. Preserve the existing fail-closed profile validation and master-only protections.
3. Extend the **existing** `scripts/test_validate_project_profile.py` with a physically pruned generated-child fixture using the actual copied caller/callee and validator. Validate child CLI profile success, guarded master-only steps, missing target failure, and brownfield no-caller success.
4. Run targeted Python validation and the unchanged required GitHub-hosted baseline CI; no new runner.
5. Record actual test evidence, update STATUS/task, append **new** handoff for Claude independent review of final exact SHA. Keep PR #24 **Draft** until ready for independent review.
6. Never merge, deploy, tag, grant IAM, modify GitHub rulesets, or alter workflow triggers without explicit owner approval. Block if tests/CI cannot pass safely.

## Handoff: P8.0-C16

- **Task:** `tasks/P8.0-m3-generated-brownfield-integration.md`
- **From:** Implementation agent (completes P8.0-C15)
- **To:** Claude / independent exact-head auditor
- **Branch:** `phase/p8-m3-generated-brownfield-ci`
- **PR:** #24
- **Implementation head:** `f91bf763151b6b3c0022098ff797ff9cf82ef505` (docs/handoff commit follows; audit the final PR head)
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT after hosted CI completion

### Completed
- `scripts/validate_project_profile.py`: new `validate_ci_caller_wiring()` called from `validate_repository` after the generated-cleanup check. Regex matches only an uncommented `uses: ./.github/workflows/common-validation.yml` (optionally quoted/commented). Missing callee raises `ProfileValidationError`. No ci.yml or a non-template ci.yml is a no-op.
- `scripts/test_validate_project_profile.py`: unit cases (no ci.yml, independent CI, other local reusable workflow, commented-out reference, three quoting styles, callee present) and a pruned-child fixture copying the real caller, callee and validator, with master-only files absent, `workflow_call` present, both master steps guarded, child CLI success, callee deleted -> exit 1, brownfield success, leftover `template-integrity.yml` still rejected.
- No workflow YAML, ruleset, secret, permission or dependency change. No new runner: tests run in the existing master self-test step.

### Evidence run locally
- `python scripts/validate_project_profile.py --repository mrdzyn/ai-native-project-template`: pass.
- `python scripts/validate_master_template.py`: pass.
- `python scripts/test_validate_project_profile.py`: pass; with the wiring call disabled the self-test fails (mutation check), then restored.

### Audit focus
1. Regex precision: no false positives on brownfield CI, no easy bypass (e.g. other quoting or `uses` forms) that the template caller could use to evade the check. Exact-reference matching is deliberate.
2. Master-only guards and existing cleanup/profile checks unchanged.
3. Fixture realism and the stated limitation that real child GitHub syntax is not proven here.
4. Single automatic Project Baseline CI run at final head; master inventory and self-test steps executed.
5. Docs consistent with retained paths.

### Human gate
Report PASS/PARTIAL/FAIL with severity-ranked findings. Await explicit owner approval before any merge.

## Handoff: P8.0-C17

- **Task:** `tasks/P8.0-m3-generated-brownfield-integration.md` — remediation of Codex review threads on PR #24
- **From:** Grok / implementation agent
- **To:** Genuinely independent exact-head auditor (not the implementation agent)
- **Branch:** `phase/p8-m3-generated-brownfield-ci`
- **PR:** #24 — **Draft**
- **Pre-remediation head:** `22e2eba6afba637a137d41ff7e6a67d41362293c`
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT after hosted CI completion (audit the final PR head)

### Completed
- Codex P2 (`validate_project_profile.py`): the line regex `COMMON_VALIDATION_CALL` matched `uses: ./.github/workflows/common-validation.yml` inside YAML block scalars. Replaced with stdlib `calls_common_validation()`: a line-aware scan that counts only a `uses:` key at job-key level directly under top-level `jobs:`, skipping comment lines, block-scalar contents (`|`, `>`, with indicators) and step-level `- uses:`. Value accepts unquoted, single- or double-quoted (matching quotes) with optional trailing comment. No new dependency.
- Regression tests in existing `scripts/test_validate_project_profile.py`: `run: |`/`>-`/`|+` false positives, job-level block scalar, step-level `uses`, non-`jobs` key, indented comment, genuine call after an earlier block scalar fails closed, mismatched quotes rejected; existing quoting, comment, independent CI and pruned-child cases retained.
- Codex P2 (task file): implemented requirements now marked completed.
- No workflow YAML, ruleset, secret, permission or runner change.

### Evidence run locally
- `python scripts/test_validate_project_profile.py`: `Project capability profile self-test matrix passed.`
- `python scripts/validate_project_profile.py --repository mrdzyn/ai-native-project-template`: valid.
- `python scripts/validate_master_template.py`: `Complete master-template inventory is valid.`
- Mutation: restoring the old line-regex detection makes the self-test fail (exit 1); restored.

### Audit focus
1. Parser precision and bypass resistance for block-style YAML; flow-style `jobs: {...}` is deliberately not supported (template caller is block-style).
2. Real `.github/workflows/ci.yml` still detected as a caller (asserted in fixture).
3. Single automatic Project Baseline CI run at the final head with master inventory and self-test steps.
4. Both Codex threads resolved with evidence; no new unresolved threads.

### Human gate
Report PASS/PARTIAL/FAIL with severity-ranked findings. Keep Draft; await explicit owner approval before any merge.

## Handoff: P8.0-MANUAL-CI-C1

- **Task / phase:** `tasks/P8.0-manual-first-ci-policy.md`
- **From:** ChatGPT / policy author
- **To:** Independent exact-head audit agent
- **Branch:** `chore/manual-ci-release-only`
- **Implementation head:** Review latest PR head; baseline `1d94a356b71da5eb345f4f4a29ff3f99f36c10c5`
- **PR:** New Draft master CI policy PR
- **State:** Pending local exact-head validation and independent audit

### Completed
- Prepared master manual-first development policy and dispatch-only caller while preserving callee, template integrity workflow and validator code.
- Documented master M4 real-child proof, security/ruleset migration dependency, and separate Windows PR #16.

### Validation
- Static trigger/contract inspection performed; full three-script local validation and independent audit **NOT YET EXECUTED**.
- Hosted GitHub Actions **NOT RUN**, by owner-directed development cost policy. No hosted PASS claimed.
- Master ruleset `23809419` still requires baseline status: owner administrative migration required before merge.

### Next action
Independent exact-head local three-script evidence and security/process audit. Then request separate owner ruleset and squash-merge approvals; do not merge or release.

## Handoff: P8.0-MANUAL-CI-C2

- **Task / phase:** `tasks/P8.0-manual-first-ci-policy.md` — remediation of PR #25 audit findings M1/M2/M3
- **From:** Antigravity / implementation agent
- **To:** Independent exact-head audit agent (Claude)
- **Branch:** `chore/manual-ci-release-only`
- **Implementation head:** Review latest PR head after remediation; baseline `1d94a356b71da5eb345f4f4a29ff3f99f36c10c5`
- **PR:** #25 (Draft)
- **State:** READY FOR INDEPENDENT EXACT-HEAD RE-AUDIT

### Completed
- Remediated M1 (`docs/REPOSITORY-SETUP.md`): reconciled greenfield-pruning, required-status checks, and CI trigger economy instructions with the manual-first development default and dispatch-only caller. Pruned children run exact-head local checks and do not require `Project baseline / Common validation` in rulesets unless explicitly adopting hosted PR CI. Final release candidate validation requires manually dispatching the retained hosted baseline. Brownfield repositories keep stronger existing required checks.
- Remediated M2 (`docs/REPOSITORY-SETUP.md` and `README.md`): updated E2b runner consolidation to reflect PR #23 squash-merge (`2d167b52bff2cce9506315b8615e53e84c62c642`). In Option B active governance, marked former imperative requirement of hosted status check on every PR as historical from the pre-manual-first E2b era, preserving mandatory Claude independent exact-head review, ChatGPT verification, and separate owner merge approval. Clarified delivery flowcharts in `README.md` that required validation/CI follows the active stage policy (manual-first local development / hosted release candidate per `docs/MANUAL-CI.md`).
- Remediated M3: corrected evidence reporting to use fail-closed tracked-environment guard commands with truthful exit code reporting.
- Preserved reusable `common-validation.yml`, `template-integrity.yml`, Python validators, and live ruleset `23809419` completely unchanged.

### Validation
- Executed all three Python validators on exact HEAD: `validate_project_profile.py`, `validate_master_template.py`, `test_validate_project_profile.py` all PASS.
- `git diff --check origin/main...HEAD`: PASS (0 whitespace errors).
- Fail-closed tracked environment guard `test -z "$(git ls-files | grep -E '(^|/)\.env')"`: PASS (exit 0, 0 tracked .env files).
- Workflow, script, profile, and ruleset immutability confirmed.

#### Next action
Perform independent exact-head re-audit (Claude) of PR #25 against refreshed HEAD. Owner separately authorizes ruleset migration (targeted removal of required baseline check) and squash merge. Keep PR #25 Draft; do not merge or deploy.

## Handoff: P8.0-M5-C1

- **Task / phase:** `tasks/P8.0-m5-local-first-release-validation.md` — Local-First, Actions-Independent CI and Release Validation
- **From:** Antigravity Cloud / implementation agent
- **To:** Independent exact-head audit agent (Claude)
- **Branch:** `feat/p8-m5-local-first-validation`
- **Implementation head:** Review latest commit on `feat/p8-m5-local-first-validation` (base `main@70d704b14aed2eec9669e1da4f43759ec73deff0`)
- **PR:** #26 (Draft)
- **State:** READY FOR INDEPENDENT EXACT-HEAD RE-AUDIT

### Completed
- Task specification `tasks/P8.0-m5-local-first-release-validation.md` defining bounded scope, acceptance criteria, and constraints.
- Remediated independent GPT-6 audit and re-audit findings on Draft PR #26:
  - **P1-01:** Required explicit non-empty release artifact inventory (`--artifacts`, `--artifact-dir`, or `releaseArtifacts` in contract). Removed configuration file substitution (`project-profile.json`, `design-tokens.json`). Zero specified artifacts or empty artifact directory strictly fail closed.
  - **P1-02:** Verified supplied candidate SHA matches full Git HEAD (`git rev-parse --verify HEAD`). Mismatched candidate SHA, failed git commands, or dirty working tree strictly fail closed.
  - **P1-03 & Item 1:** Established project-specific validation contract via `config/validation-contract.json` supporting mandatory `developmentCommands` and `releaseCommands`. In project mode, both development validation (`scripts/validate.py`) and release verification (`scripts/verify_release.py`) require complete validation contract categories (`test`, `build`, `security`). Empty or absent categories fail closed unless justified by an explicit, auditable `not_applicable` decision (min 10 characters). Release-only commands do not count toward development test categories. Master template validation preserved.
  - **P1-04:** Isolated validation skip options; no release candidate can PASS without complete development validation passing.
  - **P1-05:** Diff base resolution strictly fails closed when unresolvable (distinguishing `--bootstrap` greenfield initial setup from PR verification). Missing mandatory master validators in template mode strictly fail closed.
  - **P2-01 & Item 2:** Converted shareable evidence to strictly allowlist-based summaries (`name`, `command`, `exit_code`, `status`, `summary`). Zero arbitrary `output`, `stdout`, `stderr`, or `raw_output` keys are persisted in evidence output. Secret tokens, credentials, passwords, and sensitive local absolute system paths (`<repo>`, `<user_home>`, `<temp_path>`) are sanitized. Detailed diagnostics remain private by default.
  - **P2-02 & Item 4:** Corrected dirty-tree evidence semantics. Scratch-mode validation (`--allow-dirty`) reports `clean_tree_pr_evidence: false` and `validation_mode: "scratch"`. Added post-evidence worktree cleanliness check: if `--output-evidence` writes inside the worktree without being gitignored, validation fails closed.
  - **P1-01 (Mandatory Self-Test Bypass Removal):** Removed `AG_ENTRYPOINTS_TEST_ACTIVE=1` top-level bypass in `scripts/validate.py`. The local entrypoints self-test suite runs unconditionally in template mode, and validation fails closed if missing or failing. Added negative test `test_mandatory_self_test_bypass_negative` verifying that external callers setting `AG_ENTRYPOINTS_TEST_ACTIVE=1` cannot skip the suite.
  - **P1-02 (Post-Development Git Integrity Recheck):** Added step 8 to `scripts/validate.py` re-checking `git rev-parse HEAD` and `git status --porcelain` after all development commands run. Fails closed if HEAD changes or any non-ignored files are mutated or left in checkout. Legitimate ignored build artifacts are preserved. Added regression test `test_post_development_git_mutation_fails_closed`.
  - **P2-01 (Network Isolation Reporting):** Refined `probe_kernel_network_isolation()` to distinguish verified isolation (`errno.ENETUNREACH`, `errno.EPERM`, `errno.EACCES`) from generic connection failures, timeouts (`socket.timeout`), or unavailable network. Unsupported/unproven isolation strictly reports `[NOT VERIFIED]`.
  - **P2-02 (Contract Identifier Evidence Confidentiality):** Enforced stable contract identifiers (`contract:categories.<key>`, `contract:release.command_<idx>`) and stable check names rather than user-defined command names across evidence records and error summaries in both entrypoints. Added regression test `test_contract_identifier_evidence_confidentiality` verifying secrets in names are never persisted.
  - **Custom Category Identifier Confidentiality:** Enforced safe validated categories allowlist (`SAFE_CATEGORIES`) in `scripts/validate.py`. Custom category identifiers fall back to stable numeric command identifiers `contract:dev.cmd_{idx}` and check name `Stack validation contract [command_{idx}]`, preventing confidential tokens embedded in category names from leaking into shareable evidence. Added negative test verifying embedded tokens in custom categories are neutralized.
  - **Platform-Aware CLI Launcher Tests:** Updated `test_cli_launchers()` in `scripts/test_entrypoints.py` to verify Python-native entrypoints on all platforms including Windows, accurately report POSIX wrapper coverage on native Windows without attempting direct POSIX execution, and preserve Linux/macOS wrapper tests.
  - **27-Test Entrypoints Suite:** Expanded automated test suite (`scripts/test_entrypoints.py`) to 27 comprehensive tests covering zero artifacts, empty directory, SHA mismatch, git failures, missing validators, invalid diff base, dirty development tree, missing contract, incomplete contract, release-only commands, auditable N/A decisions, missing release command, post-command git mutation, unsafe evidence redaction, offline socket blockage, missing unshare regression, real project test/build/security checks, clean/fail-closed tracked env guards, allowlist evidence keys, scratch-mode evidence semantics, post-evidence dirty worktree detection, dev evidence preflight/verdict consistency, release evidence preflight/verdict consistency, adversarial token confidentiality, CLI launchers, mandatory self-test bypass negative test, post-dev git integrity recheck, and contract identifier evidence confidentiality.
- Offline local development validation runner `scripts/validate.py` and executable wrapper `scripts/validate`.
- Offline local release candidate verification runner `scripts/verify_release.py` and executable wrapper `scripts/verify_release`.
- Stack-agnostic contract documented in `scripts/README.md` allowing child projects in any language (.NET, Node, Rust, Go) to provide native local validation entrypoints.
- Updated `scripts/validate_master_template.py` inventory with new scripts, wrappers, and contract.
- Reconciled documentation across `docs/MANUAL-CI.md`, `docs/RELEASE.md`, `docs/TESTING.md`, `AGENTS.md`, `README.md`, `docs/REPOSITORY-SETUP.md`, `docs/CAPABILITY-PACKS.md`, and `scripts/README.md`.
- Workflow files (`common-validation.yml`, `template-integrity.yml`, `ci.yml`) and GitHub rulesets left intact.

### Validation
- Executed in Debian 12 Linux AG Cloud:
  - `python3 scripts/validate_project_profile.py --repository mrdzyn/ai-native-project-template` (PASS)
  - `python3 scripts/validate_master_template.py` (PASS)
  - `python3 scripts/test_validate_project_profile.py` (PASS, 12 test cases)
  - `python3 scripts/test_entrypoints.py` (PASS, 27 test cases)
  - `./scripts/validate` (PASS on clean tree; FAIL closed on dirty tree with exit 1)
  - `./scripts/verify_release --version v1.0.0-candidate` (FAIL closed on zero artifacts with exit 1)
  - `git diff --check origin/main...HEAD` (PASS, 0 whitespace errors)
  - Fail-closed tracked env guard `test -z "$(git ls-files | grep -E '(^|/)\.env')"` (PASS, exit 0)
- Native Windows and macOS stack validations are NOT RUN in Linux AG Cloud and require local platform QA.

### Next action
Independent exact-head re-audit (Claude) of Draft PR #26. Separate owner squash-merge approval. Keep PR Draft; do not merge or dispatch Actions.

## Handoff: P8.0-M6-C1

- **Task / phase:** `tasks/P8.0-m6-agent-session-continuity.md`
- **From:** GPT-6 / orchestrator
- **To:** AG Cloud or next M6 implementation agent
- **Branch:** `feat/p8-m6-session-continuity`
- **Implementation head:** `70d704b14aed2eec9669e1da4f43759ec73deff0` (approved base before kickoff documentation commit; inspect latest M6 HEAD)
- **PR:** N/A — kickoff branch; M6 implementation PR not opened
- **State:** READY TO IMPLEMENT; M6 tests and independent audit NOT YET RUN

### Completed
- Created an independent M6 branch from approved `main`, not from unapproved M5 PR #26.
- Added bounded M6 task and `docs/SESSION-CONTINUITY.md` proposed resume contract; STATUS points to this handoff.
- Verified M5 PR #26 remains a separate Draft workstream as of kickoff.

### Validation
- Read and reconciled repo startup files and approved starting `main` HEAD.
- M6 implementation tests: NOT RUN (no generator exists yet).
- Hosted GitHub Actions: NOT RUN.
- Independent exact-head audit: PENDING.

### Continuation notes
- Old main STATUS refers to PR #25 as Draft even though PR #25 has merged; M6 branch STATUS corrects that explicitly without rewriting historical handoff entries.
- M5 contains independent CI changes. Its eventual squash merge may require an M6 branch reconciliation/rebase. Preserve both workstreams and human approval gates.
- Chat memory and unsupported remote verification are never authoritative; see `docs/SESSION-CONTINUITY.md`.

### Next action
Implement the minimal read-only, offline-capable session-context generator and positive/negative tests defined by the M6 task, on this branch only. Record actual exact-head evidence, then prepare independent audit; do not merge or deploy.

## Handoff: P8.0-M6-C2

- **Task / phase:** `tasks/P8.0-m6-agent-session-continuity.md`
- **From:** Antigravity Cloud / implementation agent
- **To:** Claude / independent exact-head auditor
- **Branch:** `feat/p8-m6-session-continuity`
- **Implementation head:** Review latest commit on `feat/p8-m6-session-continuity` (base `main@3ed37d3a35cb291671d1d6750ca721858e833261`)
- **PR:** #27 (Draft)
- **State:** READY FOR INDEPENDENT EXACT-HEAD AUDIT

### Completed
- Implemented read-only, offline-capable session context generator `scripts/session_context.py` per canonical contract `docs/SESSION-CONTINUITY.md`.
- Implemented targeted unit test suite `scripts/test_session_context.py` validating fresh session recovery, missing/duplicate handoff fail-closed, path traversal prevention, contradictory branch detection, offline unverified remote defaults, unauthorized autonomous merge blocking, greenfield child recovery without master historical handoffs, brownfield authority preservation, credential/token redaction, isolated CLI runner exit codes, STATUS branch contradiction, handoff task mismatch, stale exact 40-character implementation SHA detection, missing/duplicate mandatory STATUS fields, pending approval with merge language blocking, external symlink task path fail-closed, secrets in non-action fields redaction, post-merge main branch recovery with handoff transitions, per-operation privileged directive checks without global exemptions, unestablished action authority review, rejection of blank or empty mandatory STATUS values, same-operation authorization bypass prevention, and evidence-backed task-scope verification.
- Reconciled STATUS working branch, active task, and handoff branch/task against local Git state.
- Verified implementation HEAD SHA when full SHA is provided, distinguishing exact HEAD match and documented handoff-only parent commit from stale SHAs, while reporting non-exact references explicitly.
- Replaced permissive merge/deploy keyword rule with per-clause, per-operation checks so that negative statements on one operation never exempt another privileged directive and merge language combined with pending approvals is strictly blocked; strictly separated proposed action authority from task existence, requiring explicit agent/task review when authority is unestablished; and rejected blank or empty mandatory STATUS values.
- Remediated targeted task-scope authorization defect in `verify_task_scope`: eliminated substring matches and shared-keyword authority grants; parsed task Next action without truncating at `#` references (`PR #27`); rejected additional unapproved actions appended or prepended to documented actions; required positive proof of scope before establishing authority, otherwise returning `REQUIRES_REVIEW` and failing closed.
- Reconciled merged M5 into M6 feature branch (`main@3ed37d3a35cb291671d1d6750ca721858e833261`), preserving M5 local-first CI contracts, validators, and 27-test entrypoint suite alongside M6 session continuity. Integrated M6 test suite into master local development validation (`scripts/validate.py`).
- Clearly distinguished handoff-proposed action, verified local state, unverified remote state, and pending human approvals.
- Enforced repository-contained task paths with symlink resolution (`is_relative_to`), bounding and sanitizing all fields.
- Replaced test dependencies on live handoff entries with isolated deterministic fixtures.
- Added `docs/SESSION-CONTINUITY.md`, `scripts/session_context.py`, and `scripts/test_session_context.py` to required master inventory in `scripts/validate_master_template.py` (40 items).
- Documented session context scripts in `scripts/README.md`.
- Added session context pointer to `AGENTS.md` startup read order and greenfield pruning retention guidance in `docs/REPOSITORY-SETUP.md`.
- Reconciled `docs/STATUS.md` and `tasks/P8.0-m6-agent-session-continuity.md`.

### Validation
- `python3 scripts/validate_project_profile.py --repository mrdzyn/ai-native-project-template` (PASS)
- `python3 scripts/validate_master_template.py` (PASS, 40 required inventory items verified)
- `python3 scripts/test_validate_project_profile.py` (PASS, 12 test cases)
- `python3 scripts/test_entrypoints.py` (PASS, 27 test cases)
- `python3 scripts/test_session_context.py` (PASS, 21 test cases including untruncated Next action parsing and appended action rejection)
- `./scripts/validate` (PASS on clean tree)
- `./scripts/verify_release --version v1.0.0-candidate` (FAIL closed on zero artifacts)
- `git diff --check origin/main...HEAD` (PASS, 0 whitespace errors)
- `test -z "$(git ls-files | grep -E '(^|/)\.env')"` (PASS, 0 tracked .env files)
- Hosted GitHub Actions: NOT RUN (offline-capable implementation).

### Continuation notes
- Master M5 PR #26 has been squash-merged to `main@3ed37d3a35cb291671d1d6750ca721858e833261` and integrated into M6.
- Autonomous merge or release is strictly prohibited; human owner approval remains mandatory.
- Live remote PR/ruleset verification is separate and optional; offline default is UNVERIFIED.
- Post-merge main transition: upon owner squash-merge of Draft PR #27, `main` must not retain `Working branch: feat/p8-m6-session-continuity` or an active handoff pointing to the merged PR. In a docs-only transition commit, `docs/STATUS.md` on `main` must set `Working branch: main`, `Active handoff: None`, and next milestone directive, avoiding branch contradiction blockers.

### Next action
Independent exact-HEAD audit (Claude) of Draft PR #27 on feat/p8-m6-session-continuity. Separate explicit human owner approval required before squash-merge. Do not merge, tag, or deploy.

## Handoff: P8.0-M7-C1

- **Task / phase:** `tasks/P8.0-m7-agent-orchestration-token-efficiency.md`
- **From:** GPT-6 / M7 implementation
- **To:** Trusted local CI executor, then independent GPT-6 reviewer
- **Branch:** `feat/p8-m7-agent-orchestration`
- **Implementation head:** `dbb90b9d93ba29e442be49dac76e3d03e4bc9e06`
- **PR:** #29 (Draft)
- **State:** READY FOR EXACT-HEAD LOCAL VALIDATION

### Completed
- Added provider-neutral, single-primary-agent orchestration policy with optional bounded specialists and disjoint write ownership.
- Added compact task/handoff contexts, M6 session reuse, soft model/token bands, honest telemetry, and risk-based test-loop rules.
- Linked canonical guidance in agent, task, testing, onboarding and repository setup; updated master inventory and focused contract self-test.

### Validation
- GitHub source-only assertions on implementation SHA: PASS (guide vocabulary, canonical pointers, inventory, 30 registered and 30 invoked entrypoint tests).
- `python3 scripts/test_entrypoints.py`, `python3 scripts/test_session_context.py`, `./scripts/validate`: NOT RUN in trusted local checkout.
- Release verifier negative case, `git diff --check`, tracked-env guard and clean-tree manual CI: NOT RUN.
- Hosted GitHub Actions: NOT RUN; optional under local-first policy.
- No credential handling, production feature deferral, merge or deployment.

### Continuation notes
- PR #29 is Draft on main@`2a8e77b1e2559bfc010837e67e9e19e7de6e2370`; use current PR HEAD, not the implementation parent SHA, for exact-HEAD validation.
- This handoff-only documentation commit may be a direct child of the declared implementation SHA, as permitted by the M6 session recovery contract.
- No independent audit verdict, production readiness claim, token savings percentage or human merge approval is established.
- After a separately approved M7 squash merge, reconcile STATUS to `Working branch: main` and `Active handoff: None` before relying on live main session recovery.

### Next action
Run exact-HEAD local validation for the M7 Draft PR, then request independent GPT-6 review.

<!-- MASTER_TEMPLATE_HANDOFFS_END -->
<!-- HANDOFF_ENTRIES_END -->
