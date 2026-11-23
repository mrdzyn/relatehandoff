# RelateHandoff — Platform Reliability & Adversarial Validation Matrix

- **Task:** `tasks/RH-LOCAL-T4-security-reliability.md` (`RH-LOCAL-T4`, updated for `RH21-01` during `RH-LOCAL-T5` reconciliation)
- **Merged baseline:** `main@cdc73f95dbc243335a46e0e753c0e51ff8107c88` (PR #21 squash merge)
- **Last verified run:** 2026-11-23 (macOS ARM64 local execution)

## Platform Validation Matrix

| Platform | Status on Reconciled `main` | Relate CLI / Engine Coverage | Evidence & Notes |
|---|---|---|---|
| **macOS ARM64** | `VERIFIED` | Real `Relate v1.0.1` (`~/.local/bin/relate`) + `@relate/relate@1.0.1` | Executed on `macOS-27.2.1-arm64-arm-64bit-Mach-O` (`Darwin 27.2.0`), Node.js `v26.7.0`, npm `11.19.0`, Git `2.54.0 (Apple Git-157)`, Python `3.15.2`. Reconciled suite (`main@cdc73f95...` / PR #21 `ddcfc5dd...` & PR #19): `scripts/test_bootstrap.py` PASS, `scripts/validate.py` `8/8 PASS`, `RELATE_REQUIRE_CLI=1 npm test` **`53/53 PASS`** (`0` failed, `0` skipped, combining T3 `test/mcp_integration.test.mjs` and T4 `test/reliability_adversarial.test.mjs`), `npm run test:security` `5/5 PASS`, `npm run build` PASS. *(Historical note: pre-reconciliation `RH-LOCAL-T4` branch run at `d2ba9d7f...` on `main@1a77147e...` executed `49/49 PASS` before T3's 4 tests merged in PR #18.)* |
| **Linux native (x86_64 / arm64)** | `UNVERIFIED` | Not executed on this HEAD | Historical finding from `docs/RELATE-SPIKE.md` and `docs/STATUS.md`: prebuilt `relate-linux-amd64` `v1.0.1` from `relatedb.ai/install.sh` requires `GLIBC_2.39` and fails on Debian 12 (`GLIBC_2.36`), whereas `@relate/relate@1.0.1`, `relate-db@1.0.1` (`manylinux2014`), and source-built `relate-cli v1.0.1` worked on `GLIBC_2.36`. `src/doctor.mjs` checks and reports `GLIBC` mismatches (covered via fake unit test in `test/doctor.test.mjs`). Native Linux re-execution on this HEAD has not been performed. |
| **Windows native** | `UNVERIFIED` | Not executed on this HEAD | Dependency-injected `win32` unit coverage in `test/doctor.test.mjs` (`doctor: supports win32 Path casing and relate.exe`) verifies `Path` casing and `relate.exe` candidate resolution; `test/security.test.mjs` verifies rejection of Windows drive (`C:\...`, `D:/...`) and UNC (`\\server\share\...`) artifact paths in `src/git.mjs`. Native Windows execution with real `git.exe` and `relate.exe` has not been performed. |

## Observed Reconciled Test Suite Breakdown (macOS ARM64)

- `scripts/test_bootstrap.py`: PASS (repository profile, active task allowlist, governance invariants)
- `scripts/validate.py`: `8/8 PASS` (`VERDICT: PASS`, clean working tree)
- `RELATE_REQUIRE_CLI=1 npm test`: **`53/53 PASS`** (`0` fail, `0` skipped; supersedes pre-reconciliation `49/49` count):
  - `spike/relate_spike.test.mjs`: `2/2 PASS` (real `@relate/relate@1.0.1` + real `relate v1.0.1` read-only MCP stdio)
  - `test/doctor.test.mjs`: `14/14 PASS` (unit + real `example-store` + `.git/index` immutability + `win32`/`GLIBC` dependency-injected fakes)
  - `test/e2e_mcp.test.mjs`: `8/8 PASS` (real Relate v1.0.1 E2E, B1–B4 regressions, persistent MCP snapshot characterization, deterministic fake fault injection)
  - `test/lifecycle.test.mjs`: `5/5 PASS` (real Relate v1.0.1 supersession chains, conflict rejections, `list` filters, RH17-01/RH17-02, fake overflow/write-tool rejection)
  - `test/mcp_integration.test.mjs`: `4/4 PASS` (real Relate v1.0.1 `verifyReadOnlyMcpServer` + short-lived fresh read, fake timeout/`SIGKILL`/EOF/duplicate-ID/stderr-redaction, `RH18-01` credential-shaped diagnostic redaction)
  - `test/reliability_adversarial.test.mjs`: `7/7 PASS` (linked Git worktree + detached HEAD `.git/index` immutability, cross-repo isolation, 4 concurrent parallel read-only readers, copied store SHA-256 preservation, deterministic fake MCP faults, 100/101 write & read bounds, fail-closed evidence authenticity)
  - `test/resume_output.test.mjs`: `8/8 PASS` (deterministic JSON/Markdown ordering, escaping/ANSI stripping, real `example-store` integration)
  - `test/security.test.mjs`: `5/5 PASS` (payload validation, traversal/symlink/drive/UNC rejection, secret pattern & sensitive path rejection, client runner-field rejection, 100-row bounds)
- `npm run test:security`: `5/5 PASS`
- `npm run build`: PASS (`node --check` across all `src/`, `scripts/demo.mjs`, `examples/generate_example.mjs`, plus `node src/cli.mjs --help`)

## Reliability & Security Guarantees Proven (macOS ARM64)

1. **Read-only Git index preservation (`--no-optional-locks`):** Both `src/git.mjs` (`getGitState`) and `src/doctor.mjs` invoke `git` with `--no-optional-locks`, preventing opportunistic `.git/index` stat-cache rewrites during `resume`, `list`, and `doctor` across main checkouts, linked Git worktrees (`git worktree add`), and detached HEAD checkouts (`git checkout --detach HEAD`).
2. **Read-only Relate store preservation:** Sequential `resume`, `resume --format markdown`, `list`, `list --format markdown`, and `doctor` executions preserve byte-identical per-file SHA-256 hashes across a copied `examples/example-store`.
3. **Concurrent read-only readers:** Spawning 4 parallel `resume` and `list` child processes simultaneously against one store completes with exit `0`, empty `stderr`, deterministic byte-identical `stdout`, and unchanged store directory and `.git/index` SHA-256 digests.
4. **Repository mismatch & cross-repo isolation:** Two repositories sharing one Relate store cannot cross-read (`resume`, `resume --handoff`, `list`), mismatch `--repo-id`/payload `repository`, or cross-supersede (`record --supersedes`).
5. **Adversarial MCP transport fault tolerance:** Deterministic fake `relate` binaries simulating partial lines without newlines, malformed JSON-RPC lines, malformed `read_cypher` payload JSON, missing response IDs, `SIGKILL` termination, and bounded timeouts all fail closed without hanging.
6. **100-row bounds (`MAX_DETAIL_ROWS = 100`):** Write-time (`recordHandoff` / `validateHandoffPayload`) and read-time (`resumeTaskViaReadOnlyMcp` and `listHandoffsViaReadOnlyMcp` against real Relate v1.0.1 stores) allow 100 rows and fail closed with `BoundExceededError` at 101 rows.
7. **Evidence authenticity fail-closed:** `SELF_ASSERTED` (`PASS`), `RUNNER_RECORDED_UNSIGNED` without `--verify`, and store-tampered `TRUSTED_LOCAL_RUNNER` evidence never produce `AUTHENTICATED` or `VERIFIED`; `FAIL` evidence yields `BLOCKED`; advancing `HEAD` yields `STALE`.

## Known Limitations & Operational Boundaries

- **Cross-platform native execution:** Only macOS ARM64 is `VERIFIED` on this HEAD. Native Linux (including `GLIBC_2.36` vs `GLIBC_2.39` behavior) and native Windows execution remain `UNVERIFIED` on this HEAD until run on those hosts.
- **Unsigned local store:** The local Relate directory store is not a cryptographic signing authority; read-only `resume` without in-process `--verify <profile>` reports `executionAuthenticity: "UNVERIFIED"` for persisted runner evidence.
- **Persistent MCP snapshot scope:** `relate serve --mcp stdio --read-only` serves an open-time snapshot. `src/mcp_client.mjs` spawns a fresh short-lived MCP process per invocation to avoid stale reads; external long-lived MCP host sessions must restart to observe newly recorded handoffs.
