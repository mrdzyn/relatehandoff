# RH-P3-T3 — Open-source License and Attribution Proposal

**Objective:** Stage the owner-selected Apache-2.0 license and attribution files for exact-HEAD validation and independent review, without merging or authorizing release.
**Base:** `main@e61b84dd0e7aada50f2ea8e94e6b8f9b1cd1b0d8` (PR #6 squash).
**UI design gate:** Not applicable.

**Allowed files:** `LICENSE` (Apache-2.0 candidate), `NOTICE`, `docs/RH-P3-THIRD-PARTY-ATTRIBUTION.md`, this task.
**Forbidden:** Source/tests/dependencies/fixtures/schema/workflows, product publication/release, repository topics, Devpost submission, merge, and unapproved changes to the owner-selected license.

**Acceptance:**
- [x] Proposed license text matches the upstream Apache 2.0 standard body from `relatedb/relate/LICENSE` as an encoding source (the project does not thereby inherit Relate's license).
- [x] Direct upstream runtime and conceptual source credits recorded with honest uncertainty.
- [x] Owner explicitly approved **Apache-2.0** for original RelateHandoff code on November 18, 2026.
- [ ] Owner confirms copyright holder name/year and NOTICE wording; revise if needed before merge.
- [ ] Exact-HEAD checks and independent COMMENT-only review, with truthful execution evidence.
- [ ] Separate explicit owner merge approval.

**Testing objective:** Verify only licensing/attribution files changed and license file text is canonical; no runtime or third-party license claims are fabricated. A full transitive license audit is still necessary before release.
