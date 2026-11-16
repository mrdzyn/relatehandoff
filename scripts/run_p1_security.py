#!/usr/bin/env python3
"""Run mandatory RH-P1 security checks (secret filename guard + negative security tests)."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

subprocess.run([sys.executable, str(ROOT / "scripts/check_secret_tracking.py")], cwd=ROOT, check=True)
subprocess.run(["npm", "run", "test:security"], cwd=ROOT, check=True)
