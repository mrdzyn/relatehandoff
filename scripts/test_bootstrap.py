#!/usr/bin/env python3
"""Non-runtime repository foundation assertions across Phase 0 and Phase 1 handoff."""
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
# Verify STATUS selects an existing, bounded task rather than freezing bootstrap to P0.
active_task_line = next((line for line in status.splitlines() if line.startswith("- **Active task:** `")), None)
assert active_task_line is not None, "Missing active task pointer"
active_task_path = active_task_line.split("`")[1]
assert active_task_path in {
    "tasks/RH-P0-greenfield-bootstrap.md",
    "tasks/RH-P1-relate-handoff-mvp.md",
    "tasks/RH-P2-real-agent-handoff-followup.md",
    "tasks/RH-P3-judge-readiness.md",
    "tasks/RH-P4-cloudflare-judge-showcase.md",
    "tasks/RH-P5-remote-mcp-platform.md",
    "tasks/RH-LOCAL-T1-environment-doctor.md",
    "tasks/RH-LOCAL-T2A-resume-output.md",
    "tasks/RH-LOCAL-T2B-handoff-lifecycle.md",
    "tasks/RH-LOCAL-T3-local-mcp-integration.md",
    "tasks/RH-LOCAL-T4-security-reliability.md",
    "tasks/RH-LOCAL-T5-dx-onboarding.md",
    "tasks/RH-LOCAL-DEMO-readiness.md",
    "tasks/RH-LOCAL-SHOWCASE-readme.md",
}, "Unexpected active task in P0/P1/P2/P3/P4/P5/LOCAL foundation"
assert (ROOT / active_task_path).is_file(), "STATUS active task file not found"
assert "tasks/RH-P1-relate-handoff-mvp.md" in status
assert "RelateHandoff" in status
assert "<!-- HANDOFF_ENTRIES_START -->" in handoffs
assert "<!-- HANDOFF_ENTRIES_END -->" in handoffs
assert "<!-- MASTER_TEMPLATE_HANDOFFS_START -->" not in handoffs
assert not (ROOT / ".github/workflows/template-integrity.yml").exists()
assert (ROOT / ".github/workflows/ci.yml").exists()
assert (ROOT / ".github/workflows/common-validation.yml").exists()
for cat in ("test", "build", "security"):
    cmd = contract["categories"][cat].get("command")
    assert isinstance(cmd, list) and len(cmd) > 0, f"Missing executable command for {cat}"
assert (ROOT / "docs/HACKATHON.md").exists()
# Ensure that retaining orchestration governance also retains its discoverable links.
for required in ("AGENTS.md", "README.md", "docs/TESTING.md", "tasks/TEMPLATE.md", ".agent/TASK-CONTRACT.md"):
    assert "docs/AGENT-ORCHESTRATION.md" in (ROOT / required).read_text(encoding="utf-8"), (
        f"Missing agent orchestration reference in {required}"
    )
assert "capabilities" in (ROOT / "config/project-profile.json").read_text(encoding="utf-8")
assert "restore only selected guidance" in (ROOT / "AGENTS.md").read_text(encoding="utf-8")
print("Repository foundation assertions: PASS (not a Relate integration test)")
