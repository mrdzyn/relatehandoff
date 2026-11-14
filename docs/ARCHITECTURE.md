# RelateHandoff — Proposed Architecture

**Status:** Design proposal for Phase 1. No runtime code or working Relate database has been installed.

## Architecture objective
Make agent context portable across *sessions* on a machine without replacing Git, exposing secrets, or giving a memory cache authority to approve unverified code.

## System boundaries

```text
Agent A (Codex/Claude/Gemini/compatible host)
  -> controlled handoff recorder (validation + redaction + provenance)
  -> Relate durable local DIRECTORY store
  <- read-only Relate MCP stdio -> Agent B
                     |
              local Git checkout (actual HEAD, worktree)
                     |
           GitHub remote (optional read for live PR state)
```

## Proposed stack
| Layer | Initial choice | Rationale |
|---|---|---|
| CLI / recorder | Node.js LTS + TypeScript, to validate with an implementation spike | Broad agent-host compatibility; no initial web/backend deployment |
| Data | Relate directory store with persisted schema | Local embedded graph and read-only concurrent clients |
| Query | Parameterized Cypher | Explicit multi-hop provenance and bounded retrieval |
| Agent access | `relate serve --mcp stdio --database <path> --read-only` | Default-deny writes through consumer interface |
| Evidence source | Local Git plumbing, canonical repo files, task spec | Exact SHA and repository source of truth |
| Remote integration | Optional GitHub metadata reads after permission | Remote status cannot be inferred offline |
| Demo UI | CLI output first, visualization later with approved design | Prioritize a working graph over a mock interface |
| Validation | Inherited Python local-first runner + stack-specific checks to be added | Evidence-backed exact-HEAD development |

Relate syntax/API and package versions must be pinned and verified on the actual target platform during Phase 1. The Phase 0 plan does not claim an installed runtime or working MCP host.

## Candidate graph model
Nodes: `Repository`, `Task`, `Requirement`, `Agent`, `Session`, `Handoff`, `Decision`, `Commit`, `Evidence`, `TestRun`, `Review`, `Artifact`.

Edges: `OWNS_TASK`, `HANDOFF_FOR`, `FROM_AGENT`, `TO_AGENT`, `TARGETS_HEAD`, `IMPLEMENTS`, `PROVEN_BY`, `CITES`, `REVIEWED_AT`, `BLOCKED_BY`, `NEXT_ACTION`.

All claims need source pointers and timestamps. Test/review evidence must be bound to the *exact full Git SHA* it covers. A changed HEAD does **not automatically prove a failure**, only that previous evidence cannot establish freshness for the new HEAD.

## Consistency model
- Git working tree, full HEAD SHA and canonical markdown instructions are authoritative for local state.
- Relate is a derived index; stale or inaccessible data is explicit UNVERIFIED, not silently treated as current.
- A single authorized recorder owns writes; other hosts receive read-only MCP. Directory-based live-read behavior needs actual concurrency tests.
- The store is local-only by default and is **not automatically synchronized** Mac ↔ Windows ↔ cloud.
- A sanitized, small *example store* will be committed for judging in Phase 1, separate from live personal/project stores.

## Security boundaries
1. External agent/tool output is untrusted and cannot grant approvals by writing a graph claim.
2. File and repository paths must remain inside the selected root; reject traversal and unexpected symlink targets.
3. No agent tool receives generic shell execution or writable Cypher by default.
4. Never persist raw credentials, sensitive chat history, environment variables, OAuth tokens, production user data, or private code into the hackathon demo store.
5. Source provenance includes origin, retrieval timestamp, Git SHA, input schema version and optional content hash.
6. Authority remains with owner-approved `AGENTS.md`, active task specification, tests and actual Git/PR evidence.

## Delivery plan
- **P0:** bootstrap a project-mode repository, prune irrelevant packs/history, establish architecture, security and test contracts. No product code.
- **P1:** implement persistence, schema, minimal write recorder, read-only MCP resume, exact-SHA freshness, sanitized persisted example and executable integration tests.
- **P2 (conditional):** interactive visualization/skills graph after written screen requirements and owner design approval; audit/report polish.
- **P3:** reproducible judge setup, license confirmation, capture real demo, submit.

## Release
No production deployment, hosted account, signing, secret or billing integration is planned. Deliver source and local installation instructions only after objective-based tests and human approval.
