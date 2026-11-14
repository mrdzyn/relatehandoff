# Scripts

Put repeatable project automation here.

Good candidates include:
- local validation wrappers;
- deterministic build helpers;
- release-preparation checks;
- schema validation;
- code generation;
- artifact checksums;
- environment sanity checks.

## Script rules

Scripts should:
- be safe to rerun where practical;
- fail clearly on error;
- avoid embedding secrets;
- document prerequisites;
- avoid destructive production actions by default;
- support CI use where useful.

Prefer documented local validation and release verification entrypoints once a project's stack is known:
- `scripts/validate` — local development validation entrypoint (offline-capable).
- `scripts/verify_release` — local release-candidate verification entrypoint (offline-capable).

**Release scope verification boundary:** `scripts/verify_release.py` proves configured tests and artifact checksums; it does not automatically compare owner-approved features with production behavior. Before release verification, a human/reviewer must reconcile a **candidate-specific** record from `docs/RELEASE-SCOPE-MANIFEST.md` (for example `docs/releases/<version>/RELEASE-SCOPE.md`). Missing live gates block promotion while feature scope remains unchanged; never present mock-backed checks as live integration PASS.

## Master-template validation scripts & entrypoints

- `validate.py` / `validate` — canonical local development validation runner. Identifies exact HEAD SHA, verifies profile/inventory, diff whitespace hygiene, executes project validation contract commands (`config/validation-contract.json`), and fails closed on tracked `.env*` files or unresolvable diff base refs.
- `verify_release.py` / `verify_release` — canonical local release-candidate verification runner. Fails closed on dirty worktree, mismatched candidate SHA, missing/empty release artifacts, or failed development validation. Requires an explicit non-empty artifact inventory without substituting configuration files, computes deterministic SHA-256 artifact hashes, and outputs durable sanitized release evidence.
- `test_entrypoints.py` — targeted self-test suite for `validate.py` and `verify_release.py`, exercising fail-closed dirty worktree, tracked `.env`, zero/empty artifact inventories, wrong candidate SHA, git execution failure, missing mandatory validators, stack command failures, and offline execution without GitHub Actions.
- `validate_project_profile.py` — validates `config/project-profile.json`, capability dependencies, and the files required by selected packs. Generated/adopted projects keep this script because Project Baseline uses it.
- `test_validate_project_profile.py` — master-template self-test for representative capability combinations used by Template Integrity. A generated greenfield project may remove it during bootstrap unless that child deliberately maintains or extends capability-validator behavior.
- `validate_master_template.py` — validates the master-template capability file inventory and template mode. Master-only.
- `session_context.py` — read-only, offline-capable session continuity and context recovery generator for AI agents starting with zero prior chat memory per `docs/SESSION-CONTINUITY.md`.
- `test_session_context.py` — test suite covering positive and adversarial context recovery scenarios (stale state, duplicate handoffs, traversal, contradictory actions, sanitized secrets, same-op bypass, task-scope verification).

Keep capability-selection logic in the versioned validator rather than duplicating it inside workflow YAML.

## Project validation contract & stack portability

Under the local-first policy (`docs/MANUAL-CI.md` and `docs/RELEASE.md`), projects define and inherit their executable validation contract:
- `config/validation-contract.json`: standard configuration defining mandatory `developmentCommands`, `releaseCommands`, and `releaseArtifacts`.
- **macOS / Linux:** Execute `./scripts/validate` and `./scripts/verify_release` or `python3 scripts/validate.py`.
- **Windows:** Execute `python scripts\validate.py` and `python scripts\verify_release.py` (or native project PowerShell entrypoints).
- **Stack portability (non-Python / non-Bash):** Child projects are **never forced** to retain Python or Bash if their native technology stack does not use them. A child project may implement the equivalent contract using native tooling (e.g. `dotnet test` / `dotnet publish`, `npm test` / `npm run verify-release`, `cargo test`, `make`, etc.), provided the native entrypoints enforce the same invariants: exact commit SHA, clean working tree, dependency lock state, objective test passes, and SHA-256 artifact hashing. Generic template validators must never replace unique stack-specific tests. Mandatory development and release commands must fail closed on missing executables or non-zero exit codes.
