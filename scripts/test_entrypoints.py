#!/usr/bin/env python3
"""Targeted self-tests for local development and release verification entrypoints.

Verifies fail-closed execution, offline capability, artifact inventory enforcement,
SHA matching, project validation contracts, dirty worktree guards, post-command
mutation rechecks, sanitized evidence, and canary failure paths.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent


def probe_kernel_network_isolation(
    system_override: str | None = None,
    which_override: callable | None = None,
) -> tuple[bool, str]:
    """Check platform and probe actual kernel-level network isolation capability.

    Handles Linux, macOS (Darwin), and native Windows correctly.
    Never crashes on missing executable or unsupported platforms.
    Reports unsupported isolation as NOT VERIFIED, not PASS.
    Tests actual socket blockage inside namespace, not merely namespace creation.
    Distinguishes verified isolation (ENETUNREACH/EPERM) from generic connection failure or timeout.
    """
    sys_name = system_override if system_override is not None else platform.system()
    if sys_name != "Linux":
        return False, f"[NOT VERIFIED] Kernel-level network namespace isolation is not supported on {sys_name}."

    which_fn = which_override if which_override is not None else shutil.which
    unshare_bin = which_fn("unshare")
    if not unshare_bin:
        return False, "[NOT VERIFIED] 'unshare' command not found on host PATH."

    try:
        # Actually probe network socket blocking inside namespace, not just namespace creation
        probe_code = (
            "import socket, sys, errno\n"
            "s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n"
            "s.settimeout(0.5)\n"
            "try:\n"
            "    s.connect(('1.1.1.1', 80))\n"
            "    sys.exit(0)\n"  # Connected -> network reachable
            "except OSError as e:\n"
            "    if e.errno in (errno.ENETUNREACH, errno.EPERM, errno.EACCES):\n"
            "        sys.exit(42)\n"  # Verified kernel isolation
            "    elif isinstance(e, socket.timeout) or e.errno in (errno.ETIMEDOUT, errno.ECONNREFUSED):\n"
            "        sys.exit(43)\n"  # Generic timeout / connection failure
            "    else:\n"
            "        sys.exit(44)\n"  # Other generic OSError
        )
        proc = subprocess.run(
            [unshare_bin, "-rn", sys.executable, "-c", probe_code],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
        if proc.returncode == 42:
            return True, "[PASS] Genuine kernel-level network isolation verified (ENETUNREACH/EPERM in namespace)."
        elif proc.returncode == 43:
            return False, "[NOT VERIFIED] Generic connection failure/timeout inside namespace; does not prove network isolation."
        elif proc.returncode == 44:
            err = (proc.stderr or proc.stdout).strip()
            return False, f"[NOT VERIFIED] Generic socket error inside namespace ({err}); not proven as kernel network isolation."
        elif proc.returncode == 0:
            return False, "[NOT VERIFIED] External network was reachable inside unshare namespace."
        else:
            err = (proc.stderr or proc.stdout).strip()
            return False, f"[NOT VERIFIED] Kernel-level namespace creation failed ({err or 'code ' + str(proc.returncode)})."
    except FileNotFoundError:
        return False, "[NOT VERIFIED] 'unshare' binary not found."
    except PermissionError as exc:
        return False, f"[NOT VERIFIED] 'unshare' execution not permitted: {exc}"
    except Exception as exc:
        return False, f"[NOT VERIFIED] Probe error: {exc}"


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


validate_mod = load_module("validate", ROOT / "scripts/validate.py")
verify_mod = load_module("verify_release", ROOT / "scripts/verify_release.py")


def create_clean_git_repo(tmp_path: pathlib.Path) -> pathlib.Path:
    """Helper to initialize a clean git repository."""
    repo = tmp_path
    subprocess.run(["git", "init"], cwd=repo, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    return repo


# 1. Zero specified artifacts must FAIL (P1-01)
def test_zero_specified_artifacts_fails():
    """Verify release verification fails closed if no artifacts are specified."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        dummy = repo / "README.md"
        dummy.write_text("# Test Repo\n", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = verify_mod.verify_release(
            artifacts=None,
            artifact_dir=None,
            cwd=repo,
        )
        assert res["verdict"] == "FAIL", res
        assert any("Zero artifacts were specified" in e for e in res["errors"]), res["errors"]
        assert "BLOCKED" in res["release_gate_status"], res["release_gate_status"]
    print("  ✓ Zero specified artifacts fails closed.")


# 2. Empty artifact directory must FAIL (P1-01)
def test_empty_artifact_directory_fails():
    """Verify release verification fails closed if artifact directory has no files."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        dummy = repo / "README.md"
        dummy.write_text("# Test Repo\n", encoding="utf-8")
        empty_dir = repo / "dist"
        empty_dir.mkdir()
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = verify_mod.verify_release(
            artifact_dir=str(empty_dir),
            cwd=repo,
        )
        assert res["verdict"] == "FAIL", res
        assert any("contains zero release artifacts" in e for e in res["errors"]), res["errors"]
        assert "BLOCKED" in res["release_gate_status"], res["release_gate_status"]
    print("  ✓ Empty artifact directory fails closed.")


# 3. Wrong candidate SHA must FAIL (P1-02)
def test_wrong_candidate_sha_fails():
    """Verify release verification fails closed if supplied SHA does not match HEAD."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        dummy = repo / "README.md"
        dummy.write_text("# Test Repo\n", encoding="utf-8")
        art = repo / "release.tar.gz"
        art.write_bytes(b"content")
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        wrong_sha = "0000000000000000000000000000000000000000"
        res = verify_mod.verify_release(
            candidate_sha=wrong_sha,
            artifacts=[str(art)],
            cwd=repo,
        )
        assert res["verdict"] == "FAIL", res
        assert any("Candidate SHA mismatch" in e for e in res["errors"]), res["errors"]
    print("  ✓ Wrong candidate SHA fails closed.")


# 4. Git execution/status failure must FAIL (P1-02)
def test_git_execution_status_failure_fails():
    """Verify release verification fails closed if git command or metadata fails."""
    with tempfile.TemporaryDirectory() as tmp:
        non_git_dir = pathlib.Path(tmp)
        art = non_git_dir / "art.bin"
        art.write_bytes(b"data")

        res = verify_mod.verify_release(
            artifacts=[str(art)],
            cwd=non_git_dir,
        )
        assert res["verdict"] == "FAIL", res
        assert any("Git execution failure" in e or "Git status failure" in e for e in res["errors"]), res["errors"]
    print("  ✓ Git execution/status failure fails closed.")


# 5. Missing mandatory validator must FAIL (P1-05 & P1-03)
def test_missing_mandatory_validator_fails():
    """Verify validate.py fails closed if a mandatory template validator is missing."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "template", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n")

        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = validate_mod.validate_development(bootstrap=True, cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert any("Missing mandatory validator" in str(c.get("summary", "")) for c in res["checks"]), res["checks"]
    print("  ✓ Missing mandatory validator fails closed.")


# 6. Invalid diff base must FAIL (P1-05)
def test_invalid_diff_base_fails():
    """Verify validate.py fails closed when an unresolvable diff base is specified."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        dummy = repo / "README.md"
        dummy.write_text("# Test\n", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = validate_mod.validate_development(base="invalid-nonexistent-git-ref-9999", cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert any("cannot be resolved" in str(c.get("summary", "")) for c in res["checks"]), res["checks"]
    print("  ✓ Invalid diff base fails closed.")


# 7. Dirty development working tree must FAIL (Item 2)
def test_dirty_development_tree_fails_validate():
    """Verify validate.py fails on a dirty working tree unless in bootstrap mode."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        dummy = repo / "README.md"
        dummy.write_text("# Test\n", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "clean init"], cwd=repo, capture_output=True, check=True)

        # Create uncommitted dirty file
        (repo / "dirty_uncommitted.txt").write_text("dirty\n", encoding="utf-8")

        # 1. Normal validate fails closed
        res_fail = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res_fail["verdict"] == "FAIL", res_fail
        assert any("Working tree is dirty" in str(c.get("summary", "")) for c in res_fail["checks"])

        # 2. Bootstrap mode permits uncommitted setup
        res_bootstrap = validate_mod.validate_development(bootstrap=True, cwd=repo)
        # Note: res_bootstrap might fail on missing profile, but working tree check itself passes:
        wt_check = next(c for c in res_bootstrap["checks"] if "Working tree" in c["name"])
        assert wt_check["status"] == "PASS"
        assert "Bootstrap mode active" in str(wt_check["summary"])
    print("  ✓ Dirty development tree fails closed unless in documented bootstrap mode.")


# 8. Empty or incomplete contract fails project release (Item 1)
def test_empty_or_incomplete_contract_fails_project_release():
    """Verify project mode release verification fails closed on absent or incomplete contracts."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        art = repo / "app.tar.gz"
        art.write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # 1. Absent contract fails closed
        res_absent = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
        assert res_absent["verdict"] == "FAIL", res_absent
        assert any("requires a complete validation contract" in e for e in res_absent["errors"]), res_absent["errors"]

        # 2. Contract missing 'security' category fails closed
        contract_missing_sec = config_dir / "validation-contract.json"
        contract_missing_sec.write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"name": "Tests", "command": ["echo", "test"]},
                    "build": {"name": "Build", "command": ["echo", "build"]},
                }
            }),
            encoding="utf-8",
        )
        res_missing_sec = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
        assert res_missing_sec["verdict"] == "FAIL", res_missing_sec
        assert any("missing required category 'security'" in e for e in res_missing_sec["errors"]), res_missing_sec["errors"]
    print("  ✓ Empty or incomplete contract fails closed in project mode.")


# 9. Auditable N/A decision accepted with substantive justification (Item 1)
def test_auditable_na_decision_accepted():
    """Verify explicit auditable N/A decision with substantive reason is accepted."""
    contract = {
        "schemaVersion": 1,
        "categories": {
            "test": {"command": ["echo", "test"]},
            "build": {"command": ["echo", "build"]},
            "security": {
                "status": "not_applicable",
                "reason": "Static documentation repository with zero third-party dependencies.",
            },
        }
    }
    ok, errs = verify_mod.evaluate_contract_completeness(contract, "project")
    assert ok is True, errs
    assert len(errs) == 0

    # Insufficient/empty reason must fail closed
    contract_bad_reason = {
        "schemaVersion": 1,
        "categories": {
            "test": {"command": ["echo", "test"]},
            "build": {"command": ["echo", "build"]},
            "security": {
                "status": "not_applicable",
                "reason": "n/a",
            },
        }
    }
    ok2, errs2 = verify_mod.evaluate_contract_completeness(contract_bad_reason, "project")
    assert ok2 is False, errs2
    assert any("substantive justification 'reason'" in e for e in errs2), errs2
    print("  ✓ Auditable N/A decisions enforced with substantive justification.")


# 10. Missing mandatory release command must FAIL (Item 1 & Item 6)
def test_missing_mandatory_release_command_fails():
    """Verify release verification fails if a release command binary is missing."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "build": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained project; zero dependencies."},
                    "release": {"command": ["nonexistent_binary_tool_xyz_99999"]},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n")
        (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))

        art = repo / "artifact.zip"
        art.write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert any("Missing mandatory release command binary" in e for e in res["errors"]), res["errors"]
    print("  ✓ Missing mandatory release command fails closed.")


# 11. Post-command Git mutation fails release (Item 3 & Item 6)
def test_post_command_git_mutation_fails_release():
    """Verify release verification fails if validation commands mutate working tree or HEAD."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        # Release command that maliciously mutates a tracked file
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "build": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained test fixtures."},
                    "release": {"command": ["python3", "-c", "import pathlib; pathlib.Path('README.md').write_text('mutated!')"]},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n")
        (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))

        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        art = repo / "artifact.zip"
        art.write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert any("Working tree mutated during validation/release execution" in e for e in res["errors"]), res["errors"]
    print("  ✓ Post-command Git mutation fails closed.")


# 12. Sanitized evidence redacts secrets, credentials, and local paths (Item 4 & Item 6)
def test_unsafe_evidence_redaction():
    """Verify secrets and sensitive local paths are redacted from evidence output."""
    raw_leak = (
        "Fatal error connecting to https://api.service.com with token: ghp_1234567890abcdef1234567890 "
        "and password='supersecretpass123' at /home/antigravity/mrdzyn/repo/file.txt "
        "temp=/tmp/tmpabcdef123/build.log"
    )
    fake_root = pathlib.Path("/home/antigravity/mrdzyn/repo")
    sanitized = verify_mod.sanitize_string(raw_leak, root_dir=fake_root)

    assert "ghp_1234567890abcdef1234567890" not in sanitized
    assert "supersecretpass123" not in sanitized
    assert "/home/antigravity/mrdzyn/repo" not in sanitized
    assert "/tmp/tmpabcdef123" not in sanitized
    assert "[REDACTED]" in sanitized
    assert "<repo>" in sanitized
    assert "<temp_path>" in sanitized
    print("  ✓ Secrets and sensitive local paths redacted in sanitized evidence.")


# 13. Genuine offline network blockage test (Item 6)
def test_blocked_network_offline_verification():
    """Verify execution succeeds offline with in-process sockets blocked and accurate environment reporting."""
    orig_connect = socket.socket.connect

    def blocked_connect(self, address):
        raise OSError("Simulated offline environment: Network is unreachable (AF_INET/AF_INET6 blocked)")

    socket.socket.connect = blocked_connect
    try:
        with tempfile.TemporaryDirectory() as tmp:
            repo = create_clean_git_repo(pathlib.Path(tmp))
            config_dir = repo / "config"
            config_dir.mkdir(parents=True)
            (config_dir / "project-profile.json").write_text(
                json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
                encoding="utf-8",
            )
            (config_dir / "validation-contract.json").write_text(
                json.dumps({
                    "schemaVersion": 1,
                    "categories": {
                        "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                        "build": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                        "security": {"status": "not_applicable", "reason": "Completely offline isolated fixture."},
                    }
                }),
                encoding="utf-8",
            )
            scripts_dir = repo / "scripts"
            scripts_dir.mkdir()
            (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n")
            (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))

            art = repo / "offline-app.tar.gz"
            art.write_bytes(b"offline-binary-stream")

            subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
            subprocess.run(["git", "add", "."], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

            res = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
            assert res["verdict"] == "PASS", res
            assert "LOCAL-FIRST / INDEPENDENT" in res["execution_mode"]
    finally:
        socket.socket.connect = orig_connect

    verified, msg = probe_kernel_network_isolation()
    if verified:
        print(f"  ✓ {msg}")
    else:
        print(f"  ✓ Verified offline in-process execution with blocked socket connections. (Subprocess network isolation: {msg})")


# 13b. Regression test for missing unshare and cross-platform isolation handling (Fix 1)
def test_missing_unshare_regression():
    """Verify missing unshare and cross-platform handling cleanly reports NOT VERIFIED without crashing."""
    # 1. Missing unshare binary on Linux
    verified_missing, msg_missing = probe_kernel_network_isolation(
        system_override="Linux",
        which_override=lambda _: None,
    )
    assert verified_missing is False
    assert "[NOT VERIFIED]" in msg_missing
    assert "'unshare' command not found" in msg_missing

    # 2. macOS (Darwin) platform
    verified_mac, msg_mac = probe_kernel_network_isolation(system_override="Darwin")
    assert verified_mac is False
    assert "[NOT VERIFIED]" in msg_mac
    assert "Darwin" in msg_mac

    # 3. Windows platform
    verified_win, msg_win = probe_kernel_network_isolation(system_override="Windows")
    assert verified_win is False
    assert "[NOT VERIFIED]" in msg_win
    assert "Windows" in msg_win

    # 4. Host probe execution does not crash
    verified_host, msg_host = probe_kernel_network_isolation()
    assert isinstance(verified_host, bool)
    assert isinstance(msg_host, str)
    if not verified_host:
        assert "[NOT VERIFIED]" in msg_host
    print("  ✓ Cross-platform unshare absence and OS compatibility verified without crash.")


# 14. Real positive end-to-end test with real test & build commands (Item 5)
def test_valid_real_artifact_with_complete_validation_passes():
    """Verify full end-to-end local release verification with real project test, build, and security checks."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text(
            "#!/usr/bin/env python3\nimport sys; sys.exit(0)\n",
            encoding="utf-8",
        )
        (scripts_dir / "validate.py").write_text(
            (ROOT / "scripts/validate.py").read_text(encoding="utf-8"),
            encoding="utf-8",
        )

        # Real Python application code and test
        src_dir = repo / "src"
        src_dir.mkdir()
        (src_dir / "calculator.py").write_text("def add(a, b): return a + b\n", encoding="utf-8")

        tests_dir = repo / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_calc.py").write_text(
            "import unittest\nfrom src.calculator import add\n"
            "class CalcTest(unittest.TestCase):\n"
            "    def test_add(self): self.assertEqual(add(2, 3), 5)\n"
            "if __name__ == '__main__': unittest.main()\n",
            encoding="utf-8",
        )

        # Real build script that packages src into tarball inside dist/
        (scripts_dir / "build_release.py").write_text(
            "#!/usr/bin/env python3\nimport tarfile, pathlib\n"
            "dist = pathlib.Path('dist')\n"
            "dist.mkdir(exist_ok=True)\n"
            "with tarfile.open(dist / 'calc-v1.0.0.tar.gz', 'w:gz') as tar:\n"
            "    tar.add('src/calculator.py', arcname='calculator.py')\n"
            "print('Packaged real release artifact: dist/calc-v1.0.0.tar.gz')\n",
            encoding="utf-8",
        )

        # Real validation contract executing real test, real build, real security check
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {
                        "name": "Unit test suite",
                        "command": [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
                    },
                    "build": {
                        "name": "Release build packaging",
                        "command": [sys.executable, "scripts/build_release.py"],
                    },
                    "security": {
                        "name": "Tracked environment security check",
                        "command": [sys.executable, "-c", "import pathlib, sys; envs = list(pathlib.Path('.').rglob('.env*')); sys.exit(1 if envs else 0)"],
                    },
                },
                "releaseArtifacts": [
                    "dist/calc-v1.0.0.tar.gz"
                ],
            }),
            encoding="utf-8",
        )

        # Initial commit on main
        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "initial base commit"], cwd=repo, capture_output=True, check=True)

        # Run build command first to create the artifact, then add to git or gitignore dist
        subprocess.run([sys.executable, "scripts/build_release.py"], cwd=repo, check=True)
        (repo / ".gitignore").write_text("dist/\n__pycache__/\n*.pyc\n", encoding="utf-8")
        subprocess.run(["git", "add", ".gitignore"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "add gitignore for dist and pycache"], cwd=repo, capture_output=True, check=True)

        _, head_sha = verify_mod.get_git_output(["rev-parse", "HEAD"], cwd=repo)

        res = verify_mod.verify_release(
            candidate_sha=head_sha,
            version="v1.0.0",
            cwd=repo,
        )
        assert res["verdict"] == "PASS", res
        assert res["candidate_sha"] == head_sha
        assert res["artifacts_verified_count"] == 1
        assert res["artifacts"][0]["filename"] == "calc-v1.0.0.tar.gz"
        assert res["artifacts"][0]["size_bytes"] > 0
        assert len(res["artifacts"][0]["sha256"]) == 64
        assert res["dev_validation_passed"] is True
        assert res["working_tree_clean"] is True
        assert res["release_gate_status"].startswith("PASSED")
    print("  ✓ Real project positive test executes actual tests, build, and security checks.")


# 15. Preserved: Tracked env files guards
def test_tracked_env_clean():
    """Verify tracked env guard passes on clean repository."""
    res = validate_mod.check_tracked_env_files(cwd=ROOT)
    assert res["status"] == "PASS", res
    assert res["exit_code"] == 0, res
    print("  ✓ check_tracked_env_files clean check passed.")


def test_tracked_env_fails_closed():
    """Verify tracked env guard fails closed when .env file is tracked."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        env_file = repo / ".env.production"
        env_file.write_text("SECRET=123\n", encoding="utf-8")
        subprocess.run(["git", "add", ".env.production"], cwd=repo, check=True)

        res = validate_mod.check_tracked_env_files(cwd=repo)
        assert res["status"] == "FAIL", res
        assert res["exit_code"] == 1, res
        assert "Prohibited tracked environment files found" in str(res["summary"])
    print("  ✓ check_tracked_env_files fail-closed test passed.")


# 17. Project mode development validation requires complete contract (Item 1)
def test_project_mode_development_validation_requires_contract():
    """Verify project mode development validation fails when contract categories are absent."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # 1. Missing contract entirely
        res_no_contract = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res_no_contract["verdict"] == "FAIL", res_no_contract
        assert any("requires an explicit validation contract" in str(c.get("summary", "")) for c in res_no_contract["checks"])

        # 2. Incomplete contract (missing build and security)
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                }
            }),
            encoding="utf-8",
        )
        res_incomplete = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res_incomplete["verdict"] == "FAIL", res_incomplete
        assert any("missing required development category 'build'" in str(c.get("summary", "")) for c in res_incomplete["checks"])
    print("  ✓ Project mode development validation enforces complete contract categories.")


# 18. Release-only commands do not count toward development categories (Item 1)
def test_release_only_command_does_not_satisfy_development_test():
    """Verify release-only commands cannot satisfy mandatory development test/build/security categories."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "release": {"name": "Release tarball check", "command": ["echo", "release"]},
                }
            }),
            encoding="utf-8",
        )
        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert any("missing required development category 'test'" in str(c.get("summary", "")) for c in res["checks"])
    print("  ✓ Release-only commands do not satisfy mandatory development test categories.")


# 19. Shareable evidence is allowlist-based with zero raw stdout/stderr keys (Item 2)
def test_allowlist_evidence_no_raw_output():
    """Verify evidence dictionaries do not store arbitrary output/stdout/stderr/raw_output keys."""
    # Test validate_development evidence on isolated clean fixture
    with tempfile.TemporaryDirectory() as tmp_dev:
        dev_repo = create_clean_git_repo(pathlib.Path(tmp_dev))
        config_dir = dev_repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": [sys.executable, "-c", "import sys; sys.exit(0)"]},
                    "build": {"command": [sys.executable, "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained schema verification."},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = dev_repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        subprocess.run(["git", "branch", "-M", "main"], cwd=dev_repo, check=True)
        subprocess.run(["git", "add", "."], cwd=dev_repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=dev_repo, capture_output=True, check=True)

        dev_res = validate_mod.validate_development(base="HEAD", cwd=dev_repo)
        assert dev_res["verdict"] == "PASS"
        assert "stdout" not in dev_res
        assert "stderr" not in dev_res
        assert "output" not in dev_res
        for check in dev_res["checks"]:
            assert "stdout" not in check
            assert "stderr" not in check
            assert "raw_output" not in check
            assert "output" not in check
            # Check allowlisted keys
            assert set(check.keys()) <= {"name", "command", "exit_code", "status", "summary"}

    # Test verify_release evidence
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        (repo / "README.md").write_text("test\n", encoding="utf-8")
        art = repo / "app.tar.gz"
        art.write_bytes(b"content")
        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        rel_res = verify_mod.verify_release(artifacts=[str(art)], cwd=repo)
        assert "stdout" not in rel_res
        assert "stderr" not in rel_res
        assert "output" not in rel_res
        assert "raw_output" not in rel_res
        for cmd_rec in rel_res["release_commands"]:
            assert "stdout" not in cmd_rec
            assert "stderr" not in cmd_rec
            assert "output" not in cmd_rec
            assert "raw_output" not in cmd_rec
            assert set(cmd_rec.keys()) <= {"name", "command", "exit_code", "status", "summary"}
    print("  ✓ Shareable evidence contains only allowlisted keys (zero raw stdout/stderr/output).")


# 20. Dirty-tree evidence semantics (Item 4)
def test_scratch_mode_evidence_semantics():
    """Verify scratch-mode validation reports clean_tree_pr_evidence=False and validation_mode='scratch'."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        (repo / "README.md").write_text("clean\n", encoding="utf-8")
        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # 1. Clean tree
        res_clean = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res_clean["working_tree_clean"] is True
        assert res_clean["clean_tree_pr_evidence"] is True
        assert res_clean["validation_mode"] == "clean_tree"

        # 2. Scratch mode on dirty tree
        (repo / "scratch_file.txt").write_text("scratch\n", encoding="utf-8")
        res_scratch = validate_mod.validate_development(base="HEAD", allow_dirty=True, cwd=repo)
        assert res_scratch["working_tree_clean"] is False
        assert res_scratch["clean_tree_pr_evidence"] is False
        assert res_scratch["validation_mode"] == "scratch"

        # 3. Bootstrap mode
        res_boot = validate_mod.validate_development(bootstrap=True, cwd=repo)
        assert res_boot["clean_tree_pr_evidence"] is False
        assert res_boot["validation_mode"] == "bootstrap"
    print("  ✓ Dirty-tree evidence semantics accurately distinguish clean-tree from scratch/bootstrap.")


# 21. Evidence-file verdict consistency for development validation (Fix 2)
def test_evidence_verdict_consistency_development():
    """Verify development exit status and saved evidence verdict are strictly consistent.

    1. Prohibited destination: fails closed (exit 1), file is NEVER written.
    2. Clean tree PASS: exit 0, saved evidence verdict is 'PASS'.
    3. Failing validation: exit 1, saved evidence verdict is 'FAIL' (never 'PASS').
    """
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "build": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained post-evidence fixture."},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (repo / ".gitignore").write_text("*.evidence.json\n", encoding="utf-8")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # Case 1: Prohibited destination (inside worktree, not gitignored)
        prohibited_path = repo / "prohibited_untracked.json"
        proc_prohib = subprocess.run(
            [sys.executable, str(ROOT / "scripts/validate.py"), "--base", "HEAD", "--output-evidence", str(prohibited_path)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_prohib.returncode == 1, proc_prohib.stdout
        assert "Prohibited evidence destination" in proc_prohib.stderr
        assert not prohibited_path.exists(), "Prohibited evidence file was unexpectedly created on disk!"

        # Case 2: Permitted gitignored destination on clean tree (PASS)
        permitted_pass = repo / "pass.evidence.json"
        proc_pass = subprocess.run(
            [sys.executable, str(ROOT / "scripts/validate.py"), "--base", "HEAD", "--output-evidence", str(permitted_pass)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_pass.returncode == 0, proc_pass.stderr
        assert permitted_pass.exists()
        with permitted_pass.open(encoding="utf-8") as fh:
            data_pass = json.load(fh)
        assert data_pass["verdict"] == "PASS"
        assert data_pass["clean_tree_pr_evidence"] is True

        # Case 3: Permitted destination when validation fails (dirty tree without --allow-dirty)
        (repo / "dirty_scratch.txt").write_text("dirty\n", encoding="utf-8")
        permitted_fail = repo / "fail.evidence.json"
        proc_fail = subprocess.run(
            [sys.executable, str(ROOT / "scripts/validate.py"), "--base", "HEAD", "--output-evidence", str(permitted_fail)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_fail.returncode == 1, proc_fail.stdout
        assert permitted_fail.exists()
        with permitted_fail.open(encoding="utf-8") as fh:
            data_fail = json.load(fh)
        assert data_fail["verdict"] == "FAIL"
        assert data_fail["clean_tree_pr_evidence"] is False
    print("  ✓ Development evidence destination preflight and verdict consistency verified.")


# 22. Evidence-file verdict consistency for release candidate verification (Fix 2)
def test_evidence_verdict_consistency_release():
    """Verify release verification exit status and saved evidence verdict are strictly consistent.

    1. Prohibited destination: fails closed (exit 1), file is NEVER written.
    2. Failing release verification: exit 1, saved evidence verdict is 'FAIL' (never 'PASS').
    3. Passing release verification: exit 0, saved evidence verdict is 'PASS'.
    """
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "build": {"command": ["python3", "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained release fixture."},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))
        (repo / ".gitignore").write_text("*.evidence.json\ndist/\n", encoding="utf-8")

        art = repo / "dist/app.tar.gz"
        art.parent.mkdir(parents=True, exist_ok=True)
        art.write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # Case 1: Prohibited destination (inside worktree, not gitignored)
        prohibited_path = repo / "prohibited_release_evidence.json"
        proc_prohib = subprocess.run(
            [sys.executable, str(ROOT / "scripts/verify_release.py"), "--artifacts", str(art), "--output-evidence", str(prohibited_path)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_prohib.returncode == 1, proc_prohib.stdout
        assert "Prohibited evidence destination" in proc_prohib.stderr
        assert not prohibited_path.exists(), "Prohibited evidence file was unexpectedly created on disk!"

        # Case 2: Permitted destination when release verification fails (zero specified artifacts)
        permitted_fail = repo / "fail_rel.evidence.json"
        proc_fail = subprocess.run(
            [sys.executable, str(ROOT / "scripts/verify_release.py"), "--output-evidence", str(permitted_fail)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_fail.returncode == 1, proc_fail.stdout
        assert permitted_fail.exists()
        with permitted_fail.open(encoding="utf-8") as fh:
            data_fail = json.load(fh)
        assert data_fail["verdict"] == "FAIL"
        assert "BLOCKED" in data_fail["release_gate_status"]

        # Case 3: Permitted destination when release verification succeeds
        permitted_pass = repo / "pass_rel.evidence.json"
        proc_pass = subprocess.run(
            [sys.executable, str(ROOT / "scripts/verify_release.py"), "--artifacts", str(art), "--output-evidence", str(permitted_pass)],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert proc_pass.returncode == 0, proc_pass.stderr
        assert permitted_pass.exists()
        with permitted_pass.open(encoding="utf-8") as fh:
            data_pass = json.load(fh)
        assert data_pass["verdict"] == "PASS"
        assert "PASSED" in data_pass["release_gate_status"]
    print("  ✓ Release verification evidence destination preflight and verdict consistency verified.")


# 23. Adversarial command argument confidentiality (Fix 3)
def test_adversarial_command_argument_confidentiality():
    """Verify arbitrary command arguments, positional secrets, and uncommon tokens are never persisted."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        (repo / "README.md").write_text("clean base\n", encoding="utf-8")
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )

        secrets_to_check = [
            "super_secret_positional_password_xyz",
            "AKIAIOSFODNN7EXAMPLE",
            "VerySensitiveP@ssword99!",
            "custom_vault_token_98765",
            "xoxb-123456789012-1234567890123-abcdef1234567890abcdef12",
            "s.1234567890abcdef12345678",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak_this_jwt_signature_xyz",
            "9f8379c4c2f698397a6566ecdb014125b823c4d7c4c5776c61730f9f417ac19b",
            "shhh_release_token_777",
            "positional_release_secret_888",
            "--password",
            "--api-key",
            "--secret-token",
        ]

        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {
                        "name": "Adversarial test command",
                        "command": [
                            sys.executable, "-c", "import sys; sys.exit(0)",
                            "--password", "VerySensitiveP@ssword99!",
                            "--api-key", "custom_vault_token_98765",
                            "super_secret_positional_password_xyz",
                            "AKIAIOSFODNN7EXAMPLE",
                            "xoxb-123456789012-1234567890123-abcdef1234567890abcdef12",
                            "s.1234567890abcdef12345678",
                            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak_this_jwt_signature_xyz",
                            "9f8379c4c2f698397a6566ecdb014125b823c4d7c4c5776c61730f9f417ac19b",
                        ],
                    },
                    "build": {"command": [sys.executable, "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Adversarial confidentiality fixture."},
                    "release": {
                        "name": "Adversarial release command",
                        "command": [
                            sys.executable, "-c", "import sys; sys.exit(0)",
                            "--secret-token", "shhh_release_token_777",
                            "positional_release_secret_888",
                        ],
                    },
                },
                "releaseArtifacts": ["release.tar.gz"],
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))
        (repo / "release.tar.gz").write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # 1. Development validation evidence check
        dev_res = validate_mod.validate_development(base="HEAD", cwd=repo)
        dev_json = json.dumps(dev_res)
        for secret in secrets_to_check:
            assert secret not in dev_json, f"Development evidence leaked argument/credential: {secret}"

        # Verify command field is a safe stable identifier
        for chk in dev_res["checks"]:
            if "Stack validation" in chk["name"]:
                assert chk["command"].startswith("contract:"), chk["command"]
                assert not any(s in chk["command"] for s in secrets_to_check)

        # 2. Release verification evidence check
        rel_res = verify_mod.verify_release(artifacts=[str(repo / "release.tar.gz")], cwd=repo)
        rel_json = json.dumps(rel_res)
        for secret in secrets_to_check:
            assert secret not in rel_json, f"Release evidence leaked argument/credential: {secret}"

        for cmd_rec in rel_res["release_commands"]:
            assert cmd_rec["command"].startswith("contract:"), cmd_rec["command"]
            assert not any(s in cmd_rec["command"] for s in secrets_to_check)

    print("  ✓ Adversarial test: arbitrary command arguments and uncommon tokens are never persisted.")


# 24. Preserved: CLI launchers
def test_cli_launchers():
    """Verify CLI launchers and entrypoints execute correctly across platforms."""
    # 1. Native Python entrypoints (must execute on all platforms, including Windows)
    for script_name in ("validate", "verify_release"):
        py_script = ROOT / f"scripts/{script_name}.py"
        assert py_script.is_file(), f"Missing Python script: {py_script}"
        proc = subprocess.run(
            [sys.executable, str(py_script), "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0, f"{script_name}.py native entrypoint failed: {proc.stderr}"
    print("  ✓ Python-native entrypoints execution test passed.")

    # 2. POSIX shell wrappers (Linux and macOS; not directly executable on native Windows without shell)
    is_windows = sys.platform == "win32" or platform.system() == "Windows"
    if is_windows:
        print("  - POSIX shell wrappers: [NOT APPLICABLE on native Windows - verified Python-native entrypoints]")
        return

    for script_name in ("validate", "verify_release"):
        launcher = ROOT / f"scripts/{script_name}"
        if launcher.is_file():
            proc = subprocess.run(
                [str(launcher), "--help"],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            assert proc.returncode == 0, f"{script_name} launcher failed: {proc.stderr}"
    print("  ✓ POSIX CLI wrappers execution test passed.")


# 25. P1-01: Mandatory self-test bypass negative test
def test_mandatory_self_test_bypass_negative():
    """Verify AG_ENTRYPOINTS_TEST_ACTIVE does not suppress the mandatory entrypoint suite."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "template", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (scripts_dir / "validate_master_template.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (scripts_dir / "test_validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (scripts_dir / "test_session_context.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")

        # Create dummy entrypoints test that marks it ran outside repo
        marker_file = pathlib.Path(tempfile.gettempdir()) / "marker_entrypoint_ran.txt"
        if marker_file.exists():
            marker_file.unlink()
        (scripts_dir / "test_entrypoints.py").write_text(
            f"#!/usr/bin/env python3\nimport pathlib, sys\npathlib.Path('{marker_file}').write_text('ran')\nsys.exit(0)\n",
            encoding="utf-8",
        )
        (scripts_dir / "validate.py").write_text((ROOT / "scripts/validate.py").read_text(encoding="utf-8"))
        (repo / ".gitignore").write_text("__pycache__/\n*.pyc\n", encoding="utf-8")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        # Run with AG_ENTRYPOINTS_TEST_ACTIVE=1 externally set
        env = os.environ.copy()
        env["AG_ENTRYPOINTS_TEST_ACTIVE"] = "1"
        proc = subprocess.run(
            [sys.executable, str(scripts_dir / "validate.py"), "--base", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            env=env,
        )
        assert proc.returncode == 0, f"Validation failed: {proc.stdout}\n{proc.stderr}"
        assert marker_file.exists(), "Mandatory entrypoints test was bypassed when AG_ENTRYPOINTS_TEST_ACTIVE=1 was set!"
        assert "Local entrypoints self-test suite" in proc.stdout

        # Verify that if test_entrypoints.py fails or is missing, validation fails closed even with the env var
        (scripts_dir / "test_entrypoints.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(1)\n", encoding="utf-8")
        proc_fail = subprocess.run(
            [sys.executable, str(scripts_dir / "validate.py"), "--base", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            env=env,
        )
        assert proc_fail.returncode == 1, proc_fail.stdout
    print("  ✓ Mandatory self-test bypass negative test passed (AG_ENTRYPOINTS_TEST_ACTIVE does not skip suite).")


# 26. P1-02: Post-development Git integrity recheck
def test_post_development_git_mutation_fails_closed():
    """Verify development validation fails closed if commands mutate tracked source or leave non-ignored files."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        # Command that modifies tracked file during execution
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {"command": [sys.executable, "-c", "import pathlib; pathlib.Path('tracked_source.py').write_text('modified\\n')"]},
                    "build": {"command": [sys.executable, "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained post-dev mutation fixture."},
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (repo / "tracked_source.py").write_text("clean_original\n", encoding="utf-8")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        res = validate_mod.validate_development(base="HEAD", cwd=repo)
        assert res["verdict"] == "FAIL", res
        assert res["clean_tree_pr_evidence"] is False
        post_chk = [c for c in res["checks"] if c["name"] == "Post-development Git integrity check"]
        assert len(post_chk) == 1, res["checks"]
        assert post_chk[0]["status"] == "FAIL"
        assert "Working tree mutated during development execution" in post_chk[0]["summary"]
    print("  ✓ Post-development Git integrity fails closed on working tree mutation.")


# 27. P2-02: Evidence confidentiality for user-defined command names and custom category identifiers
def test_contract_identifier_evidence_confidentiality():
    """Verify secrets embedded in contract command names or custom categories never leak into evidence records or summaries."""
    secret_token_1 = "SECRET_TOKEN_EMBEDDED_IN_NAME_AKIAIOSFODNN7EXAMPLE"
    secret_token_2 = "SECRET_TOKEN_IN_RELEASE_NAME_xoxb-999888777-abcdef"
    secret_cat_token = "SECRET_CAT_KEY_ghp_111222333444555666777"

    with tempfile.TemporaryDirectory() as tmp:
        repo = create_clean_git_repo(pathlib.Path(tmp))
        config_dir = repo / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "project-profile.json").write_text(
            json.dumps({"repositoryMode": "project", "schemaVersion": 1, "capabilities": {"design": False, "storeRelease": False}}),
            encoding="utf-8",
        )
        (config_dir / "validation-contract.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "categories": {
                    "test": {
                        "name": f"Check with {secret_token_1}",
                        "command": [sys.executable, "-c", "import sys; sys.exit(0)"],
                    },
                    "build": {"command": [sys.executable, "-c", "import sys; sys.exit(0)"]},
                    "security": {"status": "not_applicable", "reason": "Self-contained confidentiality test."},
                    secret_cat_token: {
                        "name": "Custom secret category command",
                        "command": [sys.executable, "-c", "import sys; sys.exit(0)"],
                    },
                },
                "releaseArtifacts": ["release.tar.gz"],
                "release": {
                    "commands": [
                        {
                            "name": f"Release with {secret_token_2}",
                            "command": [sys.executable, "-c", "import sys; sys.exit(0)"],
                        }
                    ]
                }
            }),
            encoding="utf-8",
        )
        scripts_dir = repo / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "validate_project_profile.py").write_text("#!/usr/bin/env python3\nimport sys; sys.exit(0)\n", encoding="utf-8")
        (repo / "release.tar.gz").write_bytes(b"content")

        subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, capture_output=True, check=True)

        dev_res = validate_mod.validate_development(base="HEAD", cwd=repo)
        dev_json = json.dumps(dev_res)
        assert secret_token_1 not in dev_json, f"Development evidence leaked secret_token_1: {dev_json}"
        assert secret_token_2 not in dev_json, f"Development evidence leaked secret_token_2: {dev_json}"
        assert secret_cat_token not in dev_json, f"Development evidence leaked secret_cat_token in category identifier: {dev_json}"

        # Verify safe category used stable category identifier and custom category used numeric fallback
        checks_map = {c["command"]: c["name"] for c in dev_res["checks"]}
        assert "contract:categories.test" in checks_map
        assert checks_map["contract:categories.test"] == "Stack validation contract [test]"
        assert "contract:categories.build" in checks_map
        assert checks_map["contract:categories.build"] == "Stack validation contract [build]"
        # Custom secret category must have fallen back to stable numeric ID
        assert "contract:dev.cmd_3" in checks_map
        assert checks_map["contract:dev.cmd_3"] == "Stack validation contract [command_3]"

        rel_res = verify_mod.verify_release(artifacts=[str(repo / "release.tar.gz")], cwd=repo)
        rel_json = json.dumps(rel_res)
        assert secret_token_1 not in rel_json
        assert secret_token_2 not in rel_json
        assert secret_cat_token not in rel_json

        # Check stable identifiers were used
        rel_cmds = rel_res["release_commands"]
        assert len(rel_cmds) == 1
        assert rel_cmds[0]["command"] == "contract:release.command_1"
        assert rel_cmds[0]["name"] == "Release validation command 1"
    print("  ✓ Contract identifier evidence confidentiality verified (secrets in names and custom categories neutralized).")


def test_release_scope_manifest_contract():
    """Verify the Release Scope Manifest template and production readiness governance contract."""
    manifest_path = ROOT / "docs/RELEASE-SCOPE-MANIFEST.md"
    assert manifest_path.is_file(), f"Missing required manifest template: {manifest_path}"
    content = manifest_path.read_text(encoding="utf-8")

    # Verify all 9 required manifest areas + metadata and reconciliation
    required_sections = [
        "## Release Candidate Metadata",
        "## Release Scope Governance Rules",
        "## 1. Owner-Approved Feature Inventory",
        "## 2. Acceptance Criteria Traceability",
        "## 3. Actual Implementation Status",
        "## 4. Unit, Integration & Security Test Evidence",
        "## 5. Production Integration Dependencies",
        "## 6. Feature Flags and Configuration",
        "## 7. Release Artifacts & Deployment Targets",
        "## 8. Outstanding Release Gates",
        "## 9. Explicit Owner-Approved Scope Changes",
        "## 10. Release-Completeness Reconciliation Sign-Off",
    ]
    for sec in required_sections:
        assert sec in content, f"Release Scope Manifest is missing required section: '{sec}'"

    # Verify core governance principles are codified
    rules_text = content.lower()
    assert "closed gates block promotion, not feature scope" in rules_text
    assert "passing mock tests does not prove live integration" in rules_text
    assert "disabled production functionality must be disclosed" in rules_text
    assert "agent-created deferrals are prohibited" in rules_text
    assert "reduced feature releases require explicit owner approval" in rules_text
    assert "production promotion requires explicit human release approval" in rules_text

    # Verify release completeness reconciliation requirements in docs/RELEASE.md and AGENTS.md
    release_doc = (ROOT / "docs/RELEASE.md").read_text(encoding="utf-8").lower()
    assert "release scope manifest" in release_doc
    assert "release-completeness reconciliation" in release_doc
    assert "closed gates block promotion, not feature scope" in release_doc
    assert "passing mock tests does not prove live integration" in release_doc

    agents_doc = (ROOT / "AGENTS.md").read_text(encoding="utf-8").lower()
    assert "release scope manifest" in agents_doc
    assert "agent-created deferrals are prohibited" in agents_doc
    assert "closed external release gate blocks promotion, not feature scope" in agents_doc

    testing_doc = (ROOT / "docs/TESTING.md").read_text(encoding="utf-8").lower()
    assert "passing mock tests does not prove live integration" in testing_doc
    assert "closed gates block promotion, not feature scope" in testing_doc

    print("  ✓ Release Scope Manifest and production readiness governance contract verified.")


def test_agent_orchestration_contract():
    """Validate M7 documentation/operating guardrails without weakening CI."""
    path = ROOT / "docs/AGENT-ORCHESTRATION.md"
    assert path.is_file(), "Missing agent orchestration guide"
    content = path.read_text(encoding="utf-8").lower()
    required = (
        "one primary implementation agent", "compact subagent contract",
        "context loading and reuse", "soft budget",
        "mandatory exact-head", "independent", "not available",
        "docs/release-scope-manifest.md", "no autonomous",
    )
    for term in required:
        assert term in content, f"Missing M7 governance term: {term}"
    for other in ("AGENTS.md", "README.md", "docs/TESTING.md", "tasks/TEMPLATE.md", ".agent/TASK-CONTRACT.md"):
        assert "docs/AGENT-ORCHESTRATION.md" in (ROOT / other).read_text(encoding="utf-8"), (
            f"Missing M7 reference in {other}"
        )
    print("  ✓ M7 agent orchestration and token-governance contract verified.")


def main():
    print("Running local entrypoints self-test suite (remediated)...")
    test_zero_specified_artifacts_fails()
    test_empty_artifact_directory_fails()
    test_wrong_candidate_sha_fails()
    test_git_execution_status_failure_fails()
    test_missing_mandatory_validator_fails()
    test_invalid_diff_base_fails()
    test_dirty_development_tree_fails_validate()
    test_empty_or_incomplete_contract_fails_project_release()
    test_auditable_na_decision_accepted()
    test_missing_mandatory_release_command_fails()
    test_post_command_git_mutation_fails_release()
    test_unsafe_evidence_redaction()
    test_blocked_network_offline_verification()
    test_missing_unshare_regression()
    test_valid_real_artifact_with_complete_validation_passes()
    test_tracked_env_clean()
    test_tracked_env_fails_closed()
    test_project_mode_development_validation_requires_contract()
    test_release_only_command_does_not_satisfy_development_test()
    test_allowlist_evidence_no_raw_output()
    test_scratch_mode_evidence_semantics()
    test_evidence_verdict_consistency_development()
    test_evidence_verdict_consistency_release()
    test_adversarial_command_argument_confidentiality()
    test_cli_launchers()
    test_mandatory_self_test_bypass_negative()
    test_post_development_git_mutation_fails_closed()
    test_contract_identifier_evidence_confidentiality()
    test_release_scope_manifest_contract()
    test_agent_orchestration_contract()
    print("All entrypoint self-tests passed successfully.")


if __name__ == "__main__":
    main()
