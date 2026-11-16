# RelateHandoff

**One context. Every agent.**

RelateHandoff is a proposed local-first context and evidence layer for AI-assisted software development. It aims to let Codex, Claude Code, Gemini CLI, and other compatible clients resume work from a shared, provenance-aware handoff graph without reconstructing entire chat transcripts.

**Current state:** Phase 0 (`#1`) and RH-P1 handoff (`#2`) are merged on `main`. On `phase-1/relate-handoff-mvp` (Draft PR #3), the Relate `v1.0.1` integration spike, schema-validated handoff recorder (`src/recorder.mjs`), exact-HEAD freshness engine (`src/freshness.mjs`), and read-only MCP stdio client (`src/mcp_client.mjs`, `src/cli.mjs`) are implemented and tested against live Relate. Sanitized example store and judge demo capture remain in progress. See [status](docs/STATUS.md), [spike findings](docs/RELATE-SPIKE.md), and the [first implementation task](tasks/RH-P1-relate-handoff-mvp.md).

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

## Judge walkthrough & demo

1. Install dependencies: `npm install` (pins `@relate/relate@1.0.1`), and ensure `relate` CLI `v1.0.1` is runnable (`relatedb.ai/install.sh`, or `cargo install` on `GLIBC < 2.39` Linux; see [spike findings](docs/RELATE-SPIKE.md)).
2. Run the self-contained demo: `npm run demo` — exercises recording at `SHA-A`, read-only MCP retrieval, `VERIFIED` freshness, `SHA-A` → `SHA-B` `STALE` detection, missing-evidence `UNVERIFIED`, failed-evidence `BLOCKED`, and MCP write refusal.
3. Inspect the committed synthetic example store ([`examples/example-store/`](examples/example-store/)) or regenerate it with `npm run generate:example`.

See [judge walkthrough](docs/JUDGE-WALKTHROUGH.md) for Cypher query examples and captured CLI output.

## Repository development

The project is initialized from [mrdzyn/ai-native-project-template](https://github.com/mrdzyn/ai-native-project-template). Follow [AGENTS.md](AGENTS.md), then [docs/STATUS.md](docs/STATUS.md), [config/project-profile.json](config/project-profile.json), and the active task contract. The retained [agent orchestration guide](docs/AGENT-ORCHESTRATION.md) defines one-primary-agent execution, bounded specialist work, and exact-HEAD audit responsibilities.

Exact-HEAD local-first validation on a clean checkout:

```bash
python3 scripts/test_bootstrap.py
python3 scripts/test_entrypoints.py
python3 scripts/check_secret_tracking.py
python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff
python3 scripts/validate.py --repository mrdzyn/relatehandoff
```

`validate.py` executes the mandatory contract in `config/validation-contract.json` (`test` via `scripts/run_p1_tests.py` with `RELATE_REQUIRE_CLI=1`, `build` via `npm run build`, and `security` via `scripts/run_p1_security.py`). Skipped MCP tests cannot pass `validate.py`. On macOS/Linux invoke `python3`; on Windows use `py -3` or `python`. The retained `scripts/test_entrypoints.py` governance regression suite runs **separately** from `scripts/validate.py`. Hosted baseline CI is manual-dispatch only.

## Distribution and attribution

Hackathon entry: [Relate by Neo4j](https://relate.devpost.com/), deadline **December 11, 2026, 6:00 PM PST**. This is an independent community submission, not endorsed by Neo4j. Its concept was informed by the [jexp/relate-ideas](https://github.com/jexp/relate-ideas) collection (especially Agent Handoff Object, Judgment Ledger and Skills as Graphs); no implementation or content from it has been copied into this project.

**License decision is pending owner approval.** Public visibility does not itself grant open-source redistribution rights. Do not import third-party implementation or accept contributions before the project's license and contribution terms are settled.

No hosted service, payment, telemetry, agent credentials, or end-user records are part of the current foundation; implementation, distribution and release remain separately gated.
