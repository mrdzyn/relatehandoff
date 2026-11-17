# RH-P2 Real-Agent Codex-to-Claude Handoff Proof & MCP Snapshot Finding

## 1. Post-Merge Baseline
- **Merged PR #3 (`main`):** `f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd` (actual GitHub merge timestamp: `2026-11-16T17:23:22Z`)
- **Merged PR #4 (`main`):** `a6bb9bdd562205e5690318272bce8dda0ecf6306` (actual GitHub merge date: `November 17, 2026 (UTC)`; audited PR HEAD: `2c7dcef50a6cde26516f415c5879f3749c9dbe2d`)
- **Immutability:** Historical RH-P0/RH-P1 records and `examples/example-store/` were not mutated.
- **Timestamp disclosure:** Synthetic `createdAt` / `observedAt` timestamps in RH-P2 documentation and tests (`2026-11-16` / `2026-11-17`) reflect the local test-environment clock and are nonfactual placeholder timestamps, distinct from the actual GitHub merge timestamps above; historical immutable records are preserved verbatim without back-editing.

## 2. Sanitized Real-Agent Handoff Summary (OWNER-REPORTED, macOS ARM64)
- **Attribution & status:** `OWNER-REPORTED` (observed on owner's macOS ARM64 workstation; not independently verified or re-executed on a macOS host in Linux follow-ups).
- **Platform & Engine:** macOS ARM64 (`Relate v1.0.1`, read-only MCP stdio)
- **Sanitized Handoff Record (`RH-P2-CODEX-CLAUDE-1`):**
  - `handoffId`: `RH-P2-CODEX-CLAUDE-1`
  - `taskId`: `RH-P2-AGENT-DEMO`
  - `repository`: `mrdzyn/relatehandoff`
  - `headSha`: `f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd`
  - `sourceAgent`: `codex-cli` (writer via `src/cli.mjs record`)
  - `targetAgent`: `claude-code` (consumer via `relate serve --mcp stdio --read-only`)
  - **Evidence & authenticity distinction:** Persisted store evidence recorded by `codex-cli` is unsigned (`RUNNER_RECORDED_UNSIGNED` or `SELF_ASSERTED`), so read-only MCP retrieval without in-process `--verify` reports `metadataFreshness: "CURRENT"` and `executionAuthenticity: "UNVERIFIED"` (`status: "UNVERIFIED"`). Explicit local in-process verification (`--verify <profile>`) is required to yield `executionAuthenticity: "AUTHENTICATED"`; no independent verification of execution authenticity is claimed here.
- **Observed Outcome:**
  1. `codex-cli` recorded `RH-P2-CODEX-CLAUDE-1` with repository-scoped provenance (`Repository -> Task <- Handoff -> Commit`, `Artifact`, `Decision`, `Evidence`) into the local Relate directory store.
  2. `claude-code` retrieved the handoff and provenance through read-only MCP (`read_cypher` / `get_schema`), observing exact-HEAD freshness separation and confirming write operations remain refused in `--read-only` mode.
  3. **Operational Finding:** When `claude-code`'s MCP host kept a **long-lived** `relate serve --mcp stdio --database <store> --read-only` process open across turns, a newly recorded handoff written by a separate `codex-cli` process was **not visible** until the MCP server process was restarted.

## 3. Reproduced Long-Lived MCP Reader Behavior (AUTHOR-REPORTED, Linux x86_64, `Relate v1.0.1`)
`AUTHOR-REPORTED` against source-built `relate` (`Relate v1.0.1` on `PATH`) and automated in `test/e2e_mcp.test.mjs` (`RH-P2 regression (long-lived MCP snapshot)`). Note: PR #4's independent COMMENT-only re-audit passed without independently reproducing real-CLI execution.

1. Writer process #1 (`src/cli.mjs record`) records `RH-P2-H-1` and exits cleanly.
2. A long-lived `relate serve --mcp stdio --database <store> --read-only` process opens the store and returns `["RH-P2-H-1"]`.
3. Writer process #2 (`src/cli.mjs record`) records `RH-P2-H-2` and exits cleanly while the long-lived MCP process remains open.
4. Querying the **same** long-lived MCP process is characterized diagnostically (under `Relate v1.0.1`, it still returns `["RH-P2-H-1"]`).
5. Fresh short-lived `resumeTaskViaReadOnlyMcp` (which spawns a fresh `relate serve --mcp stdio --read-only` process per batch) returns `RH-P2-H-2` immediately.

### Observed Behavior & Mitigation
- **Observed Behavior:** `relate serve --mcp stdio --read-only` behavior is consistent with an open-time snapshot (corroborated at the `@relate/relate` embedded-binding level; `relate serve` internals not inspected).
- **Current Mitigation:** `src/mcp_client.mjs` (`callRelateMcpBatch`) spawns a fresh short-lived `relate serve --mcp stdio --read-only` process per `resume` invocation with bounded timeouts and `SIGKILL` cleanup, so CLI `resume` always observes the latest committed handoff.
- **Limitation for Persistent MCP Hosts:** Any external agent host (e.g., IDE/CLI MCP client) that keeps a single long-lived `relate serve --mcp stdio --read-only` process alive across turns must restart/respawn the MCP server (or invoke `src/cli.mjs resume`) to observe handoffs written after the MCP process started.
