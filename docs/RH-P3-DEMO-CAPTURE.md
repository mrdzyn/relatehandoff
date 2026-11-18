# RH-P3 — Original Judge Demo Capture Guide

**State:** Draft preparation only. No video has been recorded, uploaded or submitted by this PR. Official rules checked 2026-11-18: https://relate.devpost.com/rules.

## Preparation (owner-side, clean final checkout)

Verify Node.js 24, Python 3.11+, real Relate CLI v1.0.1, exact full Git HEAD and `npm ci`. Run actual `RELATE_REQUIRE_CLI=1 npm test`, `python3 scripts/validate.py --repository mrdzyn/relatehandoff`, and `npm run demo`. Only describe results observed on that host. Do not let machine paths, tokens, notifications, customer data, or private transcripts appear in footage.

## Suggested 90–115-second cut

| Window | Real output to show | Narration (adjust to verified output) |
|---|---|---|
| 0–10 s | RelateHandoff name, `relate --version` | “One context. Every agent. Local-first agent handoffs backed by Relate.” |
| 10–30 s | `npm run demo`, handoff and provenance | “A validated recorder connects a task and Git commit to a handoff.” |
| 30–50 s | `step2_readOnlyUnsignedStore` MCP tools / provenance | “A second agent reads bounded context through read-only MCP. Persisted unsigned proof remains UNVERIFIED.” |
| 50–65 s | `step3_inProcessVerified` | “Live allowlisted verification can establish AUTHENTICATED evidence at the checked-out HEAD.” |
| 65–80 s | `step4_shaBStaleDetection` | “A changed Git SHA makes previous evidence STALE.” |
| 80–100 s | `step5*`, `step6*` | “Self-asserted proof remains UNVERIFIED; failed evidence is BLOCKED.” |
| 100–115 s | `step7_mcpWriteRefusals` | “MCP read-only clients cannot write to the store. Git remains authoritative.” |

Record actual real terminal output; skip or change a shot if its assertion is not reproduced. Video must be original, at most 2 minutes, and accessible without login/payment. Unlicensed video/audio/assets are not acceptable.

### Separate portable fixture proof

```bash
node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1
```

Verify it reads `RH-P1-EXAMPLE-1` from the committed synthetic store without regeneration, using only `read_cypher` and `get_schema`. For a changed HEAD, `STALE` and `SELF_ASSERTED` are expected, not authenticated evidence.

## Mandatory human gates

- [ ] Capture final-head real CLI commands and exact test outputs on the owner's machine.
- [ ] Review original video for accurate text, secrets, local paths, accessibility and third-party rights.
- [ ] Upload owner-approved public demo URL.
- [ ] Verify required GitHub topic `relate` on the repository.
- [x] RelateHandoff original code is Apache-2.0 licensed (PR #8 merged).
- [ ] Complete final notices review if bundling third-party packages or native binaries.
- [ ] Review submission description and significant AI-assisted development disclosure.
- [ ] Obtain separate explicit release and **Devpost submission** authorization.
