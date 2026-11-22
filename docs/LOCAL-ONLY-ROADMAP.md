# RelateHandoff — Local-Only Improvement Roadmap

- **Effective date:** 2026-11-23
- **Owner decision:** **LOCAL-ONLY FOR NOW.** The hosted RH-P5 roadmap (`docs/RH-P5-PLATFORM-PLAN.md`) is **ON HOLD** (`RH-P5-T1` through `T8` are not executed). `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` local-only restrictions remain authoritative and unchanged.

This roadmap proposes bounded, local-only improvements to the existing Node.js + Relate v1.0.1 engine (`src/`, `test/`, `examples/`, `scripts/`) without any cloud backend, Cloudflare resources, or remote MCP endpoint.

## 1. CLI reliability (`src/cli.mjs`, `src/git.mjs`, `src/recorder.mjs`)
- **Actionable preflight diagnostics:** surface clear, structured error messages and distinct non-zero exit codes when `relate` CLI is missing, `GLIBC` mismatches occur, or the local Git repository/worktree is uninitialized or detached.
- **Idempotency & conflict UX:** improve `record` output when replaying an identical handoff vs hitting `HandoffConflictError`, including the exact conflicting `handoffId` and `HEAD` SHA.
- **Cross-platform path & Git hardening:** expand edge-case handling for nested Git worktrees, submodules, and Windows/macOS path normalization without relaxing `MAX_DETAIL_ROWS = 100` or traversal/secret checks.

## 2. Agent handoffs (`src/schema.mjs`, `src/recorder.mjs`, `src/freshness.mjs`)
- **Bounded handoff lifecycle ergonomics:** add local-only support/UX for explicit handoff supersession and task-scoped listing/filtering in `resume` (preserving immutable provenance and `LIMIT 101` detail bounds).
- **Agent-readable + human-readable `resume` output:** provide deterministic JSON and compact Markdown summary formats so Codex, Claude, Gemini, and human reviewers can consume `metadataFreshness` (`CURRENT` vs `STALE`) and `executionAuthenticity` (`VERIFIED` vs `UNVERIFIED`) unambiguously.
- **Strict `--verify` ergonomics:** document and refine local `--verify <profile>` behavior when worktrees have untracked scratch files vs tracked changes, preserving clean-tree guarantees.

## 3. Local stdio MCP (`src/mcp_client.mjs`)
- **Snapshot-staleness handling:** because `relate serve --mcp stdio --database <store> --read-only` serves an open-time snapshot, document and harden short-lived per-`resume` spawning, bounded timeouts, and clean child-process teardown across platforms.
- **MCP host integration recipes:** add verified, copy-paste local stdio MCP configuration snippets for Claude Code, Codex CLI, and Gemini/Antigravity (strictly `--read-only`, local store path only).
- **Transport resilience:** ensure malformed JSON-RPC frames, partial writes, or unexpected EOF from `relate serve` always fail closed with clear diagnostics and zero orphan processes.

## 4. Testing (`test/`, `spike/`, `scripts/validate.py`)
- **Real Relate v1.0.1 + `(fake)` parity:** expand `test/e2e_mcp.test.mjs` and `test/security.test.mjs` for detached HEAD, nested worktrees, concurrent read-only `resume` calls, and large-but-valid (`100`-row) boundary payloads.
- **Failure-mode & timeout matrix:** add deterministic `(fake)` MCP fault-injection cases for slow/stalled `relate serve` startup, partial tool responses, and non-zero exit codes.
- **Clean-clone & offline reproducibility:** verify `examples/example-store` and `npm run demo` in isolated offline environments without network access.

## 5. Installation & runtime setup (`README.md`, `docs/RELATE-SPIKE.md`, `package.json`)
- **Linux `GLIBC_2.36` vs `GLIBC_2.39` guidance:** provide a clear preflight check (`relate --version` / `ldd` diagnostic) and documented fallback to `@relate/relate@1.0.1` / source-built `relate-cli` for Debian 12 / Ubuntu 22.04 hosts.
- **One-command environment doctor:** add a read-only `relatehandoff doctor` (or `npm run doctor`) proposal that checks Node.js >= 24 LTS, `git --version`, `relate` CLI availability, and read-only access to `examples/example-store`.
- **Pinned judge/developer onboarding:** keep setup instructions synchronized with `config/validation-contract.json` and `docs/JUDGE-WALKTHROUGH.md`.

---

**Next step:** Owner selects and approves individual local-only task contracts (e.g., `RH-LOCAL-T1`…) before any `src/`, `test/`, or `package.json` implementation begins.
