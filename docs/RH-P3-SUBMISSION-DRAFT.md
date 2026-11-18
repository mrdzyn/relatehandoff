# RH-P3 — Devpost Draft Copy (Not Submitted)

**State:** Proposal for owner editing. No actual submission, recording, or public demo link is claimed. Validate every claim against final exact-HEAD tests, third-party notices, and a real judge-accessible video before publishing.

## Project name

**RelateHandoff — One context. Every agent.**

## Short description

Local-first, evidence-aware handoffs between AI coding agents. RelateHandoff records a task, Git commit, decisions and test evidence in a Relate graph, then lets the next agent resume through read-only MCP—while clearly flagging stale or unverified claims.

## Inspiration

Coding agents often work in separate tools and sessions. Passing a transcript or a vague “tests passed” note can lose provenance, especially after another Git commit. We wanted agents to resume with just enough structured context, while keeping Git and actual test execution—not an AI-generated claim—as the source of truth.

## What it does

RelateHandoff's validated Node.js recorder persists a structured handoff to a local Relate directory store: repository, task, handoff, agents, commit, artifacts, decisions and evidence. A read-only Relate MCP client traverses those relationships and returns bounded context to a fresh agent. Its freshness/evidence engine distinguishes `VERIFIED`, `STALE`, `UNVERIFIED` and `BLOCKED`. Changed HEADs do not inherit earlier PASS claims; persisted unsigned or self-asserted evidence never becomes authenticated merely by being read.

## How we built it

Node.js ESM CLI and recorder; pinned `@relate/relate@1.0.1` package; real Relate CLI v1.0.1 running `serve --mcp stdio --read-only`; parameterized bounded Cypher; local Git state; persistent directory Relate store. Python canonical project validators and Node security, fault-injection and MCP integration tests enforce repository isolation, read-only access and honest evidence claims. A committed synthetic fixture and real CLI demo make the behavior reproducible without private project data.

## Challenges

- A long-lived read-only MCP server can keep an open-time snapshot and miss later external writes. The CLI `resume` uses fresh bounded short-lived sessions; persistent external hosts need a restart until a separately approved proxy exists.
- Prebuilt Linux v1.0.1 CLI requires a newer GLIBC than Debian 12. A pinned source-built fallback has been documented and should be retested on each judge host.
- Unsigned local stores cannot establish cryptographic authenticity of historical test claims. We report `UNVERIFIED` unless a fresh, allowlisted in-process verification actually runs.
- Security tests must fail closed when the real Relate CLI is missing; mock and author-reported evidence are never presented as independent certification.

## Accomplishments

- Real local graph traversal and read-only MCP retrieval across task, handoff, agents, commit and evidence.
- Portable committed synthetic Relate store, plus a demo that shows current/verified/stale/unverified/blocked statuses and rejects MCP writes.
- Sanitized owner-reported macOS Codex-to-Claude real-agent handoff and exact-HEAD validation discipline.
- Test and privacy boundaries that avoid using private transcripts, credentials or customer records.

## What we learned

Agent memory must be treated as a **derived index**, not an authority. A graph is valuable for connecting evidence, but only Git HEAD and independently executable validation establish what is actually current. Freshness and authenticity are different questions.

## What's next

Complete cross-platform judge setup verification, approve the project's open-source license, produce an original ≤2-minute real-Relate demo, and evaluate an optional persistent read-only MCP wrapper only if host UX merits the additional attack surface and test burden. Wider reuse in our own repositories remains a later, independently tested adoption task.

## Built with / attribution (verify before publishing)

Relate by Neo4j (Relate CLI v1.0.1 and `@relate/relate@1.0.1`), Cypher, read-only MCP stdio, Node.js 24, Python 3, Git/GitHub, Codex and Claude Code (agent workflows and AI-assisted development). Inherited project scaffolding came from the owner's `mrdzyn/ai-native-project-template`. Conceptual inspiration: `jexp/relate-ideas` (no files copied). RelateHandoff is an independent community project, not endorsed by Neo4j. State the actual significant roles of each AI tool before publishing.

## Final submission controls

- [ ] Owner chooses and approves RelateHandoff license and third-party notices.
- [ ] Required GitHub topic `relate` is set and visible on the public repo (optional `relate-neo4j-hackathon`).
- [ ] README commands and demo reproduced on a clean **final exact HEAD** using pinned versions; all failures/environmental limitations disclosed.
- [ ] Video or working demo is accessible to judges; video is original, ≤2 minutes, and shows actual execution (no fabricated UI/test claims).
- [ ] Screenshots, media licensing, project start date, inherited scaffold and significant AI assistance checked for accuracy.
- [ ] Owner reviews and explicitly authorizes final Devpost submission before submitting.
