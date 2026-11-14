#!/usr/bin/env python3
"""AI Agent Session Continuity & Context Recovery generator.

Reads canonical repository sources in AGENTS.md startup order to generate
a compact, deterministic, read-only session context packet for AI agents
starting with zero prior chat memory. Offline-capable by default.

Contract: docs/SESSION-CONTINUITY.md
Task: tasks/P8.0-m6-agent-session-continuity.md
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent.parent

REDACT_PATTERNS = [
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED_AWS_KEY]"),
    (re.compile(r"xox[baprs]-[0-9a-zA-Z-]{10,}"), "[REDACTED_SLACK_TOKEN]"),
    (re.compile(r"(?i)(ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{16,}"), r"\1_[REDACTED]"),
    (re.compile(r"(?i)(bearer\s+)[a-zA-Z0-9_\-\.]{16,}"), r"\1[REDACTED]"),
    (re.compile(r"(?i)\b(password|secret|token|api[_-]?key|access[_-]?key|auth|private[_-]?key)\b\s*([:=])\s*[\"']?([^\"'\s,;]{4,})[\"']?"), r"\1\2[REDACTED]"),
    (re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----"), "[REDACTED PRIVATE KEY]"),
    (re.compile(r"ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]{20,}"), "[REDACTED_JWT]"),
    (re.compile(r"s\.[a-zA-Z0-9]{24}"), "[REDACTED_VAULT_TOKEN]"),
]


def sanitize_text(text: str) -> str:
    """Ensure no raw tokens, credentials, private keys or secrets leak into output."""
    if not text:
        return ""
    res = text
    for pat, repl in REDACT_PATTERNS:
        res = pat.sub(repl, res)
    return res


def get_git_output(args: list[str], cwd: pathlib.Path) -> tuple[int, str]:
    """Run a git command in cwd and return (exit_code, stripped_stdout_or_stderr)."""
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
        output = proc.stdout.strip() if proc.returncode == 0 else proc.stderr.strip()
        return proc.returncode, output
    except Exception as exc:
        return 1, str(exc)


def parse_repository_slug(cwd: pathlib.Path) -> str:
    """Extract owner/repo from git remote origin url if available."""
    code, url = get_git_output(["config", "--get", "remote.origin.url"], cwd)
    if code != 0 or not url:
        code, url = get_git_output(["remote", "get-url", "origin"], cwd)
    if code != 0 or not url:
        return "UNVERIFIED"

    # Match https://github.com/owner/repo(.git) or git@github.com:owner/repo(.git)
    match = re.search(r"[:/]([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+?)(?:\.git)?$", url)
    if match:
        return match.group(1)
    return "UNVERIFIED"


def parse_status_file(status_path: pathlib.Path) -> dict[str, Any]:
    """Parse key operational fields from docs/STATUS.md, strictly enforcing mandatory fields and uniqueness."""
    if not status_path.is_file():
        return {"error": f"Missing STATUS file: {status_path}"}

    try:
        content = status_path.read_text(encoding="utf-8")
    except Exception as exc:
        return {"error": f"Failed to read STATUS file: {exc}"}

    mandatory_keys = {
        "current_phase": "- **Current phase:**",
        "active_task": "- **Active task:**",
        "active_handoff": "- **Active handoff:**",
        "working_branch": "- **Working branch:**",
    }

    field_counts = {k: 0 for k in mandatory_keys}
    fields: dict[str, Any] = {k: None for k in mandatory_keys}
    fields["status_summary"] = None
    fields["next_step"] = None

    for line in content.splitlines():
        line_clean = line.strip()
        for field_name, prefix in mandatory_keys.items():
            if line_clean.startswith(prefix):
                field_counts[field_name] += 1
                raw_val = line_clean.split(":", 1)[1].strip()
                val = raw_val.strip("`* ")
                if not val:
                    return {"error": f"STATUS.md mandatory field '{field_name}' has an empty value"}
                fields[field_name] = val
        if line_clean.startswith("- **Status:**"):
            raw_status = line_clean.split(":", 1)[1].strip().strip("`* ")
            fields["status_summary"] = raw_status if raw_status else None

    # Check for missing or duplicate mandatory fields
    for field_name, count in field_counts.items():
        if count == 0:
            return {"error": f"STATUS.md missing mandatory field: '{field_name}' ({mandatory_keys[field_name]})"}
        if count > 1:
            return {"error": f"STATUS.md contains duplicate mandatory field: '{field_name}' ({count} occurrences)"}

    # Extract Next section if present
    next_match = re.search(r"## Next\s*\n+([^\n#]+)", content)
    if next_match:
        fields["next_step"] = next_match.group(1).strip()

    return fields


def parse_handoff_section(handoffs_path: pathlib.Path, handoff_id: str) -> dict[str, Any]:
    """Parse exactly one unique ## Handoff: <ID> section from docs/HANDOFFS.md."""
    if not handoffs_path.is_file():
        return {"error": f"Missing HANDOFFS file: {handoffs_path}"}

    try:
        content = handoffs_path.read_text(encoding="utf-8")
    except Exception as exc:
        return {"error": f"Failed to read HANDOFFS file: {exc}"}

    # Count occurrences
    header_pattern = rf"^##\s+Handoff:\s+{re.escape(handoff_id)}\s*$"
    matches = list(re.finditer(header_pattern, content, re.MULTILINE))
    if len(matches) == 0:
        return {"error": f"Active handoff '{handoff_id}' not found in {handoffs_path}"}
    if len(matches) > 1:
        return {"error": f"Duplicate active handoff '{handoff_id}' found in {handoffs_path} ({len(matches)} occurrences)"}

    # Extract section content up to next ## Handoff: or ## or EOF
    start_pos = matches[0].end()
    next_section = re.search(r"^##\s+", content[start_pos:], re.MULTILINE)
    section_text = content[start_pos: start_pos + next_section.start()] if next_section else content[start_pos:]

    fields: dict[str, Any] = {
        "handoff_id": handoff_id,
        "task_phase": None,
        "from_agent": None,
        "to_agent": None,
        "branch": None,
        "implementation_head": None,
        "pr": None,
        "state": None,
        "next_action": None,
    }

    for line in section_text.splitlines():
        line_clean = line.strip()
        if line_clean.startswith("- **Task / phase:**"):
            fields["task_phase"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **From:**"):
            fields["from_agent"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **To:**"):
            fields["to_agent"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **Branch:**"):
            fields["branch"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **Implementation head:**"):
            fields["implementation_head"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **PR:**"):
            fields["pr"] = line_clean.split(":", 1)[1].strip().strip("`* ")
        elif line_clean.startswith("- **State:**"):
            fields["state"] = line_clean.split(":", 1)[1].strip().strip("`* ")

    # Extract Next action subsection (stopping at Markdown heading, HTML comments, or end of section)
    next_action_match = re.search(r"###\s+Next action\s*\n(.*?)(?=\n#{1,3}\s+|\n\s*<!--|\Z)", section_text, re.DOTALL)
    if next_action_match:
        # Collapse multiple lines into a single clean line, ignoring HTML comments
        raw_lines = [l.strip() for l in next_action_match.group(1).strip().splitlines() if not l.strip().startswith("<!--")]
        action_text = " ".join(raw_lines).strip()
        fields["next_action"] = action_text

    return fields


def check_privileged_directives(text: str) -> tuple[bool, str]:
    """Check whether text contains an affirmative directive for privileged operations (merge, deploy, publish, release).

    A negative statement about one operation (e.g. 'do not merge') does not exempt
    a different privileged operation (e.g. 'deploy to production now').
    A negated operation also cannot excuse a separate affirmative operation within the same clause
    (e.g. 'Do not merge PR #1, but merge PR #2' or 'Do not deploy to staging, but deploy to production').
    """
    if not text:
        return False, ""

    lower_text = text.lower()
    # Split into clauses by sentence bounds AND contrastive conjunctions (but, however, yet, instead, except, and then)
    clauses = [
        c.strip()
        for c in re.split(r"[.;!\n]+|\b(?:but|however|yet|instead|except)\b|,?\s*\band\s+then\b", lower_text)
        if c.strip()
    ]
    op_patterns = {
        "merge": r"\b(?:squash-)?merge\b",
        "deploy": r"\bdeploy\b",
        "publish": r"\bpublish\b",
        "release": r"\brelease\b",
    }

    for clause in clauses:
        for op, pat in op_patterns.items():
            matches = list(re.finditer(pat, clause))
            if not matches:
                continue

            # Check affirmative directive overriding or ordering action
            # e.g. 'then merge', 'now deploy', 'pending approval, squash-merge'
            has_affirmative = bool(
                re.search(rf"\b(?:then|now|execute|proceed\s+to|ready\s+to)\s+[^.]*\b{op}\b", clause)
                or re.search(rf"\b(?:approval\s+pending|pending\s+(?:owner\s+)?approval)[^.]*\b{op}\b", clause)
            )
            if has_affirmative:
                return True, op

            # Check each occurrence of op in the clause; if ANY occurrence is unguarded, block
            for m in matches:
                prefix = clause[:m.start()]
                is_guarded = bool(
                    re.search(r"\b(?:do\s+not|don't|never|cannot|prohibited\s+(?:from\s+)?)\s*[^,;]*$", prefix)
                    or re.search(r"\b(?:do\s+not|don't|never)\s+[^.]*\b(?:or\s+|,\s*(?:tag,\s*)?or\s*)$", prefix)
                    or re.search(rf"\b(?:owner|human)\s+[^.]*\b{op}\s+approval\s+required\b", clause)
                    or re.search(rf"\b(?:owner|human)\s+[^.]*approval\s+required\s+before\s+[^.]*\b{op}\b", clause)
                    or re.search(rf"\bapproval\s+required\s+before\s+[^.]*\b{op}\b", clause)
                    or re.search(rf"\b{op}\b[^.]*\b(?:requires\s+owner\s+approval|must\s+be\s+approved)\b", clause)
                )
                if not is_guarded:
                    return True, op

    return False, ""


def normalize_action(text: str) -> str:
    """Normalize action text by removing markdown formatting, list markers, whitespace, and punctuation."""
    if not text:
        return ""
    # Strip markdown backticks
    t = re.sub(r"`([^`]+)`", r"\1", text)
    # Strip markdown links [label](url) -> label
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    # Strip list numbering or bullet markers at line starts
    t = re.sub(r"(?:^|\n)\s*(?:[-*]|\d+\.)\s+", " ", t)
    # Normalize whitespace
    t = " ".join(t.split())
    # Strip trailing punctuation (. ; , :)
    t = t.strip().rstrip(".;,:").strip()
    return t.lower()


def verify_task_scope(task_path: pathlib.Path, action_text: str) -> tuple[bool, str]:
    """Verify whether proposed action is within the scope of the active task specification.

    Requirements:
    1. Do not grant authority using substring matches or shared keywords alone.
    2. Parse task Next action without truncating at '#' references (e.g. PR #27).
    3. Reject additional, unapproved actions appended or prepended to documented actions.
    4. Where scope cannot be proven, return (False, reason) so caller reports REQUIRES_REVIEW.
    """
    if not task_path.is_file():
        return False, f"Active task file does not exist on disk: {task_path}"

    try:
        content = task_path.read_text(encoding="utf-8").strip()
    except Exception as exc:
        return False, f"Failed to read active task file: {exc}"

    if not content:
        return False, "Active task file is empty; task scope cannot be verified."

    # Check task status if declared
    status_match = re.search(r"-\s+\*\*Status:\*\s*([^\n]+)", content, re.IGNORECASE)
    if status_match:
        task_status = status_match.group(1).strip().strip("`* ").upper()
        if any(s in task_status for s in ("DRAFT", "BLOCKED", "ON HOLD", "PENDING APPROVAL")):
            return False, f"Task status is '{task_status}'; work is not authorized."

    # Require substantive specification: at least an Objective, Allowed scope, Deliverable,
    # Acceptance criteria, Next action, or substantive specification text (>= 4 lines)
    has_substantive_spec = bool(
        re.search(r"##\s+(?:Objective|Allowed scope|Deliverable|Acceptance criteria|Next action|Scope)", content, re.IGNORECASE)
        or len(content.splitlines()) >= 4
    )
    if not has_substantive_spec:
        return False, "Active task file lacks substantive objective or allowed scope definition."

    # Extract forbidden scope if present
    forbidden_match = re.search(r"##\s+Forbidden scope\s*\n+([^#]+)", content, re.IGNORECASE)
    if forbidden_match:
        forbidden_text = forbidden_match.group(1).lower()
        for line in forbidden_text.splitlines():
            line_clean = line.strip().strip("-*` ")
            if line_clean and len(line_clean) > 3 and line_clean in action_text.lower():
                return False, f"Proposed action references forbidden task scope: '{line_clean}'"

    norm_proposed = normalize_action(action_text)
    if not norm_proposed:
        return False, "Proposed action is empty; action scope cannot be verified."

    # 1. Parse task Next action without truncating at PR #27 or other '#' references
    task_next_text = ""
    task_next_match = re.search(
        r"^#{2,3}\s+Next action\s*\n(.*?)(?=\n#{1,3}\s+|\n\s*<!--|\Z)",
        content,
        re.DOTALL | re.MULTILINE | re.IGNORECASE,
    )
    if task_next_match:
        lines = []
        for line in task_next_match.group(1).strip().splitlines():
            l = line.strip()
            if not l or l.startswith("<!--"):
                continue
            l = re.sub(r"^[-*]\s+|\d+\.\s+", "", l)
            lines.append(l)
        task_next_text = " ".join(lines).strip()

    if task_next_text:
        norm_task_next = normalize_action(task_next_text)
        if norm_proposed == norm_task_next:
            return True, ""

        # Reject additional, unapproved actions appended or prepended to documented task next action
        if norm_task_next in norm_proposed:
            return False, (
                f"Proposed action contains unapproved additions beyond documented task next action: '{action_text}'"
            )

        # Check individual sentences of documented task next action
        task_sentences = [
            normalize_action(s)
            for s in re.split(r"\.(?:\s+|$)|[;\n]+", task_next_text)
            if normalize_action(s) and len(normalize_action(s)) > 3
        ]
        if norm_proposed in task_sentences:
            return True, ""

        return False, (
            f"Proposed action does not match documented task next action '{task_next_text}': '{action_text}'"
        )

    # 2. If task does not define Next action, check Objective and Allowed scope
    objective_text = ""
    objective_match = re.search(
        r"^#{2,3}\s+Objective\s*\n(.*?)(?=\n#{1,3}\s+|\n\s*<!--|\Z)",
        content,
        re.DOTALL | re.MULTILINE | re.IGNORECASE,
    )
    if objective_match:
        lines = []
        for line in objective_match.group(1).strip().splitlines():
            l = line.strip()
            if not l or l.startswith("<!--"):
                continue
            l = re.sub(r"^[-*]\s+|\d+\.\s+", "", l)
            lines.append(l)
        objective_text = " ".join(lines).strip()

    if objective_text:
        norm_obj = normalize_action(objective_text)
        if norm_proposed == norm_obj:
            return True, ""

        # Reject additional unapproved actions appended to objective
        if norm_obj in norm_proposed:
            return False, (
                f"Proposed action contains unapproved additions beyond documented task objective: '{action_text}'"
            )

        # Check individual sentences or clauses of the objective
        obj_clauses = [
            normalize_action(c)
            for c in re.split(r"\.(?:\s+|$)|[;\n]+|\s+and\s+", objective_text)
            if normalize_action(c) and len(normalize_action(c)) > 3
        ]
        if norm_proposed in obj_clauses:
            return True, ""

    return False, (
        f"Proposed action '{action_text}' cannot be proven within documented task scope (terms not found in active task specification)."
    )


def generate_session_context(
    root: pathlib.Path | None = None,
    verify_remote: bool = False,
) -> dict[str, Any]:
    """Generate read-only session continuity context from canonical repository files."""
    root_path = (root or pathlib.Path(".")).resolve()
    blockers: list[str] = []

    # 1. Git inspection
    code_head, full_head = get_git_output(["rev-parse", "HEAD"], root_path)
    git_head = full_head if code_head == 0 and len(full_head) == 40 else "BLOCKED"
    if git_head == "BLOCKED":
        blockers.append("Git HEAD unverified: not a git repository or git rev-parse HEAD failed.")

    code_branch, current_branch = get_git_output(["branch", "--show-current"], root_path)
    checked_out_branch = current_branch if code_branch == 0 and current_branch else "detached"

    code_status, status_porcelain = get_git_output(["status", "--porcelain"], root_path)
    is_dirty = bool(status_porcelain) if code_status == 0 else True
    working_tree_clean = (code_status == 0) and (not is_dirty)

    repo_slug = parse_repository_slug(root_path)

    # 2. Project profile inspection
    profile_path = root_path / "config/project-profile.json"
    project_mode = "UNVERIFIED"
    if not profile_path.is_file():
        blockers.append(f"Missing project profile: {profile_path}")
    else:
        try:
            profile_data = json.loads(profile_path.read_text(encoding="utf-8"))
            mode = profile_data.get("repositoryMode")
            if mode in ("template", "project"):
                project_mode = mode
            else:
                blockers.append(f"Invalid repositoryMode in project profile: '{mode}'")
        except Exception as exc:
            blockers.append(f"Malformed project profile: {exc}")

    # 3. STATUS.md inspection & branch/task reconciliation
    status_path = root_path / "docs/STATUS.md"
    status_data = parse_status_file(status_path)
    status_branch: str | None = None
    active_task_path = "BLOCKED"
    active_handoff_id = "BLOCKED"
    phase_status = "BLOCKED"
    status_summary = "BLOCKED"

    if "error" in status_data:
        blockers.append(str(status_data["error"]))
    else:
        phase_status = status_data.get("current_phase") or "UNVERIFIED"
        status_summary = status_data.get("status_summary") or "UNVERIFIED"
        status_branch = status_data.get("working_branch")
        raw_task = status_data.get("active_task")
        active_handoff_id = status_data.get("active_handoff") or "None"

        # Reconcile STATUS working branch against local git branch
        if checked_out_branch != "detached" and status_branch != checked_out_branch:
            blockers.append(
                f"STATUS working branch '{status_branch}' contradicts checked-out branch '{checked_out_branch}'."
            )

        # Validate task path: must be repository-relative, no traversal, symlink inside repo root
        if not raw_task:
            blockers.append("STATUS.md is missing an 'Active task' pointer.")
            active_task_path = "BLOCKED: Missing active task"
        elif ".." in raw_task or raw_task.startswith(("/", "\\")):
            blockers.append(f"Active task path contains forbidden path traversal: '{raw_task}'")
            active_task_path = "BLOCKED: Path traversal"
        else:
            task_file = root_path / raw_task
            try:
                resolved_task = task_file.resolve()
                resolved_root = root_path.resolve()
                try:
                    resolved_task.relative_to(resolved_root)
                    is_inside_repo = True
                except ValueError:
                    is_inside_repo = False

                if not is_inside_repo:
                    blockers.append(
                        f"Active task path resolves outside repository root (symlink traversal): '{raw_task}' -> '{resolved_task}'"
                    )
                    active_task_path = "BLOCKED: External symlink or traversal"
                elif not task_file.is_file():
                    blockers.append(f"Active task file does not exist on disk: '{raw_task}'")
                    active_task_path = f"MISSING ({raw_task})"
                else:
                    active_task_path = raw_task
            except Exception as exc:
                blockers.append(f"Error resolving active task path '{raw_task}': {exc}")
                active_task_path = "BLOCKED: Resolution error"

    # 4. HANDOFFS.md inspection & reconciliation
    handoff_proposed = "None"
    implementation_head_status = "NOT_APPLICABLE (No active handoff)"
    handoff_data: dict[str, Any] = {}

    if active_handoff_id not in ("None", "BLOCKED"):
        handoffs_path = root_path / "docs/HANDOFFS.md"
        handoff_data = parse_handoff_section(handoffs_path, active_handoff_id)
        if "error" in handoff_data:
            blockers.append(str(handoff_data["error"]))
        else:
            handoff_branch = handoff_data.get("branch")
            handoff_task_raw = handoff_data.get("task_phase")
            impl_head_raw = handoff_data.get("implementation_head")
            handoff_proposed = handoff_data.get("next_action") or "None"

            # Check branch reconciliation: handoff branch vs git branch & STATUS branch
            if handoff_branch:
                if checked_out_branch != "detached" and handoff_branch != checked_out_branch:
                    blockers.append(
                        f"Active handoff branch '{handoff_branch}' contradicts checked-out branch '{checked_out_branch}'."
                    )
                if status_branch and handoff_branch != status_branch:
                    blockers.append(
                        f"Active handoff branch '{handoff_branch}' contradicts STATUS working branch '{status_branch}'."
                    )

            # Check task reconciliation: handoff task vs STATUS active task
            if handoff_task_raw and active_task_path not in ("BLOCKED", "MISSING"):
                task_match = re.search(r"([a-zA-Z0-9_/.-]+\.md)", handoff_task_raw)
                if task_match:
                    handoff_task_file = task_match.group(1).strip()
                    if handoff_task_file != active_task_path:
                        blockers.append(
                            f"Active handoff task '{handoff_task_file}' contradicts STATUS active task '{active_task_path}'."
                        )

            # Check implementation HEAD SHA:
            raw_stripped = impl_head_raw.strip().strip("`") if impl_head_raw else ""
            if re.match(r"^[0-9a-fA-F]{40}$", raw_stripped):
                declared_sha = raw_stripped.lower()
                if git_head != "BLOCKED" and declared_sha == git_head.lower():
                    implementation_head_status = f"VERIFIED_EXACT ({declared_sha[:7]})"
                else:
                    # Check if git_head is a documented handoff-only commit with declared_sha as parent
                    code_parent, parent_sha = get_git_output(["rev-parse", "HEAD~1"], root_path)
                    code_diff, diff_files = get_git_output(
                        ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], root_path
                    )
                    head_files = set(diff_files.splitlines()) if code_diff == 0 else set()
                    docs_only = bool(head_files) and head_files.issubset({"docs/HANDOFFS.md", "docs/STATUS.md"})

                    if code_parent == 0 and parent_sha.strip().lower() == declared_sha and docs_only:
                        implementation_head_status = (
                            f"VERIFIED_PARENT_IMPLEMENTATION ({declared_sha[:7]} with documented handoff-only commit {git_head[:7]})"
                        )
                    else:
                        implementation_head_status = f"STALE ({declared_sha[:7]} does not match HEAD {git_head[:7]})"
                        blockers.append(
                            f"Active handoff implementation SHA '{declared_sha}' is stale and does not match current HEAD '{git_head}'."
                        )
            else:
                clean_ref = sanitize_text(str(impl_head_raw or "None"))
                implementation_head_status = f"UNVERIFIED_REFERENCE ({clean_ref[:50]})"
    elif active_handoff_id == "None":
        # Greenfield or post-merge main state: next action comes from STATUS Next section
        if "error" not in status_data:
            handoff_proposed = status_data.get("next_step") or "None"
        implementation_head_status = "NOT_APPLICABLE (No active handoff)"

    # 5. Determine next authorized action & enforce human gates
    human_gates: list[str] = [
        "Explicit owner merge approval required before any PR merge.",
        "Explicit owner release approval required before any production release.",
    ]

    cand_clean = sanitize_text(handoff_proposed)
    lower_cand = cand_clean.lower()

    # Check for privileged directives without global exemption
    is_unauthorized_priv, unauthorized_op = check_privileged_directives(cand_clean)

    # Check if proposed action authority can be established from handoff state and task context
    is_unestablished_authority = False
    unestablished_reason = ""

    handoff_state = handoff_data.get("state") if handoff_data else None
    if handoff_state:
        state_upper = handoff_state.strip().upper()
        if any(term in state_upper for term in ("OWNER APPROVAL", "APPROVAL REQUIRED")):
            is_unestablished_authority = True
            unestablished_reason = f"Handoff state '{handoff_state}' requires explicit human owner approval."
        elif any(term in state_upper for term in ("BLOCKED", "UNVERIFIED", "REQUIRES REVIEW", "PENDING REVIEW")):
            is_unestablished_authority = True
            unestablished_reason = f"Handoff state '{handoff_state}' does not establish operational authority."

    if any(term in lower_cand for term in ("unestablished", "requires review", "pending review", "authority unverified", "unconfirmed authority", "outside task scope")):
        is_unestablished_authority = True
        unestablished_reason = f"Proposed action '{cand_clean}' requires explicit agent/task review before authorization."

    # Evidence-backed task scope verification
    if (
        not blockers
        and not is_unauthorized_priv
        and not is_unestablished_authority
        and active_task_path
        and not active_task_path.startswith("BLOCKED")
        and not active_task_path.startswith("MISSING")
    ):
        task_file_path = root_path / active_task_path
        scope_ok, scope_reason = verify_task_scope(task_file_path, cand_clean)
        if not scope_ok:
            is_unestablished_authority = True
            unestablished_reason = scope_reason

    if is_unauthorized_priv:
        blockers.append(
            f"Autonomous {unauthorized_op} cannot be authorized by agent: proposed action contains privileged directive ('{cand_clean}'). Human owner approval and execution is required."
        )
        next_authorized_action = (
            f"BLOCKED: Awaiting human owner {unauthorized_op} approval; agent cannot perform autonomous {unauthorized_op}."
        )
    elif blockers:
        next_authorized_action = f"BLOCKED: {blockers[0]}"
    elif is_unestablished_authority:
        blockers.append(f"Action authority not established: {unestablished_reason}")
        next_authorized_action = f"REQUIRES_REVIEW: {unestablished_reason}"
    elif cand_clean and cand_clean != "None":
        next_authorized_action = cand_clean
    else:
        blockers.append("No next action documented in active handoff or STATUS.md.")
        next_authorized_action = "BLOCKED: Missing next action definition."

    action_authority = (
        "ESTABLISHED"
        if not (blockers or is_unauthorized_priv or is_unestablished_authority)
        else ("PRIVILEGED_BLOCKED" if is_unauthorized_priv else "UNESTABLISHED")
    )

    # 6. Verification status
    if blockers:
        local_verification = "FAIL"
    elif not working_tree_clean:
        local_verification = "PARTIAL"
    else:
        local_verification = "PASS"

    remote_verification = (
        "UNVERIFIED (Remote API and PR state require external verification)"
        if not verify_remote
        else "UNVERIFIED (Remote network check not proven)"
    )

    verified_local_state = (
        f"branch={checked_out_branch}, clean={'yes' if working_tree_clean else 'dirty'}, "
        f"head={git_head[:7] if git_head != 'BLOCKED' else 'blocked'}"
    )

    res: dict[str, Any] = {
        "repository": repo_slug,
        "git_head": git_head,
        "checked_out_branch": checked_out_branch,
        "working_tree_clean": working_tree_clean,
        "project_mode": project_mode,
        "phase_status": phase_status,
        "status_summary": status_summary,
        "active_task": active_task_path,
        "active_handoff": active_handoff_id,
        "implementation_head_status": implementation_head_status,
        "handoff_proposed_action": handoff_proposed,
        "action_authority": action_authority,
        "verified_local_state": verified_local_state,
        "remote_state": remote_verification,
        "pending_human_approvals": "; ".join(human_gates),
        "next_authorized_action": next_authorized_action,
        "local_verification": local_verification,
        "remote_verification": remote_verification,
        "outstanding_human_gates": "; ".join(human_gates),
        "limitations_blockers": "; ".join(blockers) if blockers else "None",
    }

    # Bounded length & secret sanitization across all fields
    for k, v in list(res.items()):
        if isinstance(v, str):
            sanitized = sanitize_text(v)
            if len(sanitized) > 400:
                sanitized = sanitized[:397] + "..."
            res[k] = sanitized

    return res


def format_text_output(ctx: dict[str, Any]) -> str:
    """Format context into standard docs/SESSION-CONTINUITY.md resume packet."""
    lines = [
        "======================================================================",
        "RESUME CONTEXT",
        "======================================================================",
        f"Repository:                     {ctx['repository']}",
        f"Git HEAD:                       {ctx['git_head']}",
        f"Checked-out branch:             {ctx['checked_out_branch']}",
        f"Working tree clean:             {'Yes' if ctx['working_tree_clean'] else 'No (dirty)'}",
        f"Project mode:                   {ctx['project_mode']}",
        f"Phase/status:                   {ctx['phase_status']}",
        f"Active task:                    {ctx['active_task']}",
        f"Active handoff:                 {ctx['active_handoff']}",
        f"Implementation head status:     {ctx['implementation_head_status']}",
        f"Handoff-proposed action:        {ctx['handoff_proposed_action']}",
        f"Verified local state:           {ctx['verified_local_state']}",
        f"Next authorized action:         {ctx['next_authorized_action']}",
        f"Local verification:             {ctx['local_verification']}",
        f"Remote PR/branch verification:  {ctx['remote_verification']}",
        f"Outstanding human gates:        {ctx['outstanding_human_gates']}",
        f"Limitations/blockers:           {ctx['limitations_blockers']}",
        "======================================================================",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AI Agent Session Continuity & Context Recovery generator (offline-capable)."
    )
    parser.add_argument(
        "--root",
        type=pathlib.Path,
        default=pathlib.Path("."),
        help="Repository root directory (defaults to current working directory).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit output in structured JSON format.",
    )
    parser.add_argument(
        "--verify-remote",
        action="store_true",
        help="Attempt remote verification if accessible (defaults to offline/unverified).",
    )

    args = parser.parse_args()
    ctx = generate_session_context(root=args.root, verify_remote=args.verify_remote)

    if args.json:
        print(json.dumps(ctx, indent=2))
    else:
        print(format_text_output(ctx))

    # Fail closed: exit code 1 if BLOCKED, REQUIRES_REVIEW, or FAIL
    if (
        ctx["local_verification"] == "FAIL"
        or ctx["next_authorized_action"].startswith("BLOCKED")
        or ctx["next_authorized_action"].startswith("REQUIRES_REVIEW")
    ):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
