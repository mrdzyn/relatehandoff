# RH-P2 Real-Agent Codex-to-Claude Handoff Proof & MCP Snapshot Finding

## 1. Post-Merge Baseline
- **Merged PR #3 (`main`):** `f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd` (`2026-11-16T17:23:22Z`)
- **Follow-up branch:** `phase-2/real-agent-handoff-followup` (timestamped `2026-11-16T18:31:25-08:00` / `2026-11-17T02:31:25Z`)
- **Immutability:** Historical RH-P0/RH-P1 records and `examples/example-store/` were not mutated.

## 2. Sanitized Real-Agent Handoff Summary (macOS ARM64)
- **Platform & Engine:** macOS ARM64 (`Relate v1.0.1`, read-only MCP stdio)
- **Agents:** `codex` (writer process via `src/cli.mjs record`) → `claude` (consumer via `relate serve --mcp stdio --read-only`)
- **Observed Outcome:**
  1. Codex recorded a schema-validated handoff with repository-scoped provenance (`Repository -> Task <- Handoff -> Commit`, `Artifact`, `Decision`, `Evidence`) into the local Relate directory store.
  2. Claude retrieved the handoff and provenance through read-only MCP (`read_cypher` / `get_schema`), verifying exact-HEAD freshness separation (`metadataFreshness` vs `executionAuthenticity`) and confirming write operations remain refused in `--read-only` mode.
  3. **Operational Finding:** When Claude's MCP host kept a **long-lived** `relate serve --mcp stdio --database <store> --read-only` process open across turns, a newly recorded handoff written by a separate Codex process was **not visible** until the MCP server process was restarted.

## 3. Reproduced Long-Lived MCP Reader Limitation (Linux x86_64, `Relate v1.0.1`)
Reproduced against `/home/antigravity/.cargo/bin/relate` (`Relate v1.0.1`) and automated in `test/e2e_mcp.test.mjs` (`RH-P2 regression (long-lived MCP snapshot)`):

1. Writer process #1 (`src/cli.mjs record`) records `H-1` and exits, releasing the write lock.
2. A long-lived `relate serve --mcp stdio --database <store> --read-only` process opens the store and returns `[{ id: "H-1" }]`.
3. Writer process #2 (`src/cli.mjs record`) records `H-2` and exits cleanly while the long-lived MCP process remains open.
4. Querying the **same** long-lived MCP process still returns `[{ id: "H-1" }]`.
5. Restarting `relate serve --mcp stdio --database <store> --read-only` (or calling `resumeTaskViaReadOnlyMcp`, which spawns a fresh short-lived read-only MCP process per batch) returns `H-2`.

### Root Cause & Mitigation
- **Root Cause:** `relate serve --mcp stdio --read-only` opens the Relate directory store **once at startup** with no writer lease and serves `read_cypher` queries against that startup snapshot without reloading newly checkpointed Parquet/WAL files from disk.
- **Current Mitigation:** `src/mcp_client.mjs` (`callRelateMcpBatch`) spawns a fresh short-lived `relate serve --mcp stdio --read-only` process per `resume` invocation, so CLI `resume` always observes the latest committed handoff.
- **Limitation for Persistent MCP Hosts:** Any external agent host (e.g., IDE/CLI MCP client) that keeps a single long-lived `relate serve --mcp stdio --read-only` process alive across turns must restart/respawn the MCP server (or invoke `src/cli.mjs resume`) to observe handoffs written after the MCP process started.
