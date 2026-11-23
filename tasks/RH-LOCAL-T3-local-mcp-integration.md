# RH-LOCAL-T3 — Local MCP Integration

- **Status:** In progress (`feat/rh-local-t3-mcp-integration` from `main@1a77147e3bb237d94ee3d4e4e5f5d5907be55c70`)
- **Owner/orchestrator:** project owner (`mrdzyn`)
- **Primary branch:** `main`
- **Working branch:** `feat/rh-local-t3-mcp-integration`

## Objective
Harden local stdio MCP client reliability (`src/mcp_client.mjs`) for timeouts, incomplete/malformed JSON-RPC responses, unexpected EOF, secret-safe error diagnostics, and process cleanup; add an explicit read-only MCP server verification probe (`verifyReadOnlyMcpServer`); and document verified local stdio MCP integration recipes and snapshot-refresh workflows for Claude Code, Codex CLI, and Gemini CLI / Antigravity.

## Delivery mode / UI design gate
- **Material user-facing UI:** No (CLI/MCP transport & integration docs only).
- **UI design gate:** Not applicable (`capabilities.design=false`).

## Allowed scope
- `tasks/RH-LOCAL-T3-local-mcp-integration.md`
- `scripts/test_bootstrap.py` (one allowlist entry for this task)
- `src/mcp_client.mjs`
- `package.json` (`test` script entry for `test/mcp_integration.test.mjs`)
- `test/mcp_integration.test.mjs`
- `docs/LOCAL-MCP-INTEGRATION.md`
- `docs/STATUS.md`
- `docs/HANDOFFS.md` (append-only)

## Forbidden scope
- Any hosted RH-P5 implementation, `cloud/`, Cloudflare resources, OAuth, remote MCP endpoint, or deployment.
- Any weakening of `read_only` MCP enforcement, `write_cypher` rejection, repository isolation, or `MAX_DETAIL_ROWS = 100` bounds.
- Any modification to `config/project-profile.json`, `docs/PRODUCT.md`, or `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] `callRelateMcpBatch` validates `timeoutMs` (`100..120000`), enforces `shell: false`, `killSignal: "SIGKILL"`, `maxBuffer`, redacts `stderr` diagnostics, and fails closed on unexpected EOF, non-object JSON-RPC lines, and duplicate response IDs.
- [x] `verifyReadOnlyMcpServer` verifies real `relate serve --mcp stdio --database <store> --read-only` exposes `read_cypher`, omits `write_cypher`, refuses `tools/call write_cypher`, and refuses `tools/call read_cypher` write queries (`CREATE ...`).
- [x] `docs/LOCAL-MCP-INTEGRATION.md` documents verified stdio MCP recipes for Claude Code, Codex CLI, and Gemini CLI / Antigravity, plus Relate v1.0.1's open-time snapshot limitation and explicit fresh-read / restart workflows (never claiming automatic refresh).
- [x] `test/mcp_integration.test.mjs` passes real Relate v1.0.1 read-only verification + deterministic `(fake)` timeout/EOF/malformed/duplicate-ID/stderr-redaction tests.
- [x] Exact-HEAD canonical validation (`scripts/test_bootstrap.py`, `scripts/validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test`, `npm run test:security`, `npm run build`) passes.
