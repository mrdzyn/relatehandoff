# RH-P3-T3 — Third-party license and attribution review

**Status:** **Apache-2.0 explicitly selected by the owner on November 18, 2026.** The licensing files are staged in Draft PR #8; copyright holder attribution, complete dependency review, exact-HEAD validation, independent audit, and separate merge/release authorization remain pending. Selecting a license does **not** authorize merging or public release.

| Component | Relationship | Known terms/evidence | Release validation |
|---|---|---|---|
| [Relate engine / CLI](https://github.com/relatedb/relate) | Runtime, installed separately and pinned to v1.0.1 | Upstream `LICENSE` contains Apache License 2.0; experimental Neo4j Labs project | Verify v1.0.1 release artifacts and preserve applicable upstream NOTICE/disclaimers; do not imply Neo4j endorsement |
| [`@relate/relate@1.0.1`](https://www.npmjs.com/package/@relate/relate) | Direct Node.js runtime dependency | Relate project identifies Apache-2.0 | Confirm installed exact package metadata and platform-native transitive dependencies from lockfile |
| [mrdzyn/ai-native-project-template](https://github.com/mrdzyn/ai-native-project-template) | Owner-controlled source scaffold | Same repository owner's pre-existing work | Document inherited scaffold and distinguish contest-period implementation; confirm ownership and any external files |
| [jexp/relate-ideas](https://github.com/jexp/relate-ideas) | Conceptual inspiration only; no files copied | Referenced as CC-BY-4.0 content in existing project docs | Attribute inspiration; do not claim a copied CC-BY implementation or relicense that repository |

## Owner approval gate

- [x] Owner explicitly selected **Apache-2.0** for RelateHandoff original code (November 18, 2026).
- [ ] Confirm copyright holder name/year and whether any employer/client intellectual-property restrictions apply.
- [ ] Compare the proposed `LICENSE` with the canonical Apache-2.0 text; review the `NOTICE` wording and applicable upstream notices.
- [ ] Check direct and transitive dependencies, bundled native artifacts, media/visuals and any copied files using exact pinned versions. Do not claim a complete license scan without executing one.
- [ ] Verify Hackathon Devpost rules and disclose significant AI-assisted development, own pre-existing scaffold, and third-party tools.
- [ ] Run actual exact-HEAD canonical validation on a clean checkout and obtain independent COMMENT-only review.
- [ ] Obtain separate human merge approval. No release or submission authorization follows automatically.

An Apache-2.0 license on this repository would permit others to use, modify and commercially redistribute the original code according to the license terms. Do not treat a mere GitHub repository's public visibility, or this **unmerged draft**, as permission to redistribute material without an applicable license.
