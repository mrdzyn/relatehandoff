# Project Status

## Project
- **Name:** RelateHandoff
- **Current phase:** RH-P0 — greenfield repository initialization
- **Status:** Initial independent audit PARTIAL at `a6e04d25`; targeted remediation committed; fresh exact-HEAD local checks and independent re-audit pending; runtime not started
- **Primary branch:** `main`
- **Starting baseline:** `ab028917b134b362d3a292c77f1b3d212d94e9a5` (new repository generated from mrdzyn/ai-native-project-template)
- **Working branch:** `phase-0/relatehandoff-initialization`
- **Active task:** `tasks/RH-P0-greenfield-bootstrap.md`
- **Active handoff:** RH-P0-H2

## Foundation decisions in review
- Project mode selected; no design/store/integration capability packs active for the initial CLI/MCP-only MVP.
- Proposed Node.js/TypeScript recorder, persistent local Relate directory graph, and read-only MCP consumer; no working runtime yet.
- Local Git and canonical repository files remain authoritative; remote GitHub state requires a live read when needed.
- No user data, secrets, unreviewed license, production deployment, or cloud agent access will be included in the demo.
- Licensing, actual runtime selection/compatibility, and judge evidence remain open gates.

## Next
1. Revalidate the *current final* Draft PR HEAD on a clean checkout: `scripts/test_bootstrap.py`, `scripts/test_entrypoints.py`, `scripts/check_secret_tracking.py`, `scripts/validate_project_profile.py`, and `scripts/validate.py`.
2. Request Claude or another independent reviewer to re-audit F1–F3 at the exact updated HEAD; F4 is a timezone misunderstanding and F5 is informational. Obtain separate human owner approval for the P0 merge.
3. Next proposed task: `tasks/RH-P1-relate-handoff-mvp.md`. Only after P0 approval start implementing the *real* persistent Relate store, read-only MCP handoff and exact-HEAD freshness proof.

## Verification truth
- GitHub static inspection: inherited template inspected; targeted remediation files and current PR HEAD confirmed on connected GitHub.
- Runtime integration: NOT IMPLEMENTED.
- Local foundation checks: owner Mac and independent Claude Linux both reported 7/7 PASS at *superseded* HEAD `a6e04d25bc17434f3e8a8d1d47b303f0a82c0b59`. The retained entrypoints self-test failed at that head. **Corrected final PR HEAD NOT TESTED YET.** No Relate integration tests exist.
- Hosted CI: NOT RUN / optional under inherited local-first policy.
- Independent audit: Claude PARTIAL at superseded HEAD (F1–F3 remediated, F4 timezone clarified, F5 information-only); new-HEAD re-audit PENDING. Human merge approval PENDING.
