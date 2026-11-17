# RelateHandoff — RH-P3 Planning Proposal

- **Status:** Draft Proposal (Planning only — implementation, publication, release, and submission are NOT authorized)
- **Verified `main` baseline:** `f451b75acb3b85191886da3b2504822dcc60c2f5` (PR #5 squash merge)
- **Planning branch:** `docs/rh-p3-planning`
- **Alignment:** Respects `docs/ARCHITECTURE.md` P3 direction (*"reproducible judge setup, license confirmation, capture real demo, submit"*) and `docs/HACKATHON.md` submission controls.

---

## 1. Executive Summary & Scope Alignment

RH-P1 delivered the local-first Relate handoff recorder, read-only MCP consumer, exact-HEAD freshness/authenticity engine, portable `examples/example-store/`, security negative tests, and `scripts/demo.mjs`. RH-P2 (PR #4) added the sanitized `OWNER-REPORTED` macOS ARM64 Codex-to-Claude proof (`RH-P2-CODEX-CLAUDE-1`), bounded MCP subprocess/RPC timeouts with `SIGKILL` cleanup, `(fake)` fault-injection tests, and characterization of the long-lived `relate serve --mcp stdio --read-only` startup snapshot behavior.

### Baseline P3 Scope (from `docs/ARCHITECTURE.md`)
1. Reproducible clean-machine judge setup across supported platforms.
2. Open-source license confirmation and third-party attribution review.
3. Judge-ready demo verification and capture (1–2 minute real Relate walkthrough).
4. Submission readiness verification against `docs/HACKATHON.md` (actual submission remains an explicit owner action).

### Proposed Scope Additions Requiring Explicit Owner Approval
The following items go beyond the minimal P3 line in `docs/ARCHITECTURE.md` and are **not** authorized unless explicitly approved by the owner:
- **S1 — Persistent MCP Reader Wrapper (`Option C` below):** Implementing a lightweight read-only MCP stdio proxy/wrapper that refreshes backend `relate` sessions for long-lived IDE/CLI MCP hosts (if Option B's per-command spawn + host-restart guidance is deemed insufficient for judges/users).
- **S2 — `docs/PRODUCT.md` & `docs/ARCHITECTURE.md` Status Sync:** Updating stale Phase 0/Phase 1 status statements in `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` (exact proposed edits listed in §7) while preserving historical rationale.
- **S3 — Optional Hosted CI Workflow Alignment:** Reviewing `.github/workflows/ci.yml` vs local-first validation (deferred unless owner requests GitHub Actions changes).

---

## 2. Technical & Operational Plan

### 2.1 Reproducible Clean-Machine Installation
- Target platforms: **macOS ARM64** (primary judge/developer workstation) and **Linux x86_64** (CI/audit/container environments). Windows native / WSL2 remains undocumented/untested unless explicitly added to scope.
- Prerequisites to pin and document clearly in `README.md`:
  - Node.js 24 LTS (`npm ci` installs `@relate/relate@1.0.1`)
  - Python 3.11+ (for `scripts/validate.py` and canonical checks)
  - Git 2.30+
  - `relate` CLI `v1.0.1` (`relate serve --mcp stdio --read-only`)
- Clean-clone verification flow:
  1. `git clone` -> `npm ci`
  2. `npm run build` & `npm run test:security`
  3. `npm test` (`RELATE_REQUIRE_CLI=1`)
  4. `npm run demo`
  5. `node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1` (verifies committed portable store opens read-only without regeneration).

### 2.2 Real Relate CLI Dependencies & Linux GLIBC Compatibility
- **Observed constraint:** Prebuilt `relate-linux-amd64` `v1.0.1` from `relatedb.ai/install.sh` requires `GLIBC_2.39` and fails on Debian 12 (`GLIBC_2.36`). Meanwhile, `@relate/relate@1.0.1` (Node.js), `relate-db@1.0.1` (Python `manylinux2014`), and source-built `relate-cli v1.0.1` run on `GLIBC_2.36`.
- **RH-P3 plan:**
  - Document the `GLIBC_2.39` requirement vs `GLIBC_2.36` fallback (building `relate-cli v1.0.1` from source with Rust/Cargo, or running on Ubuntu 24.04+ / macOS ARM64).
  - Keep `resolveRelateCli` fail-closed when `RELATE_REQUIRE_CLI=1` and ensure error messages clearly report missing binary vs `GLIBC` / spawn failure without silent mock fallback.

### 2.3 Persistent MCP Reader Freshness — Architecture Evaluation
`relate serve --mcp stdio --database <store> --read-only` opens a point-in-time snapshot at startup; external writes committed by a separate `src/cli.mjs record` process are not visible to an already-running `relate serve` process until restarted.

| Criterion | Option A: Restart Existing Reader | Option B: Fresh Short-Lived Read-Only MCP Processes (Current `src/mcp_client.mjs`) | Option C: Persistent Read-Only Wrapper with Refreshed Backend Sessions |
|---|---|---|---|
| **Freshness guarantee** | Stale until host/user manually restarts MCP server | **Always current** per `resume` / batch call | **Always current** per tool call (wrapper spawns/refreshes short-lived `relate serve --read-only` or reopens on store change) |
| **MCP host compatibility** | Poor for multi-agent workflows; confuses long-lived IDE/CLI hosts | Works for CLI `resume`; does **not** help external MCP hosts that hold one stdio connection | **Best** for external IDE/CLI MCP hosts (Codex, Claude Code, Cursor) |
| **Latency & overhead** | Zero per-call spawn, but wrong/stale answers | One `relate serve` spawn per batch (~100–400ms on SSD) | Same spawn cost per `tools/call` unless cached by WAL/manifest mtime |
| **Failure & cleanup risk** | Low, single child | Bounded (`timeoutMs` + `SIGKILL` in `callRelateMcpBatch`) | Higher: wrapper must manage child lifecycle, `SIGKILL` cleanup, and stdio framing without leaks |
| **Security & read-only boundary** | Preserved (`--read-only`) | Preserved (`--read-only`, `write_cypher` rejected) | Must preserve `--read-only` and `tools/list` filtering; adds a new surface to audit |
| **Implementation complexity** | Docs-only | Already implemented | New code + E2E + fault-injection tests |

**Recommendation:**
1. **Default for RH-P3:** Keep **Option B** (`src/mcp_client.mjs` fresh short-lived `relate serve --read-only` per batch) as the canonical CLI/automation path, and document **Option A** (explicit host restart / using `src/cli.mjs resume`) as a known limitation for external long-lived MCP hosts.
2. **Optional Scope Addition (S1, requires owner approval):** Only if real-agent IDE/CLI MCP host UX is a P3 requirement, implement **Option C** as a strictly `--read-only` stdio wrapper (`src/mcp_proxy.mjs`) that forwards `initialize`/`tools/list` and spawns a bounded short-lived `relate serve --read-only` per `tools/call`, with full `(fake)` fault-injection and orphan-process tests.

### 2.4 Security, Repository Isolation, Evidence Authenticity & Privacy
- **Non-negotiable invariants (no relaxation permitted):**
  - Consumer MCP remains `--read-only` (`write_cypher` refused).
  - Repository isolation (`r.name = $repository`, `gitState.repository`, `branch`, `headSha` checks).
  - `MAX_DETAIL_ROWS = 100` enforced at both `record` write time and `resume` read time (`LIMIT 101`).
  - `SELF_ASSERTED` and `RUNNER_RECORDED_UNSIGNED` never yield `AUTHENTICATED` or `VERIFIED` on read alone; only live clean-tree `--verify <profile>` with `>= 1` executed passing test yields `AUTHENTICATED`.
  - Path/symlink/Windows-drive traversal checks and secret-filename/pattern rejection remain intact.
  - No private paths, transcripts, credentials, or production datasets in `examples/` or docs.

### 2.5 Judge-Ready Demo & Observable Acceptance Criteria
- `scripts/demo.mjs` and `docs/JUDGE-WALKTHROUGH.md` already demonstrate all 7 core behaviors end-to-end against real `Relate v1.0.1`:
  1. Record at `SHA-A` with `--verify node-test-suite` -> `RUNNER_RECORDED_UNSIGNED`
  2. Read-only MCP `resume` without `--verify` -> `CURRENT` metadata, `UNVERIFIED` authenticity
  3. Read-only MCP `resume --verify node-test-suite` -> `VERIFIED` / `AUTHENTICATED`
  4. Advance to `SHA-B` -> `STALE`
  5. Self-asserted `PASS` / missing evidence -> `UNVERIFIED`
  6. Failed evidence -> `BLOCKED`
  7. MCP `CREATE` / `write_cypher` -> refused (`isError: true`)
- **RH-P3 acceptance criteria:** Clean-clone execution of `npm run demo` and `examples/example-store` lookup succeeds in <= 2 minutes with sanitized, reproducible output; 1–2 minute video script matches actual CLI output without fabricated claims.

### 2.6 Open-Source Licensing & Third-Party License Review
- Repository currently has **no `LICENSE` file** (`docs/HACKATHON.md` item: *"Decide and add a compatible license after owner review"*).
- Third-party dependencies to attribute in `NOTICE` / `README.md`:
  - `@relate/relate@1.0.1` and `relate` CLI (`Apache-2.0` + Neo4j Labs experimental disclaimer)
  - `mrdzyn/ai-native-project-template` (project scaffold)
  - `jexp/relate-ideas` (`CC-BY-4.0`, conceptual inspiration only; no files copied)

### 2.7 Documentation, Distribution & Submission Readiness
- Verify `docs/HACKATHON.md` checklist items:
  - Official Devpost rules (`https://relate.devpost.com/rules`) checked for final non-placeholder license and GitHub topic requirements.
  - `README.md` prerequisites, install steps, exact commands, expected outputs, and `examples/example-store/` path verified on a fresh clone.
  - 1–2 minute demo video recorded from real `Relate v1.0.1` execution.

---

## 3. Proposed Phased Tasks (Small & Independently Reviewable)

| Task ID | Title | Allowed Scope | Acceptance Criteria | Minimum Test Evidence | Validation Environments |
|---|---|---|---|---|---|
| **RH-P3-T1** | Clean-Machine Install, GLIBC Docs & Stale-Doc Sync | `README.md`, `docs/JUDGE-WALKTHROUGH.md`, `docs/PRODUCT.md` (if S2 approved), `docs/ARCHITECTURE.md` (if S2 approved) | Clean-clone setup instructions work verbatim; Linux `GLIBC_2.39` vs `GLIBC_2.36` documented; stale Phase 0/1 text updated without rewriting history | `scripts/validate.py`, `npm run demo`, clean-clone dry run | macOS ARM64 + Linux x86_64 (`GLIBC_2.36` & `GLIBC_2.39`) |
| **RH-P3-T2** *(Conditional on S1)* | Persistent Read-Only MCP Wrapper | `src/mcp_proxy.mjs` (new), `src/cli.mjs`, `test/e2e_mcp.test.mjs` | Long-lived MCP host sees external `record` writes immediately; `--read-only` and `SIGKILL` bounds preserved; zero orphan processes | `npm test` (`RELATE_REQUIRE_CLI=1`), `(fake)` fault-injection tests, `ps` orphan check | macOS ARM64 + Linux x86_64 |
| **RH-P3-T3** | Open-Source License & Attribution | `LICENSE`, `NOTICE` (or `THIRD_PARTY_LICENSES.md`), `README.md` | Owner-selected license added; `@relate/relate`, `ai-native-project-template`, and `jexp/relate-ideas` attributed accurately | `scripts/check_secret_tracking.py`, `scripts/validate.py` | Linux x86_64 / macOS ARM64 |
| **RH-P3-T4** | Judge Demo & Submission Readiness Verification | `docs/HACKATHON.md`, `docs/STATUS.md`, `scripts/demo.mjs` (only if output/UX polish needed) | All non-submission items in `docs/HACKATHON.md` checked; `npm run demo` and `examples/example-store` verified on clean clone; video script/capture ready | `scripts/validate.py`, `npm test`, `npm run demo`, `npm run test:security` | macOS ARM64 (real CLI) + Linux x86_64 |

---

## 4. Proposed Corrections for Stale Phase 0/1 Text in `PRODUCT.md` & `ARCHITECTURE.md`

*(Proposed for `RH-P3-T1` upon owner approval of S2; historical decisions are preserved rather than rewritten as if always implemented.)*

1. **`docs/PRODUCT.md`:**
   - Line 7: `- **Stage:** Phase 0 planning / repository initialization; implementation not started` -> Update to reflect `RH-P1/RH-P2 implemented and merged to main; RH-P3 distribution/submission preparation` (preserving Phase 0 origin in `docs/STATUS.md`).
   - Line 18: `## MVP promise (Phase 1 target, not yet implemented)` -> `## MVP promise (delivered in RH-P1; hardened in RH-P2)`.
   - Line 46: `Phase 0 creates documentation and verification contracts only.` -> `Phase 0 created documentation and verification contracts only; Phase 1–2 implemented and hardened the local Relate recorder and read-only MCP client.`

2. **`docs/ARCHITECTURE.md`:**
   - Line 3: `**Status:** Design proposal for Phase 1. No runtime code or working Relate database has been installed.` -> `**Status:** Implemented in RH-P1 (`src/`) and hardened in RH-P2 against `Relate v1.0.1` / `@relate/relate@1.0.1` (original Phase 1 design proposal preserved below).`
   - Line 24: `Node.js LTS + TypeScript, to validate with an implementation spike` -> Note that RH-P1 selected **Node.js ESM (`src/*.mjs`)** with `@relate/relate@1.0.1` (no TypeScript build step required).
   - Line 33: `The Phase 0 plan does not claim an installed runtime or working MCP host.` -> Retain historical sentence and append: `Pinned in RH-P1/RH-P2: Node.js 24 LTS, @relate/relate@1.0.1, Relate v1.0.1.`

---

## 5. Remaining Risks, Dependencies & Owner Decisions Required

### Remaining Risks & Dependencies
- **Linux `GLIBC_2.39` binary incompatibility:** Prebuilt `relate-linux-amd64` `v1.0.1` fails on Debian 12 (`GLIBC_2.36`), requiring source-built `relate-cli` or `GLIBC >= 2.39`.
- **Long-lived MCP host snapshot staleness:** External MCP hosts keeping `relate serve --read-only` alive across turns will miss external writes unless restarted (or Option C is approved).
- **Unsigned local store:** Persisted evidence without live `--verify` remains `UNVERIFIED` (`UNSIGNED_LOCAL_STORE_EVIDENCE`).
- **Devpost placeholder rules:** Official hackathon rules (`https://relate.devpost.com/rules`) must be re-checked for final license and GitHub topic requirements before submission.

### Owner Decisions Needed Before RH-P3 Implementation
1. **License choice:** Approve the exact open-source license (e.g., `MIT` or `Apache-2.0`) to add to `LICENSE`.
2. **MCP reader strategy:** Confirm **Option B + host-restart docs** (no new proxy) vs **Option C** (`S1`, persistent read-only wrapper).
3. **PRODUCT/ARCHITECTURE sync (`S2`):** Approve updating stale Phase 0/1 status lines in `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.
4. **GitHub ruleset & hosted CI (`S3`):** Confirm whether local-first manual CI remains sole policy or if GitHub Actions / rulesets should be configured.
5. **Submission gate:** Confirm target submission date, demo video recording plan, and GitHub topics (`relate`, event topic) before any public submission.
