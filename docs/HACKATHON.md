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
- [x] Official rules reviewed November 18, 2026: GitHub topic `relate` is **required** through judging and winner announcement; `relate-neo4j-hackathon` is recommended, not required.
- [ ] Owner sets repository GitHub topic `relate` (optionally `relate-neo4j-hackathon`) and verifies the public repository displays it.
- [ ] Owner explicitly selects a RelateHandoff license and approves `LICENSE`/third-party attribution. An open-source license is encouraged by the rules, **not mandatory**.
- [ ] Real Relate program and persistent store (directory or single file) in repository or reliably reproducible judge setup.
- [ ] Demonstrate meaningful Relate graph traversal, read-only MCP use, persistence across process restart and stale-evidence detection.
- [ ] README includes prerequisites, versions, install, commands, expected outputs and graph path.
- [ ] No private project, credentials, transcript or customer data in demo files or screen recording.
- [ ] Original **video ≤2 minutes** or eligible working demo, accessible without login or payment. Video must show actual execution and use licensed/original assets (see `docs/RH-P3-DEMO-CAPTURE.md`).
- [ ] Accurately disclose Relate capabilities, third-party tools, significant AI use, inherited project scaffold and conceptual inspiration.
- [ ] Independent audit, owner-approved merge/release scope, final submission reviewed.

## Demo story
Agent A finishes a task at full SHA A and writes provenance with an evidence path. Agent B starts fresh, queries the same local Relate graph via MCP, identifies the next task. On a subsequent commit SHA B, the graph queries expose stale evidence and refuse to call the change audit-ready. Git remains authoritative.

## Competition gates
The [official rules](https://relate.devpost.com/rules) were checked on **November 18, 2026**: the GitHub topic `relate` is required, licensing is encouraged, and the video limit is 2 minutes. Verify them again before submission. **No release or submission without express owner approval.**
