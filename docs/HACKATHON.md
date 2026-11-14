# Relate by Neo4j Hackathon — Submission Control

**Product:** RelateHandoff. **Competition:** https://relate.devpost.com/

## Dates and originality
- Contest begins November 11, 2026. New implementation work occurs during the contest period.
- Published submission deadline: December 11, 2026, 6:00 PM PST (December 12, 10:00 AM Philippines).
- Public repository: https://github.com/mrdzyn/relatehandoff
- Project scaffold: inherited and disclosed from https://github.com/mrdzyn/ai-native-project-template.
- Conceptual influence: https://github.com/jexp/relate-ideas (CC-BY-4.0 repository content; attribution only, no files copied).

## Required judge evidence (not yet complete)
- [x] Public GitHub repository exists.
- [ ] Confirm official GitHub topic requirement at submission time (current rules text contains placeholders); add `relate` and appropriate event topic in GitHub settings.
- [ ] Decide and add a compatible license after owner review.
- [ ] Real Relate program and persistent store (directory or single file) in repository or reliably reproducible judge setup.
- [ ] Demonstrate meaningful Relate graph traversal, read-only MCP use, persistence across process restart and stale-evidence detection.
- [ ] README includes prerequisites, versions, install, commands, expected outputs and graph path.
- [ ] No private project, credentials, transcript or customer data in demo files or screen recording.
- [ ] Working 1–2 minute video showing Relate actively running.
- [ ] Submission credits, third-party tools/licenses and AI-assisted development disclosure completed.
- [ ] Independent audit, owner-approved merge/release scope, final submission reviewed.

## Demo story
Agent A finishes a task at full SHA A and writes provenance with an evidence path. Agent B starts fresh, queries the same local Relate graph via MCP, identifies the next task. On a subsequent commit SHA B, the graph queries expose stale evidence and refuse to call the change audit-ready. Git remains authoritative.

## Competition gates
Review https://relate.devpost.com/rules and https://relate.devpost.com/ before submission, because official rules currently contain placeholders in some sections. Never infer open-source licensing requirements or specific topic identifiers from an unfinalized placeholder.
