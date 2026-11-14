#!/usr/bin/env python3
"""Phase 0 non-runtime foundation assertions; intentionally offline."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
profile = json.loads((ROOT / "config/project-profile.json").read_text(encoding="utf-8"))
contract = json.loads((ROOT / "config/validation-contract.json").read_text(encoding="utf-8"))
status = (ROOT / "docs/STATUS.md").read_text(encoding="utf-8")
handoffs = (ROOT / "docs/HANDOFFS.md").read_text(encoding="utf-8")
assert profile["repositoryMode"] == "project"
assert profile["capabilities"] == {"design": False, "storeRelease": False}
assert profile["platforms"] == profile["storefronts"] == profile["integrations"] == []
assert "tasks/RH-P1-relate-handoff-mvp.md" in status
assert "RelateHandoff" in status
assert "<!-- HANDOFF_ENTRIES_START -->" in handoffs
assert "<!-- HANDOFF_ENTRIES_END -->" in handoffs
assert "<!-- MASTER_TEMPLATE_HANDOFFS_START -->" not in handoffs
assert not (ROOT / ".github/workflows/template-integrity.yml").exists()
assert (ROOT / ".github/workflows/ci.yml").exists()
assert (ROOT / ".github/workflows/common-validation.yml").exists()
assert contract["categories"]["build"]["status"] == "not_applicable"
assert (ROOT / "docs/HACKATHON.md").exists()
print("Phase 0 bootstrap assertions: PASS (not a Relate integration test)")
