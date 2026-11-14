# Project Status

## Project
- **Name:** RelateHandoff
- **Current phase:** RH-P0 — greenfield repository initialization
- **Status:** Phase 0 initialization is proposed in a Draft PR; implementation/runtime not started; exact-head local validation pending
- **Primary branch:** `main`
- **Starting baseline:** `ab028917b134b362d3a292c77f1b3d212d94e9a5` (new repository generated from mrdzyn/ai-native-project-template)
- **Working branch:** `phase-0/relatehandoff-initialization`
- **Active task:** `tasks/RH-P0-greenfield-bootstrap.md`
- **Active handoff:** RH-P0-H1

## Foundation decisions in review
- Project mode selected; no design/store/integration capability packs active for the initial CLI/MCP-only MVP.
- Proposed Node.js/TypeScript recorder, persistent local Relate directory graph, and read-only MCP consumer; no working runtime yet.
- Local Git and canonical repository files remain authoritative; remote GitHub state requires a live read when needed.
- No user data, secrets, unreviewed license, production deployment, or cloud agent access will be included in the demo.
- Licensing, actual runtime selection/compatibility, and judge evidence remain open gates.

## Next
1. Validate this bootstrap on a clean checkout using the documented local commands and review the Draft PR.
2. Obtain independent review and owner approval for the P0 merge separately; no merge is implied by initialization.
3. Next proposed task: `tasks/RH-P1-relate-handoff-mvp.md`. Only after P0 approval start implementing the *real* persistent Relate store, read-only MCP handoff and exact-HEAD freshness proof.

## Verification truth
- GitHub tree inspection: inherited template inspected before bootstrap.
- Runtime integration: NOT IMPLEMENTED.
- Local automated/Relate integration tests: NOT RUN at this stage.
- Hosted CI: NOT RUN / optional under inherited local-first policy.
- Manual reviewer and human merge approval: PENDING.
