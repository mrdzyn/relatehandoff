# RH-P1 Relate Integration Spike Findings

- **Date:** 2026-11-15
- **Branch:** `phase-1/relate-handoff-mvp` (branched from `main` at `7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf`)
- **Platform tested:** Linux x86_64 (Debian 12, `GLIBC 2.36`), Node.js `v24.22.2`, Python `3.11.2`, Rust `1.99.1`

## Summary

The smallest real Relate integration spike succeeded with zero mocks:
1. Verified Relate `v1.0.1` (`Apache-2.0` license; experimental Neo4j Labs project per `LABS_DISCLAIMER.txt`).
2. Verified persistent local **directory store** creation, parameterized Cypher write, checkpoint, process exit, and separate-process read-only retrieval + write refusal using `@relate/relate@1.0.1` (Node.js) and `relate-db@1.0.1` (Python).
3. Verified **concurrent** read-only retrieval (`Database.open(path, { readOnly: true })`) while a writer process holds the directory store open.
4. Verified **read-only MCP stdio** (`relate serve --mcp stdio --database <path> --read-only`) exposes only `read_cypher` and `get_schema`, executes parameterized Cypher reads, refuses writes sent to `read_cypher`, and rejects `write_cypher` as an unknown tool.

## Verified Installation & Platform Findings

| Component | Version | Install Command / Source | Debian 12 (`GLIBC 2.36`) Behavior |
|---|---|---|---|
| Node.js binding | `@relate/relate@1.0.1` | `npm install @relate/relate` | **PASS** — native binding loads and executes Cypher in-process. |
| Python binding | `relate-db@1.0.1` | `pip install relate-db` (`manylinux2014_x86_64`) | **PASS** — imports `relate` and reads/refuses writes on Node-created directory store. |
| Prebuilt CLI binary | `relate v1.0.1` | `curl -sSfL https://relatedb.ai/install.sh \| bash` | **FAIL on GLIBC 2.36** — binary verified ED25519 + SHA256, but fails at runtime with `GLIBC_2.39 not found`. |
| Source-built CLI | `relate-cli v1.0.1` | `cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli` | **PASS** — `relate --version` prints `Relate v1.0.1 / License: Apache 2.0 (binary)`. |

## Verified API & Storage Behavior

- **Node.js (`@relate/relate@1.0.1`):**
  - `Database.open(storeDir)` opens or creates a directory store.
  - `Database.open(storeDir, { readOnly: true })` opens an existing directory store read-only.
  - `db.connect()` returns a `Connection` with `query(cypher, params)`, `queryAsync`, `begin()`, `commit()`, `rollback()`, `setNamespace()`.
  - `db.checkpoint()` flushes WAL state to snapshot files.
  - **API quirk:** `Database` does **not** expose `db.close()`; handle cleanup occurs on process exit / garbage collection.
- **Directory store layout:** `manifest.json`, `nodes/`, `relationships/`, `wal/`, `.cypherlite/`, `.cypherlite.lock`, `.cypherlite.writer`.
- **Read-only enforcement:**
  - Embedded Node.js / Python read-only connections throw `semantic error: WriteOnReadOnlyAccessDatabase: No write operations are allowed on this database. The database is in read-only mode on this Neo4j instance.`
  - `relate serve --mcp stdio --database <dir> --read-only`:
    - `tools/list` returns `["read_cypher", "get_schema"]` (`write_cypher` is omitted).
    - `read_cypher` with `CREATE ...` returns `isError: true` (`Only MATCH queries are allowed for read-query`).
    - `write_cypher` returns `isError: true` (`unknown tool 'write_cypher'`).

## Executable Evidence

Commands run on `phase-1/relate-handoff-mvp`:

```bash
npm install
npm run test:spike
# With source-built relate CLI on PATH / /tmp/relate-cargo/bin/relate:
RELATE_REQUIRE_CLI=1 npm run test:spike
```

Observed results (`spike/relate_spike.test.mjs`):
- `RH-P1 spike: synthetic graph persists across process restart and enforces read-only retrieval` — **PASS**
- `RH-P1 spike: Relate MCP stdio server enforces read-only tools and refuses writes` — **PASS** (when runnable `relate` CLI is present; skips with explicit GLIBC 2.39 diagnostic if absent unless `RELATE_REQUIRE_CLI=1`).

## Implications for Next RH-P1 Steps

- Node.js (`@relate/relate@1.0.1`) is a viable primary recorder/CLI runtime on Linux (`GLIBC >= 2.36`) without requiring `GLIBC_2.39`.
- For `relate serve --mcp stdio` on older Linux distributions (`GLIBC < 2.39`, such as Debian 12), document either building `relate-cli v1.0.1` from source with Cargo or running on a host with `GLIBC >= 2.39` / macOS / Windows.
