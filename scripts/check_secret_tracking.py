#!/usr/bin/env python3
"""Fail on tracked secret-file names; does not claim to scan file contents."""
import subprocess
from pathlib import PurePosixPath

p = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True)
bad = []
for raw in p.stdout.split(b"\0"):
    if not raw:
        continue
    name = raw.decode("utf-8", "surrogateescape")
    leaf = PurePosixPath(name).name.lower()
    if leaf == ".env" or (leaf.startswith(".env.") and leaf != ".env.example"):
        bad.append(name)
    elif leaf in {"id_rsa", "id_ed25519", "credentials.json", "service-account.json"}:
        bad.append(name)
    elif leaf.endswith((".p12", ".pfx", ".pem", ".key")):
        bad.append(name)
if bad:
    raise SystemExit("Tracked sensitive filenames detected: " + ", ".join(sorted(bad)))
print("Tracked sensitive filenames: none (contents not scanned)")
