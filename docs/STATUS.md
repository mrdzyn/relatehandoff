# Project Status

## Project
- **Name:** AI-Native Project Template
- **Current phase:** P8.0 M7 — Agent Orchestration & Token Efficiency (merged)
- **Status:** M7 governance integrated into `main`; awaiting owner selection of the next task to measure actual token and subagent efficiency.
- **Primary branch:** `main`
- **Approved starting baseline:** `6916912bbafb50b10b276988fbf20dafdfa5e435` (M7 PR #29 squash merge)
- **Working branch:** `main`
- **Active task:** `tasks/P8.0-m7-agent-orchestration-token-efficiency.md`
- **Active handoff:** None

## Completed / parallel state
- M5 local-first validation and M6 session continuity are merged into `main`.
- Release-scope preservation governance (PR #28) is merged into `main`; a closed promotion gate never authorizes feature descoping.
- M7 [PR #29](https://github.com/mrdzyn/ai-native-project-template/pull/29) was independently reviewed, owner-approved, and squash-merged at `6916912bbafb50b10b276988fbf20dafdfa5e435`. It introduces one-primary-agent default, bounded optional subagents, minimal verified context, soft token budgets, truthful telemetry, and focused agent test loops.
- M7's independent audit reported PASS for pre-merge safeguards and local validation, with post-merge STATUS transition pending. This docs-only follow-up aligns the intended `main` state; exact-HEAD local M6 recovery still requires verification after its approved merge.
- No production code, feature scope, release verifier, branch protections, deployment, or release was changed by M7.

## Current decisions and gates
- Local-first mandatory exact-HEAD validation, independent review, and separate human approvals remain required.
- Soft token budgets are planning aids, never permission to skip security, tests, or release obligations.
- M7 token/cost savings must be measured from available real telemetry on comparable authorized tasks; otherwise report NOT AVAILABLE.
- Do not start new product work, merge, deploy, or publish solely from this status. Owner authorization remains required.

## Next
Request the owner's selection of the next authorized comparable coding task for evidence-based M7 token-efficiency measurement.
