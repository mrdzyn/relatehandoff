# Local-First CI and Release Validation — Master Template and Generated Projects

> **State:** Active master operating policy (adopted in P8.0 M4/PR #25 and expanded in P8.0 M5). Master baseline `70d704b14aed2eec9669e1da4f43759ec73deff0`. Existing project repositories are not changed automatically.

## Decision

Mandatory development, testing, security validation, build, packaging, and release-candidate verification must be executable on approved local or independently controlled infrastructure, even when GitHub Actions and GitHub network access are unavailable.

GitHub Actions is retained solely as **optional supplementary automation** (`workflow_dispatch`), never a prerequisite or blocking dependency for validating, approving, or releasing a change. Full testing depth, artifact integrity (SHA-256 hashing), independent exact-HEAD audit, and explicit human merge and production release approvals are strictly preserved.

**This establishes local-first, self-controlled verification; it does not remove testing.** Local evidence is recorded transparently and audited independently. Do not misuse the emergency CI-unavailable exception or represent unexecuted tests as passing.

## Every development PR (mandatory)

1. Work on an isolated feature branch, with a PR, from a verified base SHA. Check out the **exact full proposed PR HEAD** in a clean worktree. Any change to the head requires repeat validation and independent audit.
2. Execute the local development validation entrypoint:
   - Run `python3 scripts/validate.py` on macOS/Linux (or use `py -3 scripts/validate.py` / a verified Python 3 `python` executable on Windows, or `./scripts/validate` where supported).
   - This runs `scripts/validate_project_profile.py --repository <actual-owner/repository>`. In the **master only**, it also runs `scripts/validate_master_template.py`, `scripts/test_validate_project_profile.py`, and `scripts/test_entrypoints.py`.
3. Check diff and tracked environment files:
   - Run `git diff --check <base-ref>...HEAD`.
   - Run the fail-closed tracked environment guard (verifying zero tracked `.env`, `.env.local`, `.env.development`, `.env.staging`, `.env.production` files).
4. Run all project-owned objective-based tests, build/compile, security, and negative/adversarial checks **appropriate to the change and blast radius**, on an approved local host (e.g., Windows native x64/Arm64 builds and RS0030 negative canary where Windows tasks require them).
5. For UI/device-dependent tasks, complete manual/accessibility QA as required. No false PASS for unexecuted tests.
6. Record in the PR a **sanitized exact-head manual CI report**: SHA/base, trusted environment/tool versions, commands/results/test counts, expected-negative results, applicable manual QA, skips with rationale, residual risk, and owner decisions; never post local secrets or private paths.
7. Require a **genuinely independent exact-head audit** and resolution of all review threads. Obtain **separate explicit owner approval** before squash merging. Keep changes on PRs; do not grant direct-push permission.
8. Any local test failure blocks the PR regardless of GitHub status check configuration. Never fabricate passing status or automatically waive review. A new SHA invalidates prior proof.

Suggested PR evidence:

```text
MANUAL CI — exact PR head SHA: <sha>
Base: <branch/full SHA>
Trusted local host / SDK: <sanitized>
Development validation (validate.py): PASS/FAIL
Master inventory / self-tests (master only): PASS/FAIL/N/A
Diff and tracked env-file hygiene: PASS/FAIL
Stack-specific build/tests/security: PASS/FAIL/N/A + exact commands/counts
Manual/device QA: PASS/FAIL/DEFERRED + why and owner approval
Independent exact-head reviewer and verdict: <reference>
Review threads: <unresolved count>
Hosted Actions: NOT RUN (local-first policy; GitHub Actions is optional)
Owner merge approval: <reference or PENDING>
```

## Workflow contract

- `.github/workflows/ci.yml` is **`workflow_dispatch` only**, with unchanged caller/job, `contents: read`, and the same-repository `.github/workflows/common-validation.yml` reusable callee (`workflow_call`).
- Master `.github/workflows/template-integrity.yml` remains `workflow_dispatch` only, master guarded, with inventory and capability-profile tests.
- No automatic `pull_request`, `push`, `schedule` or `release` trigger for the universal baseline. New projects inherit this baseline; projects may add native stack validation and release workflows while preserving their approved mode.
- Hosted GitHub Actions is supplementary convenience automation. A failure in GitHub Actions availability or quota never prevents local validation or release approval.

## Final release candidate verification (local-first, offline-capable)

The primary and mandatory path for release validation is executed on approved local or self-controlled infrastructure:

0. **Preserve approved scope:** Copy `docs/RELEASE-SCOPE-MANIFEST.md` into a versioned candidate record (for example `docs/releases/<version>/RELEASE-SCOPE.md`). Reconcile each owner-approved feature against real candidate implementation, target production flags, integration evidence, and remaining gates. Record independent reconciliation and any explicitly owner-approved scope change. A closed gate blocks promotion, not feature scope. This is a reviewer/human governance check; `scripts/verify_release.py` does **not** automatically establish semantic feature completeness.
1. **Freeze candidate:** Freeze the release candidate ref and exact commit SHA.
2. **Clean working tree:** Ensure the working tree is completely clean (`git status --porcelain` empty). Uncommitted changes invalidate release verification.
3. **Execute release verification entrypoint:**
   - Run `python3 scripts/verify_release.py --candidate-sha <SHA> --version <VERSION> [--artifacts <PATHS>]` on macOS/Linux (use an installed Python 3 interpreter on Windows, or `./scripts/verify_release` where supported).
   - For the **master template**, this verifies template mode, capability inventory, profile self-tests, and hashes core distribution assets.
   - For a **generated project**, this verifies project profile, executes project-owned release checks, and verifies that built release artifacts exist, are non-empty, and generates cryptographic SHA-256 checksums.
4. **Artifact & Signing Verification:** Verify that generated binaries, packages, and store bundles match required specifications. Check signatures where applicable (per `release/android-signing.md` **only if the Android pack is selected and restored**, or applicable platform signing policies).
5. **Durable release record:** Output and preserve the durable sanitized release record containing candidate commit SHA, timestamp, platform details, test counts, artifact SHA-256 hashes, and pass/fail summary.
6. **Optional supplementary hosted run:** If GitHub Actions is online and the maintainer desires supplementary cloud validation, they may optionally run `workflow_dispatch` (`gh workflow run ci.yml --ref <candidate-ref>`). However, **hosted execution is never a prerequisite or blocking dependency** for approving a release.
7. **Human Release Gate:** Automation never self-releases. Production release, store publishing, deployment, or tagging requires explicit human owner release approval. Before promotion, complete pending live/signing/integration gates and confirm that the approved candidate includes all approved features under intended production flags. After promotion, smoke-test approved features and live integrations. Mock-backed tests cannot substitute for live proof.

## Greenfield and brownfield governance

- **New greenfield projects:** Inherit this local-first execution contract upon template generation. Projects that do not use Python or Bash are not forced to retain them; they may implement the equivalent contract using native tooling (e.g. `dotnet test` + `dotnet publish`, `npm test` + `npm run verify-release`, `cargo`, `make`) enforcing the same exact-SHA, clean-tree, and artifact-hashing rules.
- **Existing brownfield repositories:** Preserve their existing release protections and configured CI workflows until the repository owner individually approves and executes a reconciled migration. Unique stack-specific tests must never be replaced with generic template validators.

## Network independence and source of truth

- Network connectivity to GitHub is **not required** to execute development validation, test suites, or release candidate verification.
- Canonical GitHub synchronization, pull requests, code reviews, and remote branch merges remain governed under the repository's established operating model. Running local validation does not alter remote branch governance or source-of-truth policies.
