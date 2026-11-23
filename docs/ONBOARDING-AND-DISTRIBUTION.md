# RelateHandoff — Onboarding, Platform Setup & Distribution Readiness

- **Task:** `tasks/RH-LOCAL-T5-dx-onboarding.md`
- **Scope:** Local-only installation, cross-platform troubleshooting, offline clean-clone reproducibility verification, and distribution/licensing readiness review.
- **Explicit owner gate:** **Do not publish packages (`npm publish`, GitHub Releases, or bundled native binaries), merge PRs, or deploy without explicit human owner approval.**

---

## 1. Platform-by-Platform Installation & Troubleshooting

### Pinned Runtime Baseline
- **Node.js:** `>= 24 LTS` recommended (`>= 20` minimum in `src/doctor.mjs`; verified on this macOS host with `v26.7.0`).
- **Python:** `3.11+` (used by `scripts/validate.py`, `scripts/test_bootstrap.py`, `scripts/check_secret_tracking.py`; verified on this host with `3.15.2`).
- **Git:** `2.30+` (verified on this host with `2.54.0 (Apple Git-157)`).
- **npm package:** `@relate/relate@1.0.1` pinned in `package.json` / `package-lock.json` (transitive dependency `koffi@2.16.4`).
- **Relate CLI binary:** Separate `relate` `v1.0.1` executable (NOT installed by `npm ci`). Obtain from [official v1.0.1 release artifacts](https://github.com/relatedb/relate/releases/tag/v1.0.1) and verify per [Relate install docs](https://relatedb.ai/docs/get-started/install/), or set `RELATE_BIN` to its absolute path.

### macOS (Apple Silicon ARM64 / Intel x64)
- **Verification status on this host:** **macOS ARM64 (`darwin`, Mach-O 64-bit arm64 `Relate v1.0.1` at `/Users/macjohn/.local/bin/relate`) VERIFIED** in this session; Intel `darwin-x64` native execution is **UNVERIFIED** on this host.
- **Install & verify:**
  ```bash
  node --version
  python3 --version
  git --version
  relate --version   # Expect: Relate v1.0.1 / License: Apache 2.0 (binary)
  npm ci
  node src/cli.mjs doctor --repo . --store examples/example-store
  ```
- **Common macOS notes:**
  - `relate` is checked by `doctor` via `--relate-bin`, `RELATE_BIN`, `~/.cargo/bin/relate`, `/tmp/relate-cargo/bin/relate`, and `PATH`. If `relate` is in `~/.local/bin` and `PATH` omits it in non-login shells, run from a login shell (`zsh -lc ...`) or set `RELATE_BIN=/Users/<you>/.local/bin/relate`.
  - If macOS Gatekeeper blocks a downloaded binary, verify the official release checksum/signature first rather than disabling system-wide security controls.

### Linux (`x86_64` / `arm64`, including Debian 12 / Ubuntu 22.04+)
- **Verification status on this host:** **Native Linux execution is `UNVERIFIED` on this macOS host.** (Historical Debian 12 `GLIBC_2.36` spike and PR #4/#5 audit observations are documented in `docs/RELATE-SPIKE.md` and `docs/STATUS.md`; re-verify on the target Linux host at exact HEAD.)
- **Known `GLIBC_2.36` vs `GLIBC_2.39` issue & resolution:**
  - The prebuilt `relate-linux-amd64` `v1.0.1` binary has been observed to require `GLIBC_2.39` and fail on Debian 12 (`GLIBC_2.36`) with `GLIBC_2.39 not found`.
  - `node src/cli.mjs doctor` inspects `ldd --version` and failure text for `GLIBC_<ver>` and reports `FAIL` with exact remediation when this occurs.
  - **Do not** replace or force-upgrade system `glibc` to work around this. Instead, build the pinned `v1.0.1` CLI from upstream source with Rust/Cargo:
    ```bash
    cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli
    ~/.cargo/bin/relate --version
    ```
  - `@relate/relate@1.0.1` (Node.js) and `relate-db@1.0.1` (Python `manylinux2014`) were observed to load on `GLIBC_2.36` during the `RH-P1` spike (`docs/RELATE-SPIKE.md`).

### Windows (`win32-x64` / WSL2)
- **Verification status on this host:** **Native Windows and WSL2 execution are `UNVERIFIED` on this macOS host.**
- **Implemented Windows accommodations (code-inspected, runtime `UNVERIFIED` on Windows):**
  - `package-lock.json` includes optional platform package `@relate/relate-win32-x64@1.0.1`.
  - `src/doctor.mjs` checks Windows `Path` vs `PATH` environment casing, `relate.exe` under `%USERPROFILE%\.cargo\bin\relate.exe`, and `PATH`.
  - `src/git.mjs` rejects Windows drive prefixes (`C:...`) and UNC/double-slash paths (`\\...`, `//...`) in handoff artifact lists to prevent path traversal.
- **Recommended Windows approach:** Prefer WSL2 (Ubuntu 24.04+ with `GLIBC >= 2.39`, or source-built `relate-cli` if `GLIBC < 2.39`) or verify native PowerShell execution directly with `node src/cli.mjs doctor --repo . --store examples/example-store` and `RELATE_REQUIRE_CLI=1 npm test` before claiming Windows support.

### Common Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| `doctor` exits `1` with `No runnable Relate v1.0.1 CLI found` | `relate` binary missing from `PATH` / `~/.cargo/bin` or `RELATE_BIN` points to missing path | Install Relate CLI `v1.0.1`, add to `PATH`, or export `RELATE_BIN=/abs/path/to/relate` |
| `doctor` reports `GLIBC_2.39` required on Linux | Host glibc is older than `2.39` (e.g., Debian 12 `GLIBC_2.36`) | Build pinned `v1.0.1` from source: `cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli` |
| `doctor` reports `WARN` (`configured repository identity is not a canonical owner/repo identifier`) or `resume` fails with `Repository identity mismatch` | Local clone (`git clone --local`) has filesystem path as `origin`, or repo has no `origin` / `relatehandoff.repository` | Run `git remote set-url origin https://github.com/mrdzyn/relatehandoff.git` (for offline clones of this repo) or `git config relatehandoff.repository <owner/repo>` |
| `record --verify` or `resume --verify` refuses with `Refusing --verify on dirty worktree` | Modified or untracked files exist in checkout | Commit or stash changes first; `--verify` enforces a clean worktree before and after execution |
| External MCP host does not see newly recorded handoffs | Persistent `relate serve --mcp stdio --read-only` caches an open-time snapshot | Restart the external MCP server process after external `record` writes (`resume` / `list` CLI commands already spawn fresh short-lived processes) |
| `CLI` exits `2` | Invalid flag, unknown command, malformed `--task`/`--handoff`/`--limit`/`--format`, or unsupported flag | Check `node src/cli.mjs --help`; `doctor` reserves exit `1` for failed checks and `2` for usage errors |

---

## 2. Offline Clean-Clone Reproducibility Verification

Verified on **2026-11-23** on **macOS ARM64 (`darwin`)** (`Node.js v26.7.0`, `Python 3.15.2`, `Git 2.54.0 (Apple Git-157)`, `Relate v1.0.1` at `/Users/macjohn/.local/bin/relate`) against local commit `1a77147e3bb237d94ee3d4e4e5f5d5907be55c70` (`main` baseline for `RH-LOCAL-T5`). Temporary directories in `/tmp` were removed on exit (`trap "rm -rf ..." EXIT`).

### Observation A — Raw `git clone --local` without updating `origin`
When cloning from a local directory path (`git clone --local <worktree> /tmp/.../repo`), Git sets `origin` to the local filesystem path instead of `mrdzyn/relatehandoff`:
- `npm ci --offline`: **PASS** (`added 3 packages, and audited 4 packages in 561ms`, `0 vulnerabilities`, using local npm cache; prints npm `allowScripts` notice for `koffi@2.16.4` while prebuilt binaries load normally).
- `node src/cli.mjs doctor --repo . --store examples/example-store`: **WARN (exit 0)** — `5 PASS, 1 WARN, 0 FAIL`; `Git repository` warns that configured repository identity is not a canonical `owner/repo` identifier.
- `node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1 --format markdown`: **FAIL (exit 1)** — `Error: Repository identity mismatch: checkout is '<local-worktree-path>', but caller/payload specified 'mrdzyn/relatehandoff'`.
- `RELATE_REQUIRE_CLI=1 npm test`: **FAIL (exit 1)** — **41/42 PASS, 1 FAIL** (`RH-P1 regression (B1)` in `test/e2e_mcp.test.mjs`, because `resumeTaskViaReadOnlyMcp` resolves the repository name from `origin`).

### Observation B — Offline `git clone --local` with canonical `origin` set offline
Running the exact same offline clean-clone workflow with `git remote set-url origin https://github.com/mrdzyn/relatehandoff.git` (zero network access required):

```bash
TMPDIR_OFFLINE="$(mktemp -d /tmp/rh-local-t5-offline.XXXXXX)"
trap 'rm -rf "$TMPDIR_OFFLINE"' EXIT
git clone --local /Users/macjohn/Documents/relatehandoff/.claude/worktrees/rh-local-t5 "$TMPDIR_OFFLINE/repo"
cd "$TMPDIR_OFFLINE/repo"
git remote set-url origin https://github.com/mrdzyn/relatehandoff.git
npm ci --offline
node src/cli.mjs doctor --repo . --store examples/example-store
node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1 --format markdown
RELATE_REQUIRE_CLI=1 npm test
```

Observed results on `1a77147e3bb237d94ee3d4e4e5f5d5907be55c70`:
- `npm ci --offline`: **PASS (exit 0)** — `added 3 packages, and audited 4 packages in 779ms`.
- `node src/cli.mjs doctor --repo . --store examples/example-store`: **PASS (exit 0)** — `6 PASS, 0 WARN, 0 FAIL` (Read-only MCP probe succeeded against `examples/example-store`, `2 tools`).
- `node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1 --format markdown`: **PASS (exit 0)** — returned `RH-P1-EXAMPLE-1` (`ACTIVE`, `Overall status: STALE`, `Execution authenticity: SELF_ASSERTED`, decisions/evidence/artifacts rendered safely).
- `RELATE_REQUIRE_CLI=1 npm test`: **PASS (exit 0)** — **42/42 tests PASS, 0 fail, 0 cancelled, 0 skipped** (`duration_ms 9017.421625`), including `spike/relate_spike.test.mjs`, `test/e2e_mcp.test.mjs`, `test/security.test.mjs`, `test/doctor.test.mjs`, `test/resume_output.test.mjs`, and `test/lifecycle.test.mjs`.
- Cleanup: `/tmp/rh-local-t5-offline.*` removed automatically via `trap` on exit.

> Note: If a completely air-gapped machine also lacks a populated `~/.npm` cache, `npm ci --offline` will fail without network unless an offline tarball cache or pre-populated `node_modules` directory matching `package-lock.json` is supplied.

---

## 3. Distribution & Licensing Readiness Review

This section summarizes verified repository and lockfile/installed metadata as of `RH-LOCAL-T5`. **It does not authorize publishing or releasing packages.**

| Component | Version / Pin | Observed License & Notices | Readiness / Notes |
|---|---|---|---|
| **RelateHandoff source** | `0.1.0` (`private: true` in `package.json`) | `Apache-2.0` (`LICENSE`, `NOTICE`, approved in PR #8; `Copyright 2026 mrdzyn`) | Ready for source distribution under Apache-2.0; `package.json` intentionally sets `"private": true` to prevent accidental `npm publish`. |
| **`@relate/relate`** | `1.0.1` (`package-lock.json`, `node_modules/@relate/relate/package.json`) | `Apache-2.0`; Neo4j Labs experimental Relate project (`NOTICE`, `docs/RELATE-SPIKE.md`) | Preserves Neo4j Labs experimental non-endorsement notice in `NOTICE`. |
| **`@relate/relate-*` platform optional packages** | `1.0.1` (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-x64` in `package-lock.json`) | `Apache-2.0` declared in `package-lock.json` and inspected `relate-darwin-arm64/package.json` | Native libraries (`lib/`) exist inside platform optional packages; full multi-OS binary notice audit required if ever bundling binaries. |
| **`koffi`** (transitive FFI dependency) | `2.16.4` (`package-lock.json`, `node_modules/koffi/package.json` & `LICENSE.txt`) | `MIT` (`Copyright (C) 2025 Niels Martignène`) | Any binary or bundled redistribution must preserve `koffi`'s MIT copyright and permission notice (`node_modules/koffi/LICENSE.txt`). |
| **Relate CLI (`relate`)** | `v1.0.1` (separate user/judge install) | `Relate v1.0.1 / License: Apache 2.0 (binary)`; upstream `LABS_DISCLAIMER.txt` experimental disclaimer | Not bundled in git or `npm ci`; preserve upstream license, checksum/signature install guidance, and non-endorsement disclaimer. |
| **Scaffold & conceptual attribution** | `mrdzyn/ai-native-project-template`, `jexp/relate-ideas` | Own scaffold; `jexp/relate-ideas` cited as CC-BY-4.0 conceptual inspiration (no files copied) | Documented in `NOTICE`, `README.md`, and `docs/RH-P3-THIRD-PARTY-ATTRIBUTION.md`. |

### Explicit Publishing & Release Gate
- **Do NOT publish packages (`npm publish`, GitHub Releases, Homebrew/container images, or bundled binaries) without explicit human owner approval.**
- Before any future distribution or release candidate beyond local source checkouts:
  1. Owner explicitly approves removing `"private": true` (if npm publishing is desired) or defines the release artifacts.
  2. Complete the remaining owner checklist in `docs/RH-P3-THIRD-PARTY-ATTRIBUTION.md` (copyright holder/employer IP confirmation and full multi-platform binary notice scan if bundling native binaries).
  3. Create a candidate-specific scope reconciliation record from `docs/RELEASE-SCOPE-MANIFEST.md` and pass `scripts/verify_release.py` on the exact release commit.
