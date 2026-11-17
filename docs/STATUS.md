# Project Status

## Project
- **Name:** RelateHandoff
- **Current phase:** RH-P2 — real-agent Codex-to-Claude handoff follow-up (post-PR #3 merge)
- **Status:** PR #3 squash-merged to `main` (`f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd`, `2026-11-16T17:23:22Z`). RH-P2 real-agent Codex-to-Claude handoff succeeded on macOS ARM64 using Relate `v1.0.1` and read-only MCP (documented in `docs/RH-P2-REAL-AGENT-PROOF.md`). Follow-up branch `phase-2/real-agent-handoff-followup` adds sanitized proof docs, reproduces why a long-lived `relate serve --mcp stdio --read-only` process misses external writes until restart, and adds a targeted regression test. Pending independent audit and owner merge approval.
- **Primary branch:** `main`
- **Approved Phase 0 merged baseline:** `7e21fcebc0192ee6f6fecd553ef3619b9ea7465b` (PR #1 squash merge, audited input PR HEAD `3a32213394d762ab33928ed939fc65756d2320db`)
- **Phase 1 handoff merged baseline:** `7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf` (PR #2 squash merge)
- **Approved Phase 1 merged baseline:** `f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd` (PR #3 squash merge, `2026-11-16T17:23:22Z`)
- **Working branch:** `phase-2/real-agent-handoff-followup`
- **Active task:** `tasks/RH-P1-relate-handoff-mvp.md` (post-merge RH-P2 follow-up)
- **Active handoff:** RH-P1-H1

## Completed foundation
- Created a new project-mode repository from `mrdzyn/ai-native-project-template`; pruned unselected optional packs and inherited master history.
- Owner-reported Mac: local validation 7/7 PASS plus separate `test_entrypoints.py` PASS at PR #1 exact HEAD.
- Claude's independent Linux re-audit: PASS at the identical exact HEAD, including five documented commands; published in [PR #1 audit](https://github.com/mrdzyn/relatehandoff/pull/1#issuecomment-6893352785).
- GitHub confirmed PR #1 squash-merged (`7e21fcebc0192ee6f6fecd553ef3619b9ea7465b`), PR #2 squash-merged (`7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf`), and PR #3 squash-merged (`f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd`).
- Verified Relate `v1.0.1` (`Apache-2.0` + Neo4j Labs experimental disclaimer), `@relate/relate@1.0.1` (Node.js), `relate-db@1.0.1` (Python), persistent directory store layout, cross-process read-only retrieval, and read-only write refusal (see `docs/RELATE-SPIKE.md`).
- Implemented `src/schema.mjs`, `src/git.mjs`, `src/attestation.mjs`, `src/freshness.mjs`, `src/recorder.mjs`, `src/mcp_client.mjs`, and `src/cli.mjs` with live E2E MCP tests (`test/e2e_mcp.test.mjs`) and security negative tests (`test/security.test.mjs`).
- Remediated Claude's four merge blockers B1–B4 and follow-up B4 forgery finding on Draft PR #3:
  - **B1 (Portable fixture):** Committed `examples/example-store/wal/00000002.log` via `.gitignore` negation and `.gitattributes` (`-text`) so clean clones open `examples/example-store` read-only without regeneration.
  - **B2 (Immutable provenance):** Scoped graph keys (`Repository::Task::Handoff::Decision/Evidence`), idempotent identical replay, and fail-closed `HandoffConflictError` on conflicting handoff IDs plus duplicate ID rejection.
  - **B3 (Repo/checkout isolation):** Enforced `gitState.repository` (origin URL / `relatehandoff.repository` / `--repo-id`), `branch`, and `headSha` validation in `record` and strict `r.name = $repository` filtering in `resume`.
  - **B4 (Evidence authenticity & honest durability):** Rejected client-supplied runner/trust fields (`executionMode != SELF_ASSERTED`, `validationProfile`, `exitCode`, `attestationSha256`) at `record` ingress; enforced clean Git state before and after `--verify <profile>` (`shell: false`); required `>= 1` executed passing test with 0 failures/skips in TAP output (`--test-reporter=tap`, stripping `NODE_TEST_CONTEXT`) so 0-test runs yield `UNVERIFIED` rather than `PASS`/`VERIFIED`; persisted `RUNNER_RECORDED_UNSIGNED` (unkeyed SHA-256 is consistency-only, not a cryptographic credential); prevented persisted unsigned/injected store rows from ever producing `AUTHENTICATED` or `VERIFIED` on read alone; and added optional in-process `resume --verify <profile>` without altering the read-only MCP boundary.
  - **Follow-up & write-time hardening:** Enforced shared `MAX_DETAIL_ROWS = 100` at both `record` write time and `resume` read time (`LIMIT 101`, `BoundExceededError`); added Windows drive/UNC and symlink-parent traversal checks (`src/git.mjs`); and rejected `.aws/credentials`/`.npmrc`/`secrets.json` (`src/schema.mjs`).
- Updated `config/validation-contract.json` so mandatory `test`, `build`, and `security` categories execute real Node.js + Relate + MCP checks without allowing skipped MCP tests to pass.
- Added reproducible fixture generator (`examples/generate_example.mjs`, `examples/synthetic_handoff.json`), committed portable synthetic store (`examples/example-store/`), demo script (`scripts/demo.mjs`), and judge walkthrough (`docs/JUDGE-WALKTHROUGH.md`).
- **RH-P2 real-agent follow-up (`2026-11-16T18:31:25-08:00`):** Documented sanitized macOS ARM64 Codex-to-Claude handoff proof (`docs/RH-P2-REAL-AGENT-PROOF.md`) and reproduced + added regression test for the long-lived `relate serve --mcp stdio --read-only` startup snapshot limitation (`test/e2e_mcp.test.mjs`).
- No release, hosted deployment, or RelateHandoff product licensing decision included.

## Active scope and blockers
- **Linux GLIBC finding:** prebuilt `relate-linux-amd64` `v1.0.1` from `relatedb.ai/install.sh` requires `GLIBC_2.39` and fails on Debian 12 (`GLIBC_2.36`). `@relate/relate@1.0.1` (Node.js), `relate-db@1.0.1` (Python manylinux2014), and source-built `relate-cli` work on `GLIBC_2.36`.
- **Long-lived read-only MCP snapshot limit:** `relate serve --mcp stdio --database <store> --read-only` opens a point-in-time snapshot at startup and does not reload external disk writes until restarted. `src/mcp_client.mjs` spawns a fresh short-lived MCP process per `resume`, but persistent MCP host sessions must restart to observe newly recorded handoffs.
- **Unsigned local store limit:** The local Relate directory store is unsigned; read-only `resume` without `--verify` reports `executionAuthenticity: "UNVERIFIED"` (`UNSIGNED_LOCAL_STORE_EVIDENCE`) even when `metadataFreshness` is `"CURRENT"`. Independent cryptographic verification of persisted evidence requires an external signing authority (out of RH-P1 scope).
- Keep consumer MCP read-only, local Git canonical, source/evidence provenance explicit, and all private code, transcripts and secrets outside public demo fixtures.
- Product licensing, hackathon packaging, optional hosted CI and repository ruleset remain unverified or pending owner action.

## Next authorized action
Conduct independent exact-HEAD audit of Draft PR #4 on `phase-2/real-agent-handoff-followup` and obtain separate human owner merge approval before marking ready or merging. No automatic merge, deployment, publication or release.

## Verification truth
- GitHub PR #1 (`7e21fcebc0192ee6f6fecd553ef3619b9ea7465b`), PR #2 (`7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf`), and PR #3 (`f759f40ef19ecd3ca5ee5e7cc42152561ccddfcd`) merges and `main` baseline: VERIFIED.
- Owner-reported macOS ARM64 RH-P2 real-agent Codex-to-Claude handoff using Relate `v1.0.1` + read-only MCP: VERIFIED (sanitized summary in `docs/RH-P2-REAL-AGENT-PROOF.md`).
- Relate `v1.0.1` `@relate/relate` cross-process persistence + read-only enforcement (`spike/relate_spike.test.mjs`): VERIFIED PASS on Linux x86_64 (`GLIBC_2.36`).
- Prebuilt `relate` CLI `v1.0.1` binary on Debian 12 (`GLIBC_2.36`): BLOCKED (`GLIBC_2.39` required).
- Source-built `relate-cli v1.0.1` live read-only MCP E2E & B1–B4 + forgery/bounds/zero-test/long-lived-MCP-snapshot regressions (`test/e2e_mcp.test.mjs`, 14/14 `npm test` with `RELATE_REQUIRE_CLI=1`, 0 skipped): VERIFIED PASS.
- Security negative tests (`test/security.test.mjs`: malformed payloads, duplicate IDs, forged runner fields, 100/101 bounds, path/Windows/symlink/symlink-parent traversal, secret patterns): VERIFIED PASS.
- Reproducible demo (`npm run demo` / `scripts/demo.mjs`): VERIFIED PASS.
