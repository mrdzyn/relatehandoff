#!/usr/bin/env python3
"""Local development validation entrypoint for ai-native projects.

Executes deterministic local validation offline without invoking GitHub Actions
or requiring network access to GitHub APIs.
"""

from __future__ import annotations

import argparse
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

SAFE_CATEGORIES: frozenset[str] = frozenset({
    "test",
    "build",
    "security",
    "lint",
    "format",
    "packaging",
    "package",
    "type_check",
    "typecheck",
    "integration",
    "unit",
    "contract",
})


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


def resolve_base_ref(specified_base: str | None, cwd: pathlib.Path = ROOT) -> tuple[str | None, str | None]:
    """Resolve base ref for diff comparisons.

    Returns (resolved_ref, error_message).
    """
    if specified_base:
        code, out = get_git_output(["rev-parse", "--verify", specified_base], cwd=cwd)
        if code == 0:
            return specified_base, None
        return None, f"Specified diff base ref '{specified_base}' cannot be resolved."

    for candidate in ("origin/main", "main", "HEAD~1"):
        code, _ = get_git_output(["rev-parse", "--verify", candidate], cwd=cwd)
        if code == 0:
            return candidate, None

    return None, "Unable to resolve diff base ref (checked origin/main, main, HEAD~1). Use --base <ref> or --bootstrap for greenfield initial setup."


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


def run_command(
    cmd: list[str] | str,
    description: str,
    cwd: pathlib.Path = ROOT,
    env: dict[str, str] | None = None,
    command_id: str | None = None,
) -> dict[str, object]:
    """Run a validation command and record allowlist-based sanitized result.

    Never persists arbitrary command arguments or diagnostics into shareable evidence.
    Records stable command identifiers or safe contract references.
    """
    cmd_list = shlex.split(cmd) if isinstance(cmd, str) else list(cmd)
    executable = cmd_list[0] if cmd_list else ""

    if command_id:
        safe_ref = command_id
    elif executable:
        try:
            rel = pathlib.Path(executable).resolve().relative_to(cwd.resolve())
            safe_ref = str(rel)
        except Exception:
            safe_ref = pathlib.Path(executable).name
    else:
        safe_ref = "empty"

    if not executable:
        return {
            "name": description,
            "command": safe_ref,
            "exit_code": 127,
            "status": "FAIL",
            "summary": "Empty command provided.",
        }

    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    try:
        res = subprocess.run(
            cmd_list,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
            env=merged_env,
        )
        passed = res.returncode == 0
        summary = (
            f"Check completed successfully (exit {res.returncode})."
            if passed
            else f"Check failed with exit code {res.returncode}."
        )
        return {
            "name": description,
            "command": safe_ref,
            "exit_code": res.returncode,
            "status": "PASS" if passed else "FAIL",
            "summary": summary,
        }
    except FileNotFoundError:
        return {
            "name": description,
            "command": safe_ref,
            "exit_code": 127,
            "status": "FAIL",
            "summary": f"Command binary not found: {pathlib.Path(executable).name}",
        }
    except Exception as exc:
        return {
            "name": description,
            "command": safe_ref,
            "exit_code": 127,
            "status": "FAIL",
            "summary": f"Command execution error: {type(exc).__name__}",
        }


def check_tracked_env_files(cwd: pathlib.Path = ROOT) -> dict[str, object]:
    """Strict fail-closed guard against tracked environment files."""
    code, out = get_git_output(["ls-files"], cwd=cwd)
    if code != 0:
        return {
            "name": "Tracked environment files guard",
            "command": "git:ls-files-env-guard",
            "exit_code": code,
            "status": "FAIL",
            "summary": f"git ls-files failed with code {code}",
        }

    tracked_lines = out.splitlines() if out else []
    prohibited = [
        f for f in tracked_lines
        if pathlib.Path(f).name == ".env" or pathlib.Path(f).name.startswith(".env.")
    ]
    if prohibited:
        return {
            "name": "Tracked environment files guard",
            "command": "git:ls-files-env-guard",
            "exit_code": 1,
            "status": "FAIL",
            "summary": f"Prohibited tracked environment files found ({len(prohibited)} file(s))",
        }

    return {
        "name": "Tracked environment files guard",
        "command": "git:ls-files-env-guard",
        "exit_code": 0,
        "status": "PASS",
        "summary": f"Zero prohibited tracked .env files found across {len(tracked_lines)} tracked files.",
    }


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


def evaluate_development_contract(
    contract: dict[str, object] | None,
    repo_mode: str,
) -> tuple[bool, list[dict[str, object]], list[str]]:
    """Validate and extract mandatory development categories (test, build, security).

    In project mode, categories 'test', 'build', 'security' must each have
    active executable development commands or an explicit justified N/A decision.
    Release-only commands do not count toward development categories.
    """
    errors: list[str] = []
    dev_cmds: list[dict[str, object]] = []

    if repo_mode != "project":
        return True, dev_cmds, errors

    if not contract:
        errors.append(
            "Project mode requires an explicit validation contract (config/validation-contract.json). No contract was found."
        )
        return False, dev_cmds, errors

    required_categories = ["test", "build", "security"]
    found_dev_categories: set[str] = set()
    na_decisions: dict[str, str] = {}

    # 1. Parse 'categories' mapping
    if "categories" in contract and isinstance(contract["categories"], dict):
        for cat_name, cat_data in contract["categories"].items():
            if not isinstance(cat_data, dict):
                continue
            cat_key = cat_name.lower().strip()
            # Release-only category does not satisfy development tests
            if cat_key == "release":
                continue

            status = cat_data.get("status", "active")
            if status == "not_applicable":
                na_decisions[cat_key] = cat_data.get("reason", "")
            elif "command" in cat_data and cat_data["command"]:
                found_dev_categories.add(cat_key)
                dev_cmds.append({
                    "name": cat_data.get("name", f"Stack validation [{cat_name}]"),
                    "category": cat_key,
                    "command": cat_data["command"],
                    "cwd": cat_data.get("cwd"),
                    "env": cat_data.get("env"),
                })

    # 2. Parse 'developmentCommands' list
    raw_dev_cmds = []
    if "developmentCommands" in contract and isinstance(contract["developmentCommands"], list):
        raw_dev_cmds.extend(contract["developmentCommands"])
    if "development" in contract and isinstance(contract["development"], dict):
        raw_dev_cmds.extend(contract["development"].get("commands", []))

    for item in raw_dev_cmds:
        if not isinstance(item, dict):
            continue
        cat_key = item.get("category", "").lower().strip()
        # Release-only commands do NOT satisfy development categories
        if cat_key == "release":
            continue

        if item.get("status") == "not_applicable":
            na_decisions[cat_key] = item.get("reason", "")
        elif "command" in item and item["command"]:
            if cat_key:
                found_dev_categories.add(cat_key)
            dev_cmds.append(item)

    # 3. Parse standalone 'notApplicable' list
    if "notApplicable" in contract and isinstance(contract["notApplicable"], list):
        for item in contract["notApplicable"]:
            if isinstance(item, dict) and "category" in item:
                cat_key = str(item["category"]).lower().strip()
                na_decisions[cat_key] = item.get("reason", "")

    # 4. Enforce mandatory categories: test, build, security
    for req_cat in required_categories:
        has_exec = req_cat in found_dev_categories
        has_na = req_cat in na_decisions

        if not has_exec and not has_na:
            errors.append(
                f"Validation contract incomplete: missing required development category '{req_cat}'. "
                "Must provide an executable development command or an explicit auditable N/A decision (with 'reason')."
            )
        elif has_na and not has_exec:
            reason = na_decisions[req_cat].strip()
            if len(reason) < 10:
                errors.append(
                    f"Auditable N/A decision for category '{req_cat}' requires a substantive justification (minimum 10 characters)."
                )

    return len(errors) == 0, dev_cmds, errors


def validate_development(
    repository: str | None = None,
    base: str | None = None,
    bootstrap: bool = False,
    allow_dirty: bool = False,
    skip_diff: bool = False,
    contract_path: pathlib.Path | None = None,
    cwd: pathlib.Path = ROOT,
) -> dict[str, object]:
    """Run all local development validation checks."""
    checks: list[dict[str, object]] = []

    # 1. Verify Git repository state
    code_head, head_sha = get_git_output(["rev-parse", "--verify", "HEAD"], cwd=cwd)
    code_branch, branch = get_git_output(["rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
    code_status, status_raw = get_git_output(["status", "--porcelain"], cwd=cwd)

    if code_head != 0:
        checks.append({
            "name": "Git repository HEAD verification",
            "command": "git:rev-parse-head",
            "exit_code": code_head,
            "status": "FAIL",
            "summary": f"Failed to resolve Git HEAD (code {code_head})",
        })
    if code_status != 0:
        checks.append({
            "name": "Git repository status verification",
            "command": "git:status",
            "exit_code": code_status,
            "status": "FAIL",
            "summary": f"git status failed with exit code {code_status}",
        })

    is_dirty = bool(status_raw) if code_status == 0 else True

    # Dirty-tree evidence semantics (Item 4)
    if is_dirty and not bootstrap and not allow_dirty:
        dirty_lines = status_raw.splitlines() if status_raw else []
        checks.append({
            "name": "Working tree cleanliness check",
            "command": "git:status",
            "exit_code": 1,
            "status": "FAIL",
            "summary": (
                f"Working tree is dirty ({len(dirty_lines)} uncommitted file(s)). "
                "Development validation requires a clean working tree unless in documented --bootstrap mode."
            ),
        })
    elif is_dirty and allow_dirty:
        checks.append({
            "name": "Working tree cleanliness check (scratch mode)",
            "command": "git:status",
            "exit_code": 0,
            "status": "PASS",
            "summary": "Scratch mode active (--allow-dirty); not valid as clean-tree PR evidence.",
        })
    elif is_dirty and bootstrap:
        checks.append({
            "name": "Working tree cleanliness check (bootstrap)",
            "command": "git:status",
            "exit_code": 0,
            "status": "PASS",
            "summary": "Bootstrap mode active: uncommitted working tree permitted for initial greenfield repository setup.",
        })
    else:
        checks.append({
            "name": "Working tree cleanliness check",
            "command": "git:status",
            "exit_code": 0,
            "status": "PASS",
            "summary": "Working tree is clean.",
        })

    # 2. Read repository mode from profile
    profile_path = cwd / "config/project-profile.json"
    repo_mode = "unknown"
    if profile_path.is_file():
        try:
            with profile_path.open(encoding="utf-8") as fh:
                data = json.load(fh)
                repo_mode = data.get("repositoryMode", "project")
        except Exception as exc:
            checks.append({
                "name": "Project profile JSON syntax check",
                "command": str(profile_path),
                "exit_code": 1,
                "status": "FAIL",
                "summary": f"Invalid project profile JSON: {exc}",
            })
    else:
        checks.append({
            "name": "Project profile presence check",
            "command": str(profile_path),
            "exit_code": 1,
            "status": "FAIL",
            "summary": "config/project-profile.json not found.",
        })

    if not repository:
        repository = (
            "mrdzyn/ai-native-project-template"
            if repo_mode == "template"
            else "example/project"
        )

    # 3. Project profile validator (Mandatory)
    validator_script = cwd / "scripts/validate_project_profile.py"
    if validator_script.is_file():
        checks.append(
            run_command(
                [sys.executable, "-I", str(validator_script), "--repository", repository],
                "Project profile validation",
                cwd=cwd,
                command_id="scripts/validate_project_profile.py",
            )
        )
    else:
        checks.append({
            "name": "Project profile validation",
            "command": "scripts/validate_project_profile.py",
            "exit_code": 1,
            "status": "FAIL",
            "summary": "Missing mandatory validator: scripts/validate_project_profile.py",
        })

    # 4. Master-only validations (Mandatory when repositoryMode == 'template')
    if repo_mode == "template":
        master_validator = cwd / "scripts/validate_master_template.py"
        if master_validator.is_file():
            checks.append(
                run_command(
                    [sys.executable, "-I", str(master_validator)],
                    "Master template inventory validation",
                    cwd=cwd,
                    command_id="scripts/validate_master_template.py",
                )
            )
        else:
            checks.append({
                "name": "Master template inventory validation",
                "command": "scripts/validate_master_template.py",
                "exit_code": 1,
                "status": "FAIL",
                "summary": "Missing mandatory validator: scripts/validate_master_template.py",
            })

        self_test_script = cwd / "scripts/test_validate_project_profile.py"
        if self_test_script.is_file():
            checks.append(
                run_command(
                    [sys.executable, "-I", str(self_test_script)],
                    "Project capability profile self-test matrix",
                    cwd=cwd,
                    command_id="scripts/test_validate_project_profile.py",
                )
            )
        else:
            checks.append({
                "name": "Project capability profile self-test matrix",
                "command": "scripts/test_validate_project_profile.py",
                "exit_code": 1,
                "status": "FAIL",
                "summary": "Missing mandatory validator: scripts/test_validate_project_profile.py",
            })

        entrypoints_test = cwd / "scripts/test_entrypoints.py"
        if entrypoints_test.is_file():
            checks.append(
                run_command(
                    [sys.executable, "-I", str(entrypoints_test)],
                    "Local entrypoints self-test suite",
                    cwd=cwd,
                    command_id="scripts/test_entrypoints.py",
                )
            )
        else:
            checks.append({
                "name": "Local entrypoints self-test suite",
                "command": "scripts/test_entrypoints.py",
                "exit_code": 1,
                "status": "FAIL",
                "summary": "Missing mandatory validator: scripts/test_entrypoints.py",
            })

        session_test_script = cwd / "scripts/test_session_context.py"
        if session_test_script.is_file():
            checks.append(
                run_command(
                    [sys.executable, "-I", str(session_test_script)],
                    "Session context recovery self-test suite",
                    cwd=cwd,
                    command_id="scripts/test_session_context.py",
                )
            )
        else:
            checks.append({
                "name": "Session context recovery self-test suite",
                "command": "scripts/test_session_context.py",
                "exit_code": 1,
                "status": "FAIL",
                "summary": "Missing mandatory validator: scripts/test_session_context.py",
            })

    # 5. Project Stack Validation Contract (Item 1 & Item 5)
    contract, contract_err = load_validation_contract(contract_path, cwd=cwd)
    if contract_err:
        checks.append({
            "name": "Project validation contract loading",
            "command": "contract:load",
            "exit_code": 1,
            "status": "FAIL",
            "summary": contract_err,
        })
    elif repo_mode == "project" or contract_path is not None:
        contract_ok, dev_cmds, contract_errors = evaluate_development_contract(contract, repo_mode)
        if not contract_ok:
            for err in contract_errors:
                checks.append({
                    "name": "Project validation contract completeness check",
                    "command": "contract:evaluate",
                    "exit_code": 1,
                    "status": "FAIL",
                    "summary": err,
                })
        else:
            for idx, item in enumerate(dev_cmds, start=1):
                cmd_val = item.get("command")
                raw_cat = item.get("category")
                cat_key = str(raw_cat).lower().strip() if raw_cat else ""
                cmd_cwd = cwd / item.get("cwd", "") if item.get("cwd") else cwd
                if cat_key in SAFE_CATEGORIES:
                    stable_cmd_id = f"contract:categories.{cat_key}"
                    stable_check_name = f"Stack validation contract [{cat_key}]"
                else:
                    stable_cmd_id = f"contract:dev.cmd_{idx}"
                    stable_check_name = f"Stack validation contract [command_{idx}]"
                if not cmd_val:
                    checks.append({
                        "name": stable_check_name,
                        "command": stable_cmd_id,
                        "exit_code": 1,
                        "status": "FAIL",
                        "summary": "Validation contract entry missing 'command' definition.",
                    })
                    continue
                checks.append(
                    run_command(
                        cmd_val,
                        stable_check_name,
                        cwd=cmd_cwd,
                        env=item.get("env"),
                        command_id=stable_cmd_id,
                    )
                )

    # 6. Git diff whitespace check
    if skip_diff and not bootstrap:
        checks.append({
            "name": "Git diff whitespace check",
            "command": "git:diff-check",
            "exit_code": 1,
            "status": "FAIL",
            "summary": "--skip-diff is prohibited during PR verification; only permitted in --bootstrap mode for initial setup.",
        })
    elif bootstrap:
        checks.append({
            "name": "Git diff whitespace check",
            "command": "git:diff-check",
            "exit_code": 0,
            "status": "PASS",
            "summary": "Bootstrap mode active: git diff check skipped for initial greenfield repository setup.",
        })
    else:
        resolved_base, base_err = resolve_base_ref(base, cwd=cwd)
        if base_err:
            checks.append({
                "name": "Git diff base resolution",
                "command": "git:rev-parse-base",
                "exit_code": 1,
                "status": "FAIL",
                "summary": base_err,
            })
        else:
            checks.append(
                run_command(
                    ["git", "diff", "--check", f"{resolved_base}...HEAD"],
                    f"Git diff whitespace check ({resolved_base}...HEAD)",
                    cwd=cwd,
                    command_id="git:diff-check",
                )
            )

    # 7. Tracked environment file guard
    checks.append(check_tracked_env_files(cwd=cwd))

    # 8. Post-development Git integrity recheck (P1-02)
    code_post_head, post_head_sha = get_git_output(["rev-parse", "HEAD"], cwd=cwd)
    code_post_status, post_status_raw = get_git_output(["status", "--porcelain"], cwd=cwd)
    head_changed = (code_head == 0 and code_post_head == 0 and head_sha != post_head_sha)
    mutated_files = [line.strip() for line in post_status_raw.splitlines() if line.strip()] if post_status_raw else []

    if code_post_head != 0:
        checks.append({
            "name": "Post-development Git integrity check",
            "command": "git:post-status",
            "exit_code": 1,
            "status": "FAIL",
            "summary": f"Failed to re-verify Git HEAD after development commands (exit {code_post_head}).",
        })
    elif head_changed:
        checks.append({
            "name": "Post-development Git integrity check",
            "command": "git:post-status",
            "exit_code": 1,
            "status": "FAIL",
            "summary": f"Git HEAD unexpectedly changed during development execution: {head_sha[:7]} -> {post_head_sha[:7]}.",
        })
    elif code_post_status != 0:
        checks.append({
            "name": "Post-development Git integrity check",
            "command": "git:post-status",
            "exit_code": 1,
            "status": "FAIL",
            "summary": f"Failed to re-verify git status --porcelain after development commands (exit {code_post_status}).",
        })
    elif mutated_files and not is_dirty:
        checks.append({
            "name": "Post-development Git integrity check",
            "command": "git:post-status",
            "exit_code": 1,
            "status": "FAIL",
            "summary": f"Working tree mutated during development execution ({len(mutated_files)} uncommitted/untracked change(s)). Commands must not mutate tracked source or leave non-ignored artifacts.",
        })
    elif mutated_files and is_dirty:
        initial_dirty = set(status_raw.splitlines()) if status_raw else set()
        new_or_modified = [line for line in post_status_raw.splitlines() if line not in initial_dirty]
        if new_or_modified:
            checks.append({
                "name": "Post-development Git integrity check",
                "command": "git:post-status",
                "exit_code": 1,
                "status": "FAIL",
                "summary": f"Development execution introduced {len(new_or_modified)} new uncommitted change(s).",
            })
        else:
            checks.append({
                "name": "Post-development Git integrity check",
                "command": "git:post-status",
                "exit_code": 0,
                "status": "PASS",
                "summary": "Post-development Git HEAD and working tree state verified unchanged.",
            })
    else:
        checks.append({
            "name": "Post-development Git integrity check",
            "command": "git:post-status",
            "exit_code": 0,
            "status": "PASS",
            "summary": "Post-development Git HEAD and working tree state verified unchanged.",
        })

    post_is_clean = (not is_dirty) and (not bool(post_status_raw))
    all_passed = all(c.get("status") == "PASS" for c in checks)

    # Determine clean_tree_pr_evidence semantics (Item 4)
    clean_tree_pr_evidence = post_is_clean and (not allow_dirty) and (not bootstrap)
    if clean_tree_pr_evidence:
        validation_mode = "clean_tree"
    elif bootstrap:
        validation_mode = "bootstrap"
    elif allow_dirty:
        validation_mode = "scratch"
    else:
        validation_mode = "dirty"

    return {
        "verdict": "PASS" if all_passed else "FAIL",
        "head_sha": head_sha if code_head == 0 else "N/A",
        "branch": branch if code_branch == 0 else "N/A",
        "repository_mode": repo_mode,
        "repository": repository,
        "working_tree_clean": post_is_clean,
        "clean_tree_pr_evidence": clean_tree_pr_evidence,
        "validation_mode": validation_mode,
        "environment": {
            "os": platform.platform(),
            "python": platform.python_version(),
        },
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Local-first development validation runner (offline-capable)."
    )
    parser.add_argument(
        "--repository",
        help="Repository owner/name to validate profile against.",
    )
    parser.add_argument(
        "--base",
        help="Base ref for git diff check (e.g. origin/main, main, HEAD~1).",
    )
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="Greenfield bootstrap mode (initial repo setup when no base ref exists).",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Explicitly permit dirty worktree during active local scratch/prototyping.",
    )
    parser.add_argument(
        "--contract",
        help="Path to validation contract JSON file.",
    )
    parser.add_argument(
        "--output-evidence",
        help="File path to write durable sanitized development validation evidence.",
    )
    parser.add_argument(
        "--skip-diff",
        action="store_true",
        help="Skip diff check (only allowed with --bootstrap).",
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

    results = validate_development(
        repository=args.repository,
        base=args.base,
        bootstrap=args.bootstrap,
        allow_dirty=args.allow_dirty,
        skip_diff=args.skip_diff,
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
                results["checks"].append({
                    "name": "Post-write evidence destination integrity",
                    "command": "preflight_evidence_destination",
                    "exit_code": 1,
                    "status": "FAIL",
                    "summary": post_err or "Evidence output dirtied worktree.",
                })
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
        print("LOCAL-FIRST DEVELOPMENT VALIDATION REPORT")
        print("=" * 70)
        print(f"HEAD SHA:        {results['head_sha']}")
        print(f"Branch:          {results['branch']}")
        print(f"Repository Mode: {results['repository_mode']}")
        print(f"Repository:      {results['repository']}")
        print(f"Working Tree:    {'Clean' if results['working_tree_clean'] else 'DIRTY (uncommitted files)'}")
        print(f"Validation Mode: {results['validation_mode']}")
        print(f"PR Evidence:     {'Eligible (clean tree)' if results['clean_tree_pr_evidence'] else 'INELIGIBLE (scratch/bootstrap)'}")
        print(f"Platform:        {results['environment']['os']}")
        print(f"Python:          {results['environment']['python']}")
        print("-" * 70)
        print("CHECK RESULTS:")
        for idx, check in enumerate(results["checks"], start=1):
            status = check["status"]
            name = check["name"]
            exit_code_check = check["exit_code"]
            print(f"  [{status}] {idx}. {name} (exit {exit_code_check})")
            if status != "PASS":
                print(f"         Command: {check['command']}")
                print(f"         Summary: {check['summary']}")
        print("-" * 70)
        print(f"VERDICT: {results['verdict']}")
        print("=" * 70)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
