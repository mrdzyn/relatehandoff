# RelateHandoff — Product Definition

## Identity and status
- **Product:** RelateHandoff
- **Tagline:** One context. Every agent.
- **Owner:** mrdzyn
- **Stage:** RH-P1/RH-P2 implemented and merged; RH-P3 judge/distribution preparation in progress (no release or submission authorized)
- **Distribution intent:** Public hackathon submission proposed; original RelateHandoff code is Apache-2.0 licensed (PR #8 merged). Commercialization direction and actual submission remain separate owner decisions

## Problem
AI coding agents routinely hand work to a different session or tool. Reconstructing context from chat logs, Git history, STATUS, and PRs is slow; an unsupported statement such as "tests passed" can accidentally apply to a newer commit. A locally queryable graph can preserve concise provenance, context and freshness signals.

## Primary users
- Solo developers and small engineering teams switching among AI coding agents
- Maintainers/reviewers validating work against an exact commit
- Hackathon judges running an offline, reproducible demo

## MVP promise (implemented in RH-P1; hardened in RH-P2)
1. Record a structured handoff: source/target agent, task, repo/branch, exact commit SHA, decisions, cited artifacts, evidence, blockers and next action.
2. Persist a local Relate graph with typed relationships, provenance and versioned schema.
3. Resume from another compatible MCP agent with a *bounded* query and discover relevant instructions/evidence.
4. Compare handoff evidence's observed SHA with current local HEAD. Report **STALE/UNVERIFIED**, never a false PASS, when they differ or evidence is absent.
5. Demonstrate all of the above with a sanitized sample repository and persistent example Relate store, reproducibly on a judge's machine.

## Success criteria
- Both agent roles can independently resume against the same local graph without rereading prior transcript.
- A real Relate Cypher traversal returns at least one connected chain from task → commit → test evidence → handoff.
- A new commit invalidates claimed freshness and blocks a misleading ready-to-merge report.
- README supplies a one-command or short-command setup, synthetic example store, observable outputs, and a 1–2 minute demo.
- Automated checks demonstrate persistence, MCP read-only enforcement, correct freshness handling, and safe failure.

## Non-goals for MVP
- No automatic Git merge, release, deployment or GitHub writes.
- No replacement for local Git files, repository governance, or GitHub remote.
- No general chat transcript ingest, unrestricted personal memory, cloud synchronization, billing, or team tenancy.
- No promise of automatic support for ChatGPT Work desktop before host integration is verified.
- No public REST/MCP endpoint or arbitrary agent-command execution.

## Proposed user flow
Agent A explicitly writes a handoff through a validated recorder; Agent B opens the read-only Relate MCP view; Agent B queries tasks, provenance and the latest handoff; an exact local SHA check separates known data from stale claims; the human retains approval authority.

## Commercialization and constraints
- Open-core/commercial options remain proposals, not selected licensing terms.
- Local-first/offline by default; minimize data and never commit real secrets or customer information.
- Competition project must remain new, original, and demoable; inherited scaffolding and inspiration are disclosed.
- Phase 0 created documentation and verification contracts only. RH-P1/RH-P2 subsequently implemented and hardened the local recorder, persistent graph and read-only MCP client.
