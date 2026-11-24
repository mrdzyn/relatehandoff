# RelateHandoff — Local Stdio MCP Integration Guide

RelateHandoff exposes read-only graph queries over local stdio MCP using Relate `v1.0.1` (`relate serve --mcp stdio --database <abs-store> --read-only`). Consumer MCP clients **cannot** mutate the Relate store; writes occur only through the validated `relatehandoff record` writer.

## Verified Read-Only Command

Every local MCP host integration uses the exact same read-only stdio command:

```text
relate serve --mcp stdio --database /ABS/PATH/TO/relate-store --read-only
```

Verify your environment and store first:

```bash
node src/cli.mjs doctor --repo . --store /ABS/PATH/TO/relate-store
```

## Client Integration Recipes

> **Host configuration note:** The underlying `relate serve --mcp stdio --database <abs-store> --read-only` command and its read-only tool behavior (`read_cypher`, `get_schema`; `write_cypher` omitted and refused) are verified directly on macOS ARM64 with Relate `v1.0.1`. Host-specific MCP client UIs/config formats should be verified against your installed version of each client.

### 1. Claude Code
Add a project or user stdio MCP entry via `claude mcp add` (or `.mcp.json`):

```bash
claude mcp add relatehandoff-ro -- relate serve --mcp stdio --database /ABS/PATH/TO/relate-store --read-only
```

Equivalent `.mcp.json` snippet:

```json
{
  "mcpServers": {
    "relatehandoff-ro": {
      "command": "relate",
      "args": ["serve", "--mcp", "stdio", "--database", "/ABS/PATH/TO/relate-store", "--read-only"]
    }
  }
}
```

### 2. Codex CLI
Register the read-only stdio server in `~/.codex/config.toml` (or via `codex mcp add`):

```toml
[mcp_servers.relatehandoff-ro]
command = "relate"
args = ["serve", "--mcp", "stdio", "--database", "/ABS/PATH/TO/relate-store", "--read-only"]
```

### 3. Gemini CLI / Antigravity
In `~/.gemini/settings.json` (or workspace MCP settings where stdio MCP servers are supported):

```json
{
  "mcpServers": {
    "relatehandoff-ro": {
      "command": "relate",
      "args": ["serve", "--mcp", "stdio", "--database", "/ABS/PATH/TO/relate-store", "--read-only"]
    }
  }
}
```

## Snapshot Freshness & Restart Workflow (Important)

Relate `v1.0.1`'s `relate serve --mcp stdio --database <path> --read-only` retains an **open-time snapshot** of the directory store. A long-lived MCP server process does **not** automatically reload external `relatehandoff record` writes performed after the server started.

Use one of these two reliable workflows:
1. **Short-lived CLI reads (recommended for agent handoffs):** run `node src/cli.mjs resume --store <dir> --repo <dir> --task <taskId> --format markdown` or `node src/cli.mjs list --store <dir> --repo <dir>`. Each invocation spawns a bounded short-lived `relate serve --mcp stdio --read-only` process with `shell: false` and `SIGKILL` timeout cleanup, so it always observes the latest committed store state.
2. **Explicit MCP server restart in persistent hosts:** after running `relatehandoff record` in another terminal/agent, restart or reconnect the `relatehandoff-ro` MCP server in Claude Code / Codex CLI / Gemini CLI before re-querying. Never assume automatic live reload across a persistent stdio MCP session.

## Read-Only & Timeout Guarantees (`src/mcp_client.mjs`)

- `callRelateMcpBatch` enforces `shell: false`, integer `timeoutMs` in `[100, 120000]`, `killSignal: "SIGKILL"`, and bounded `maxBuffer` (`10 MiB`).
- Fails closed on unexpected EOF (empty stdout), truncated/malformed JSON-RPC lines, non-object JSON-RPC payloads, duplicate response IDs, missing response IDs, and `stderr` secret leakage (redacted via `sanitizeDiagnosticText`).
- `verifyReadOnlyMcpServer` probes `initialize`, `tools/list`, `tools/call write_cypher`, and `tools/call read_cypher` (`CREATE ...`) to prove write refusal.
