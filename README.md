# RelateHandoff

**One context. Every agent.**

RelateHandoff is a proposed local-first context and evidence layer for AI-assisted software development. It aims to let Codex, Claude Code, Gemini CLI, and other compatible clients resume work from a shared, provenance-aware handoff graph without reconstructing entire chat transcripts.

**Current state:** Phase 0 foundation in review. **No working Relate integration or hackathon demo exists yet.** See [status](docs/STATUS.md) and the [first implementation task](tasks/RH-P1-relate-handoff-mvp.md).

## Why it exists

Coding agents work in separate sessions and tools. Conventional handoffs lose the relationship between a requirement, a decision, a Git commit, a test result, and the agent that produced it. RelateHandoff will model those relationships and reject unsupported freshness claims.

It is *not* an agent orchestrator, a Git replacement, or an autonomous merge approver. Git and repository files remain authoritative; the graph is a derived local context and provenance index.

## Planned Relate usage

- **Mode:** persistent directory-based local Relate store, to support a writer plus read-only agent clients; not implemented in Phase 0.
- **Engine:** [Relate](https://relatedb.ai/docs/) with Cypher relationships and a local read-only MCP surface.
- **Graph:** Repository, Task, Requirement, Agent, Session, Handoff, Decision, Commit, Artifact, TestRun, Review and Evidence with typed provenance edges.
- **Agent access:** `relate serve --mcp stdio --database <local-store> --read-only` once a real store exists; writes will pass through an explicit app-level ingestion and validation layer.
- **Offline:** local Git checkout + local graph for normal retrieval; GitHub is still needed for remote PR state or cross-device Git synchronization.
- **Judges:** Phase 1 must supply a synthetic populated **persistent** example store and reproducible commands. Neither is claimed to exist today.

See [architecture](docs/ARCHITECTURE.md), [product](docs/PRODUCT.md) and [hackathon checklist](docs/HACKATHON.md).

## Planned MVP acceptance demo

1. Agent A records a task handoff against exact local Git SHA A with decisions, evidence, blockers and next action.
2. Agent B, in a separate process/session, retrieves the minimal context through Relate MCP without reading Agent A's transcript.
3. A newer local Git SHA B is introduced. RelateHandoff detects that A's evidence does not establish readiness at B.
4. Agent B identifies the missing validation and does **not** merge, publish, or invent a passing audit.

This is the target for Phase 1, **not a feature currently available**.

## Repository development

The project is initialized from [mrdzyn/ai-native-project-template](https://github.com/mrdzyn/ai-native-project-template). Follow [AGENTS.md](AGENTS.md), then [docs/STATUS.md](docs/STATUS.md), [config/project-profile.json](config/project-profile.json), and the active task contract.

Phase 0 validation on a clean checkout:

```bash
python scripts/test_bootstrap.py
python scripts/check_secret_tracking.py
python scripts/validate_project_profile.py --repository mrdzyn/relatehandoff
python scripts/validate.py --repository mrdzyn/relatehandoff
```

Python 3 and Git are needed for this inherited local-first validation; the application stack, Relate executable and runtime tests are **not yet installed**. On systems where Python is named `python3`, use that executable or configure the interpreter alias. Hosted baseline CI is manual-dispatch only and not proof of application functionality.

## Distribution and attribution

Hackathon entry: [Relate by Neo4j](https://relate.devpost.com/), deadline **December 11, 2026, 6:00 PM PST**. This is an independent community submission, not endorsed by Neo4j. Its concept was informed by the [jexp/relate-ideas](https://github.com/jexp/relate-ideas) collection (especially Agent Handoff Object, Judgment Ledger and Skills as Graphs); no implementation or content from it has been copied into this project.

**License decision is pending owner approval.** Public visibility does not itself grant open-source redistribution rights. Do not import third-party implementation or accept contributions before the project's license and contribution terms are settled.

No hosted service, payment, telemetry, agent credentials, or end-user records are part of Phase 0.
