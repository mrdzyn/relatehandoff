# P8.0 M7 — Agent Orchestration & Token Efficiency

> Provider-neutral repository operating guidance. It does not claim a platform supports subagents, persistent context, or token telemetry. M5 exact-HEAD local CI, M6 session continuity, and release-scope preservation remain authoritative.

## One primary implementation agent

Default to **one primary implementation agent** and one write owner for the assigned task/PR. A specialist subagent is optional, not a standard step. Delegate only when an independently checkable output, domain expertise, or safe parallelism demonstrably justifies startup and review overhead. Do not delegate routine file summaries, trivial edits, or duplicate tests.

Before delegating, define: (1) one objective and acceptance evidence; (2) exact allowed and forbidden paths; (3) a separate write owner or read-only mode; (4) a bounded input packet; and (5) an explicit stop condition. Concurrent writes to overlapping files are prohibited. Independent auditors must not approve their own changes, and the same model's self-review is not proof of independent verification.

## Compact subagent contract

```text
Task: <active task ID and single objective>
Repository/branch: <owner/repo; branch>
Verified base: <full SHA or UNVERIFIED>
Allowed / forbidden: <exact paths and operations>
Inputs: <only relevant files, interfaces, acceptance criteria>
Evidence: <targeted test commands, expected outputs>
Output: <change summary, paths, checks actually run, risks, one next action>
Gates: <independent review and human approvals outstanding>
```

Never transmit secrets, private keys, customer records, entire chat logs, or unrelated repository history. If permissions, current HEAD, scope, or security assumptions contradict the contract, stop and report the blocker.

## Context loading and reuse

Follow `AGENTS.md` startup order: `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, the active task, and only its matching active handoff, followed by task-relevant code/tests. Use `scripts/session_context.py` for M6's bounded resume packet **as a supplement**, not as a substitute for source verification or owner authorization.

During one task, keep an ephemeral context ledger of file path, verified HEAD/revision and relevance. Avoid rereading unchanged docs or broad code dumps. Use symbol search, focused excerpts, and changed-file diffs. Refresh when the task/phase changes, HEAD materially changes, a required review is new, or a safety-sensitive assumption could be stale. Do not cache approval, PR mergeability, or tests across changed HEADs.

## Model routing and soft budgets

Route by scope, risk, and uncertainty—not brand or paid subscription:

| Tier | Examples | Illustrative soft context budget |
|---|---|---|
| Focused | Narrow docs, isolated component, straightforward test | ~8k tokens |
| Standard | Bounded multi-file behavior or integration adapter | ~25k tokens |
| Deep | Architecture, auth, cryptography, payments, data migrations, production infrastructure | ~60k tokens, reassess as needed |

The bands are **planning prompts**, not equivalent billable-token counts, guarantees, entitlement claims, hard stop limits, or approval to omit important work. For high-risk matters, require capable reasoning and independent security review as applicable. If the band is exceeded, summarize what is known, identify the remaining evidence, and justify further work. Cost never overrides correct implementation, privacy, security, or owner-approved release scope.

## Test loop and consolidated review

1. Define a task-specific observable test objective, then run the smallest deterministic targeted tests that prove it.
2. After a focused fix, rerun affected tests and risk-relevant negative cases, not every unrelated suite reflexively.
3. At the **final exact PR HEAD**, run all mandatory repository tests, local CI, security checks and required manual/platform QA. This mandatory exact-HEAD gate is never optional for token efficiency. A prior HEAD's PASS is historical evidence.
4. Request one consolidated genuinely independent review using exact SHA, change summary, diff, actual test evidence and open risks. Batch related findings into bounded remediation. Re-review changed risk at the new HEAD while retaining mandatory full exact-HEAD gates.
5. Do not self-approve, merge, deploy, publish, change rulesets, or substitute mock-backed evidence for live integration.

A closed production gate blocks promotion, **not feature scope**. See `docs/RELEASE-SCOPE-MANIFEST.md` and `docs/RELEASE.md`.

## Compact handoff and telemetry

Follow `docs/HANDOFFS.md`: one meaningful handoff containing active task, full SHA/branch, touched paths, outcomes, tests **actually run**, limitations/risks, human approvals, and one next action. No full log dumps or repeated historical handoffs.

Capture metrics **only when provided or provably observable**: input/output tokens, model/provider, actual or explicitly estimated cost and method, subagent invocation count, repeated unchanged-file reads, duplicate test invocations, review/remediation rounds, and regression/scope outcomes. Record missing metrics as **NOT AVAILABLE**. Compare like-for-like tasks with a baseline and denominator before reporting savings; a possible 25–40% reduction is an experiment, not a promise. Do not collect prompts, secrets or customer data as telemetry.

## Escalation

Stop or seek orchestrator/owner direction if scopes overlap, token pressure would compromise any mandatory check, a subagent needs privileged credentials, repository authority is unclear, or a suggestion would remove or defer an approved feature. Efficiency is never a safety or release gate override. No autonomous merges, deployments, releases, or ruleset updates.
