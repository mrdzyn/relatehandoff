#!/usr/bin/env python3
"""Run mandatory RH-P1 test suite (bootstrap + live Relate E2E MCP + security)."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

env = dict(os.environ)
env["RELATE_REQUIRE_CLI"] = "1"

subprocess.run([sys.executable, str(ROOT / "scripts/test_bootstrap.py")], cwd=ROOT, env=env, check=True)
subprocess.run(["npm", "test"], cwd=ROOT, env=env, check=True)
