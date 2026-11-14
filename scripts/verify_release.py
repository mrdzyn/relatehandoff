#!/usr/bin/env python3
"""Local-first release candidate verification entrypoint for ai-native projects.

Executes deterministic release-candidate validation offline without invoking
GitHub Actions, GitHub CLI (`gh`), or requiring network access to GitHub APIs.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

REDACT_PATTERNS = [
    (re.compile(r'(?i)(ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{16,}'), r'\1_[REDACTED]'),
    (re.compile(r'(?i)(bearer\s+)[a-zA-Z0-9_\-\.]{16,}'), r'\1[REDACTED]'),
    (re.compile(r'(?i)\b(password|secret|token|api[_-]?key|access[_-]?key|auth|private[_-]?key)\b\s*([:=])\s*["\']?([^"\'\s,;]{4,})["\']?'), r'\1\2[REDACTED]'),
    (re.compile(r'-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----'), '[REDACTED PRIVATE KEY]'),
]


def sanitize_string(text: str, root_dir: pathlib.Path | None = None) -> str:
    """Sanitize secrets, credentials, and local absolute system paths."""
    if not text:
        return ""
    res = text
    if root_dir:
        res = res.replace(str(root_dir.resolve()), "<repo>")
        res = res.replace(str(root_dir), "<repo>")
    try:
        home = str(pathlib.Path.home())
        if home and len(home) > 1:
            res = res.replace(home, "<user_home>")
    except Exception:
        pass
    res = re.sub(r'/tmp/[a-zA-Z0-9_\-]+', '<temp_path>', res)
    for pat, repl in REDACT_PATTERNS:
        res = pat.sub(repl, res)
    return res


def truncate_diagnostic(text: str, max_chars: int = 500, max_lines: int = 5) -> str:
    """Safely truncate diagnostics while preserving error essence."""
    lines = text.splitlines()
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"... ({len(lines) - max_lines} more lines truncated)"]
    joined = "\n".join(lines)
    if len(joined) > max_chars:
        joined = joined[:max_chars] + "... (truncated)"
    return joined


def get_git_output(args: list[str], cwd: pathlib.Path = ROOT) -> tuple[int, str]:
    """Execute a git command and return (exit_code, output_text)."""
    try:
        res = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
        return res.returncode, res.stdout.strip()
    except Exception as exc:
        return 127, f"git execution error: {exc}"


def preflight_evidence_destination(
    evidence_path: pathlib.Path,
    cwd: pathlib.Path = ROOT,
) -> tuple[bool, str | None]:
    """Preflight whether evidence destination is safely outside the worktree or in an ignored location.

    Returns (is_safe, error_message).
    Fails closed if the path would dirty the git working tree or overwrite tracked source.
    """
    try:
        resolved_evidence = evidence_path.resolve()
        resolved_cwd = cwd.resolve()
    except Exception as exc:
        return False, f"Invalid evidence file path: {exc}"

    try:
        rel = resolved_evidence.relative_to(resolved_cwd)
        is_inside = True
    except ValueError:
        is_inside = False

    if not is_inside:
        return True, None

    # Check if target is already a tracked git file
    code_ls, _ = get_git_output(["ls-files", "--error-unmatch", str(rel)], cwd=cwd)
    if code_ls == 0:
        return False, f"Destination '{rel}' is a tracked git file; evidence cannot overwrite tracked source files."

    # Check if target is gitignored
    code_ign, _ = get_git_output(["check-ignore", "-q", str(rel)], cwd=cwd)
    if code_ign != 0:
        return (
            False,
            f"Destination '{rel}' is inside git worktree but not gitignored. "
            "Writing it would dirty the working tree. Write outside the worktree or to a gitignored path.",
        )

    return True, None


def compute_sha256(file_path: pathlib.Path) -> str:
    """Calculate the SHA-256 hexadecimal digest of a file."""
    hasher = hashlib.sha256()
    with file_path.open("rb") as fh:
        while chunk := fh.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_artifacts(
    artifact_paths: list[pathlib.Path],
    cwd: pathlib.Path = ROOT,
) -> tuple[bool, list[dict[str, object]], list[str]]:
    """Verify artifact existence, regular file status, non-emptiness, and SHA-256 checksums."""
    verified: list[dict[str, object]] = []
    errors: list[str] = []

    for path in artifact_paths:
        if not path.exists():
            errors.append(f"Missing release artifact: {sanitize_string(str(path), cwd)}")
            continue
        if not path.is_file():
            errors.append(f"Release artifact path is not a regular file: {sanitize_string(str(path), cwd)}")
            continue

        size = path.stat().st_size
        if size == 0:
            errors.append(f"Empty release artifact (0 bytes): {sanitize_string(str(path), cwd)}")
            continue

        sha256 = compute_sha256(path)
        # Store sanitized relative or normalized path
        try:
            rel_path = str(path.resolve().relative_to(cwd.resolve()))
        except Exception:
            rel_path = sanitize_string(str(path), cwd)

        verified.append({
            "path": rel_path,
            "filename": path.name,
            "size_bytes": size,
            "sha256": sha256,
        })

    return len(errors) == 0, verified, errors


def load_validation_contract(
    contract_path: pathlib.Path | None,
    cwd: pathlib.Path = ROOT,
) -> tuple[dict[str, object] | None, str | None]:
    """Load project validation contract from specified or standard paths."""
    target = contract_path
    if not target:
        default_file = cwd / "config/validation-contract.json"
        if default_file.is_file():
            target = default_file

    if not target:
        profile_file = cwd / "config/project-profile.json"
        if profile_file.is_file():
            try:
                with profile_file.open(encoding="utf-8") as fh:
                    data = json.load(fh)
                    if "validation" in data and isinstance(data["validation"], dict):
                        return data["validation"], None
            except Exception as exc:
                return None, f"Failed to parse project profile validation section: {exc}"
        return None, None

    if not target.is_file():
        return None, f"Specified validation contract file does not exist: {target}"

    try:
        with target.open(encoding="utf-8") as fh:
            data = json.load(fh)
            return data, None
    except Exception as exc:
        return None, f"Failed to parse validation contract {target}: {exc}"


def evaluate_contract_completeness(
    contract: dict[str, object] | None,
    repo_mode: str,
) -> tuple[bool, list[str]]:
    """Validate that the project validation contract is complete for release.

    In project mode, required categories are: test, build, security.
    Each must have either active commands or an explicit auditable not_applicable decision.
    """
    errors: list[str] = []
    if repo_mode != "project":
        return True, errors

    if not contract:
        errors.append(
            "Release verification in project mode requires a complete validation contract (config/validation-contract.json). No contract was found."
        )
        return False, errors

    required_categories = ["test", "build", "security"]
    categorized_commands: dict[str, list[dict]] = {cat: [] for cat in required_categories}
    na_decisions: dict[str, str] = {}

    # 1. Parse 'categories' mapping if present
    if "categories" in contract and isinstance(contract["categories"], dict):
        for cat_name, cat_data in contract["categories"].items():
            if not isinstance(cat_data, dict):
                continue
            cat_key = cat_name.lower().strip()
            if cat_data.get("status") == "not_applicable":
                na_decisions[cat_key] = cat_data.get("reason", "")
            elif "command" in cat_data:
                if cat_key in categorized_commands:
                    categorized_commands[cat_key].append(cat_data)
                else:
                    categorized_commands[cat_key] = [cat_data]

    # 2. Parse 'developmentCommands' and 'releaseCommands' lists
    all_cmds = []
    if "developmentCommands" in contract and isinstance(contract["developmentCommands"], list):
        all_cmds.extend(contract["developmentCommands"])
    if "development" in contract and isinstance(contract["development"], dict):
        all_cmds.extend(contract["development"].get("commands", []))
    if "releaseCommands" in contract and isinstance(contract["releaseCommands"], list):
        all_cmds.extend(contract["releaseCommands"])
    if "release" in contract and isinstance(contract["release"], dict):
        all_cmds.extend(contract["release"].get("commands", []))

    for item in all_cmds:
        if not isinstance(item, dict):
            continue
        cat_key = item.get("category", "").lower().strip()
        if item.get("status") == "not_applicable":
            na_decisions[cat_key] = item.get("reason", "")
        elif cat_key and "command" in item:
            categorized_commands.setdefault(cat_key, []).append(item)

    # 3. Parse standalone 'notApplicable' list
    if "notApplicable" in contract and isinstance(contract["notApplicable"], list):
        for item in contract["notApplicable"]:
            if isinstance(item, dict) and "category" in item:
                cat_key = str(item["category"]).lower().strip()
                na_decisions[cat_key] = item.get("reason", "")

    # 4. Enforce completeness across required categories
    for cat in required_categories:
        has_commands = bool(categorized_commands.get(cat))
        has_na = cat in na_decisions

        if not has_commands and not has_na:
            errors.append(
                f"Validation contract incomplete: missing required category '{cat}'. "
                "Must provide an executable command or an explicit auditable N/A decision (with 'reason')."
            )
        elif has_na and not has_commands:
            reason = na_decisions[cat].strip()
            if len(reason) < 10:
                errors.append(
                    f"Auditable N/A decision for required category '{cat}' must include a substantive justification 'reason' (min 10 characters)."
                )

    return len(errors) == 0, errors


def verify_release(
    candidate_sha: str | None = None,
    version: str | None = None,
    artifacts: list[str] | None = None,
    artifact_dir: str | None = None,
    contract_path: pathlib.Path | None = None,
    allow_skip_dev_validation_for_testing: bool = False,
    cwd: pathlib.Path = ROOT,
) -> dict[str, object]:
    """Execute full offline release-candidate verification."""
    errors: list[str] = []

    # 1. Candidate commit SHA and Git state verification (P1-02)
    code_head, current_head = get_git_output(["rev-parse", "--verify", "HEAD"], cwd=cwd)
    code_branch, branch = get_git_output(["rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
    code_status, status_raw = get_git_output(["status", "--porcelain"], cwd=cwd)

    if code_head != 0 or not current_head:
        errors.append(
            f"Git execution failure: unable to resolve HEAD (code {code_head}): {current_head}"
        )
        current_head = "UNRESOLVED_HEAD"

    if code_status != 0:
        errors.append(f"Git status failure (code {code_status}): {status_raw}")

    is_dirty_initial = bool(status_raw) if code_status == 0 else True
    if is_dirty_initial and code_status == 0:
        dirty_lines = status_raw.splitlines()
        errors.append(
            f"Working tree is not clean at candidate ref ({current_head[:7]}) ({len(dirty_lines)} dirty item(s)). "
            "Uncommitted/unstaged changes prevent deterministic release verification."
        )

    # Validate specified candidate_sha against actual HEAD
    if candidate_sha:
        if candidate_sha.strip().lower() != current_head.strip().lower():
            errors.append(
                f"Candidate SHA mismatch: specified '{candidate_sha}' does not match actual Git HEAD '{current_head}'."
            )
    else:
        candidate_sha = current_head

    # 2. Read repository mode from profile
    profile_path = cwd / "config/project-profile.json"
    repo_mode = "unknown"
    if profile_path.is_file():
        try:
            with profile_path.open(encoding="utf-8") as fh:
                data = json.load(fh)
                repo_mode = data.get("repositoryMode", "project")
        except Exception as exc:
            errors.append(f"Failed to read project profile: {exc}")
    else:
        errors.append("config/project-profile.json not found.")

    # 3. Validation Contract completeness check (Item 1)
    contract, contract_err = load_validation_contract(contract_path, cwd=cwd)
    if contract_err:
        errors.append(f"Validation contract error: {contract_err}")
    else:
        contract_complete, contract_completeness_errs = evaluate_contract_completeness(contract, repo_mode)
        if not contract_complete:
            errors.extend(contract_completeness_errs)

    # 4. Mandatory Development Validation Prerequisite (P1-04, P2-01)
    dev_results: dict[str, object] = {}
    dev_validation_passed = False

    if allow_skip_dev_validation_for_testing:
        errors.append(
            "Mandatory development validation was skipped; release verification cannot PASS without complete development validation."
        )
    else:
        validate_script = cwd / "scripts/validate.py"
        if not validate_script.is_file():
            errors.append("Validation entrypoint scripts/validate.py not found.")
        else:
            try:
                cmd = [sys.executable, "-I", str(validate_script), "--json"]
                if contract_path:
                    cmd.extend(["--contract", str(contract_path)])
                res = subprocess.run(
                    cmd,
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                try:
                    dev_results = json.loads(res.stdout)
                except Exception:
                    dev_results = {
                        "exit_code": res.returncode,
                        "verdict": "FAIL",
                    }

                if res.returncode == 0 and dev_results.get("verdict") == "PASS":
                    dev_validation_passed = True
                else:
                    errors.append(
                        f"Development validation prerequisite failed with exit code {res.returncode}."
                    )
            except Exception as exc:
                errors.append(f"Failed to execute development validation: {sanitize_string(str(exc), cwd)}")

    # 5. Project Stack Release Validation Commands (P1-03, Item 1)
    release_commands_executed: list[dict[str, object]] = []
    if contract:
        rel_cmds = (
            contract.get("releaseCommands")
            or contract.get("release", {}).get("commands", [])
        )
        if "categories" in contract and isinstance(contract["categories"], dict):
            rel_cat = contract["categories"].get("release", {})
            if isinstance(rel_cat, dict) and "command" in rel_cat:
                rel_cmds.append(rel_cat)

        for idx, item in enumerate(rel_cmds, start=1):
            cmd_val = item.get("command")
            cmd_cwd = cwd / item.get("cwd", "") if item.get("cwd") else cwd
            stable_cmd_id = f"contract:release.command_{idx}"
            stable_name = f"Release validation command {idx}"
            if not cmd_val:
                errors.append(f"Release command [{stable_cmd_id}] missing 'command' string or list.")
                continue

            cmd_list = shlex.split(cmd_val) if isinstance(cmd_val, str) else list(cmd_val)
            try:
                res = subprocess.run(
                    cmd_list,
                    cwd=cmd_cwd,
                    capture_output=True,
                    text=True,
                    check=False,
                    env=item.get("env"),
                )
                passed = res.returncode == 0
                summary = (
                    f"Command completed successfully (exit {res.returncode})."
                    if passed
                    else f"Command failed with exit code {res.returncode}."
                )
                rec = {
                    "name": stable_name,
                    "command": stable_cmd_id,
                    "exit_code": res.returncode,
                    "status": "PASS" if passed else "FAIL",
                    "summary": summary,
                }
                release_commands_executed.append(rec)
                if res.returncode != 0:
                    errors.append(
                        f"Release validation command failed [{stable_cmd_id}] (exit {res.returncode})."
                    )
            except FileNotFoundError:
                errors.append(f"Missing mandatory release command binary for {stable_cmd_id}: {pathlib.Path(cmd_list[0]).name}")
            except Exception as exc:
                errors.append(f"Execution error on release command [{stable_cmd_id}]: {type(exc).__name__}")

    # 6. Post-Command Git State & Cleanliness Recheck (Item 3)
    code_post_head, post_head = get_git_output(["rev-parse", "--verify", "HEAD"], cwd=cwd)
    code_post_status, post_status_raw = get_git_output(["status", "--porcelain"], cwd=cwd)

    if code_post_head != 0 or post_head != current_head:
        errors.append(
            f"Git HEAD mutated during validation/release execution: started at '{current_head}', ended at '{post_head}'."
        )

    if code_post_status != 0 or bool(post_status_raw):
        mutated_files = post_status_raw.splitlines() if post_status_raw else []
        errors.append(
            f"Working tree mutated during validation/release execution ({len(mutated_files)} uncommitted/untracked change(s)). "
            f"Validation must not mutate tracked source or leave untracked artifacts: {', '.join(mutated_files[:5])}"
        )

    # 7. Explicit Non-Empty Release Artifact Inventory (P1-01)
    collected_artifacts: list[pathlib.Path] = []

    if artifacts:
        for item in artifacts:
            for piece in item.replace(",", " ").split():
                if piece:
                    collected_artifacts.append((cwd / piece).resolve())

    if artifact_dir:
        dir_path = (cwd / artifact_dir).resolve()
        if not dir_path.is_dir():
            errors.append(f"Specified artifact directory does not exist or is not a directory: {sanitize_string(str(dir_path), cwd)}")
        else:
            dir_files = [
                child for child in sorted(dir_path.iterdir())
                if child.is_file() and not child.name.startswith(".")
            ]
            if len(dir_files) == 0:
                errors.append(f"Empty artifact directory: specified artifact directory '{sanitize_string(str(dir_path), cwd)}' contains zero release artifacts.")
            else:
                collected_artifacts.extend(dir_files)

    if contract:
        contract_artifacts = (
            contract.get("releaseArtifacts")
            or contract.get("release", {}).get("artifacts", [])
        )
        for item in contract_artifacts:
            collected_artifacts.append((cwd / item).resolve())

    # Fail closed if zero artifacts were specified
    if not collected_artifacts:
        errors.append(
            "Release verification requires an explicit non-empty release artifact inventory. Zero artifacts were specified."
        )

    artifacts_ok, verified_artifacts, artifact_errors = verify_artifacts(collected_artifacts, cwd=cwd)
    if not artifacts_ok:
        errors.extend(artifact_errors)

    if len(verified_artifacts) == 0 and "Release verification requires an explicit non-empty release artifact inventory. Zero artifacts were specified." not in errors:
        errors.append("Zero valid release artifacts verified.")

    # 8. Final Verdict & Sanitized Evidence (Item 4, P2-01, P2-02)
    verdict = "PASS" if len(errors) == 0 else "FAIL"

    if verdict == "PASS":
        release_gate_status = (
            "PASSED: Release candidate verification succeeded offline. "
            "Production release requires explicit human owner approval."
        )
    else:
        release_gate_status = (
            f"BLOCKED: Release candidate verification FAILED ({len(errors)} error(s)). "
            "Release candidate cannot be approved or released."
        )

    _, git_version_str = get_git_output(["--version"], cwd=cwd)

    # Sanitize all error strings
    sanitized_errors = [sanitize_string(err, cwd) for err in errors]

    return {
        "verdict": verdict,
        "candidate_sha": candidate_sha,
        "head_sha": current_head,
        "branch": branch if code_branch == 0 else "N/A",
        "version": version or "unversioned-candidate",
        "verified_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository_mode": repo_mode,
        "working_tree_clean": not is_dirty_initial and not bool(post_status_raw),
        "clean_tree_pr_evidence": (not is_dirty_initial) and (not bool(post_status_raw)) and (verdict == "PASS"),
        "validation_mode": "clean_tree" if (not is_dirty_initial and not bool(post_status_raw)) else "dirty",
        "execution_mode": "LOCAL-FIRST / INDEPENDENT (No GitHub network or Actions dependency)",
        "dev_validation_passed": dev_validation_passed,
        "dev_validation_summary": dev_results.get("verdict", "NOT_PASSED"),
        "platform_coverage": {
            "host_os": platform.system(),
            "host_release": platform.release(),
            "host_arch": platform.machine(),
            "python_version": platform.python_version(),
            "git_version": git_version_str,
            "platform_limitations": (
                "Executed on Linux x86_64; native Windows (x64/arm64) and macOS QA "
                "remain required on trusted local platforms before production distribution."
            ),
        },
        "artifacts_verified_count": len(verified_artifacts),
        "artifacts": verified_artifacts,
        "release_commands": release_commands_executed,
        "errors": sanitized_errors,
        "signing_status": "Unsigned (local verification only; production signing verified separately)",
        "release_gate_status": release_gate_status,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Local-first release candidate verification runner (offline-capable)."
    )
    parser.add_argument(
        "--candidate-sha",
        help="Target commit SHA of release candidate (must match Git HEAD).",
    )
    parser.add_argument(
        "--version",
        help="Release candidate version or build tag (e.g. v1.0.0, P8.0-M5).",
    )
    parser.add_argument(
        "--artifacts",
        nargs="*",
        help="Paths to built release artifacts to verify and hash.",
    )
    parser.add_argument(
        "--artifact-dir",
        help="Directory containing release artifacts to verify and hash.",
    )
    parser.add_argument(
        "--contract",
        help="Path to validation contract JSON file.",
    )
    parser.add_argument(
        "--output-evidence",
        help="File path to write durable sanitized release verification evidence.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON summary.",
    )
    args = parser.parse_args()

    cwd = pathlib.Path.cwd()
    contract_path = pathlib.Path(args.contract).resolve() if args.contract else None

    # Preflight evidence output destination BEFORE executing or writing output (Fix 2)
    out_path = pathlib.Path(args.output_evidence) if args.output_evidence else None
    if out_path:
        safe, preflight_err = preflight_evidence_destination(out_path, cwd=cwd)
        if not safe:
            sys.stderr.write(f"ERROR: Prohibited evidence destination: {preflight_err}\n")
            return 1

    results = verify_release(
        candidate_sha=args.candidate_sha,
        version=args.version,
        artifacts=args.artifacts,
        artifact_dir=args.artifact_dir,
        contract_path=contract_path,
        cwd=cwd,
    )

    exit_code = 0 if results['verdict'] == "PASS" else 1

    if out_path:
        try:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("w", encoding="utf-8") as fh:
                json.dump(results, fh, indent=2)

            # Recheck destination cleanliness after writing
            post_safe, post_err = preflight_evidence_destination(out_path, cwd=cwd)
            if not post_safe:
                # Ensure saved evidence never contradicts the nonzero exit status
                results["verdict"] = "FAIL"
                results["clean_tree_pr_evidence"] = False
                results["errors"].append(f"Post-write evidence failure: {post_err}")
                results["release_gate_status"] = "BLOCKED: Post-write evidence failure."
                with out_path.open("w", encoding="utf-8") as fh:
                    json.dump(results, fh, indent=2)
                sys.stderr.write(f"ERROR: Post-write evidence failure: {post_err}\n")
                exit_code = 1
        except Exception as exc:
            sys.stderr.write(f"ERROR: Failed writing evidence output: {exc}\n")
            exit_code = 1

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print("=" * 70)
        print("LOCAL-FIRST RELEASE CANDIDATE VERIFICATION REPORT")
        print("=" * 70)
        print(f"VERDICT:         {results['verdict']}")
        print(f"Candidate SHA:   {results['candidate_sha']}")
        print(f"Version:         {results['version']}")
        print(f"Verified At:     {results['verified_at_utc']}")
        print(f"Execution Mode:  {results['execution_mode']}")
        print(f"Working Tree:    {'Clean' if results['working_tree_clean'] else 'DIRTY (fail closed)'}")
        print(f"Validation Mode: {results['validation_mode']}")
        print(f"PR Evidence:     {'Eligible (clean tree)' if results['clean_tree_pr_evidence'] else 'INELIGIBLE (scratch/bootstrap)'}")
        print(f"Platform:        {results['platform_coverage']['host_os']} {results['platform_coverage']['host_arch']}")
        print(f"Dev Validation:  {'PASSED' if results['dev_validation_passed'] else 'FAILED/INCOMPLETE'}")
        print("-" * 70)
        print(f"VERIFIED ARTIFACTS ({results['artifacts_verified_count']}):")
        for art in results["artifacts"]:
            print(f"  - {art['filename']} ({art['size_bytes']} bytes)")
            print(f"    SHA-256: {art['sha256']}")
        print("-" * 70)
        if results["errors"]:
            print(f"FAILURES / BLOCKERS ({len(results['errors'])}):")
            for err in results["errors"]:
                print(f"  [ERROR] {err}")
            print("-" * 70)
        print(f"Signing Status:  {results['signing_status']}")
        print(f"Release Gate:    {results['release_gate_status']}")
        print("=" * 70)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
