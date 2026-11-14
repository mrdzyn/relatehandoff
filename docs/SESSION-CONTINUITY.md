# AI Agent Session Continuity & Context Recovery

 > **Status in RelateHandoff:** Inherited read-only `scripts/session_context.py` generator; the master-only `scripts/test_session_context.py` history/self-test is intentionally pruned under greenfield policy. Project-specific local validation has not yet run.

## Problem and guarantee boundary

New GPT-6, Claude, Codex and Antigravity Cloud conversations may lack prior chat context or current repo access. Remembered decisions and model-generated summaries can become outdated. **The Git repository is the project source of truth**, but model memory alone is not a durable source, and a new conversation is not guaranteed to automatically mount or read a private repository.

This contract guarantees a repeatable **workflow and validation target**, not that an AI model can always discover a repository without the appropriate connector, location, access permission or explicit initiation.

## Startup protocol

Follow the minimum ordered context identified in `AGENTS.md`:

1. `AGENTS.md` — instructions and authority boundaries.
2. `docs/STATUS.md` — actual working phase, active task pointer and active handoff identifier.
3. `config/project-profile.json` — repository mode and selected capabilities.
4. The **one active task** referenced by STATUS.
5. The **matching single handoff section** under `## Handoff: <ID>` in `docs/HANDOFFS.md`, or no handoff if STATUS says `None`.
6. Only task-relevant source, tests, docs and Git/PR evidence required to answer or proceed.

Do not scan the entire handoff log or load `docs/PROJECT-MEMORY.md` by default.

## Source of truth and conflict handling

- The live checked-out Git tree and actual full commit SHA establish **what is present locally**.
- Current live GitHub PR/branch/ruleset metadata, when accessible, establishes **remote state**. An offline snapshot cannot prove current remote state.
- STATUS, task and handoff are **claims about operating context** and must be verified against the branch and evidence; stale or inconsistent entries are blockers for changing code, not permissions to improvise.
- Historical PRs, handoffs and memory must not override current confirmed repo source or fresh explicit owner instructions.
- The next authorized action must come from the task/handoff and be within current owner approvals; a proposed merge or release is not an authorization.

If an active task, a unique matching handoff, repository HEAD, or required permission is unavailable, respond **BLOCKED / UNVERIFIED** with the exact missing input. Never hallucinate a SHA, PASS, reviewer or owner approval.

## Minimal resume packet (proposed)

The offline generator should emit a bounded, non-secret record:

```text
RESUME CONTEXT
Repository: <owner/repo or UNVERIFIED>
Git HEAD: <full SHA or BLOCKED>
Checked-out branch: <branch or detached>
Project mode: <template/project>
Phase/status: <from STATUS; source path>
Active task: <repository-relative path>
Active handoff: <ID or None; unique section confirmed>
Next authorized action: <single bounded action or BLOCKED>
Local verification: <PASS/PARTIAL/FAIL>
Remote PR/branch verification: <VERIFIED/UNVERIFIED/NOT APPLICABLE>
Outstanding human gates: <only supported facts, otherwise UNVERIFIED>
Limitations/blockers: <brief, explicit>
```

Output may also support stable JSON fields for agent consumption. Avoid arbitrary code, raw logs, full diffs, previous conversations, tokens, credentials or customer information.

## Implementation constraints

- Purely read-only and **offline-capable** by default. No GitHub API, GitHub Actions, shell-agent execution or mandatory networking in the local generator.
- Parse STATUS and handoff by their documented structure; require **exact, unique** handoff identity. Do not auto-select a similar or later handoff by fuzzy match.
- Validate task path is repository-relative and cannot traverse outside root. Validate profile format and supported mode.
- Use local `git rev-parse` and status checks. Distinguish a dirty checkout from an untrusted or invalid SHA; do not mutate files while reading context.
- Keep output bounded. On any ambiguity, return a machine-readable blocked reason and safe explanatory text.
- Allow agents with connected GitHub access to add a **separate live remote verification step**; never represent cached local evidence as live remote confirmation.
- The human must still approve merges, deployments, releases, ruleset changes and irreversible production actions.

## Fresh-session test scenarios

1. New session with no chat: valid STATUS/task/unique handoff yields accurate minimal packet.
2. Handoff ID is missing or duplicated: blocked, no action fabricated.
3. STATUS task path missing/traverses outside repo: blocked.
4. Handoff branch contradicts checked-out branch, or declared SHA contradicts observed Git: blocked or clearly unverified with no code changes.
5. Remote GitHub access absent: local recovery succeeds but remote state is explicitly UNVERIFIED.
6. A stale claim says a Draft PR merged or audit PASS without evidence: report conflict and require live verification.
7. Valid generated-child project removes inherited master history and resolves its own current task/handoff.
8. Brownfield project keeps its approved existing context authority; no duplication or silent replacement.

## Adoption and release boundaries

This M6 contract operates in harmony with the squash-merged M5 local-first CI and release validation system (`scripts/validate.py`, `scripts/verify_release.py`). It does not weaken local-first testing, CI/security checks, independent audit, or owner merge/release gates, and it does not grant permission to merge or deploy. Changes to session context generators are validated by the mandatory local validation runner before release candidate verification.
