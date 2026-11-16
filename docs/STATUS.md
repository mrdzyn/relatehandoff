# Project Status

## Project
- **Name:** RelateHandoff
- **Current phase:** RH-P1 — persistent Relate handoff MVP (integration spike)
- **Status:** PR #2 squash-merged to `main`. RH-P1 smallest real Relate integration spike underway on `phase-1/relate-handoff-mvp`; full MVP recorder/freshness/demo not yet built.
- **Primary branch:** `main`
- **Approved Phase 0 merged baseline:** `7e21fcebc0192ee6f6fecd553ef3619b9ea7465b` (PR #1 squash merge, audited input PR HEAD `3a32213394d762ab33928ed939fc65756d2320db`)
- **Phase 1 handoff merged baseline:** `7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf` (PR #2 squash merge)
- **Working branch:** `phase-1/relate-handoff-mvp`
- **Active task:** `tasks/RH-P1-relate-handoff-mvp.md`
- **Active handoff:** RH-P1-H1

## Completed foundation
- Created a new project-mode repository from `mrdzyn/ai-native-project-template`; pruned unselected optional packs and inherited master history.
- Owner-reported Mac: local validation 7/7 PASS plus separate `test_entrypoints.py` PASS at PR #1 exact HEAD.
- Claude's independent Linux re-audit: PASS at the identical exact HEAD, including five documented commands; published in [PR #1 audit](https://github.com/mrdzyn/relatehandoff/pull/1#issuecomment-6893352785).
- GitHub confirmed PR #1 squash-merged (`7e21fcebc0192ee6f6fecd553ef3619b9ea7465b`) and PR #2 squash-merged (`7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf`).
- Verified Relate `v1.0.1` (`Apache-2.0` + Neo4j Labs experimental disclaimer), `@relate/relate@1.0.1` (Node.js), `relate-db@1.0.1` (Python), persistent directory store layout, cross-process read-only retrieval, and read-only write refusal (see `docs/RELATE-SPIKE.md`).
- No release, hosted deployment, or RelateHandoff product licensing decision included.

## Active scope and blockers
- P1 targets a **real local persistent Relate graph**, controlled validated handoff writes, read-only MCP retrieval by another process/agent, and exact-HEAD evidence freshness checks.
- **Linux GLIBC finding:** prebuilt `relate-linux-amd64` `v1.0.1` from `relatedb.ai/install.sh` requires `GLIBC_2.39` and fails on Debian 12 (`GLIBC_2.36`). `@relate/relate@1.0.1` (Node.js), `relate-db@1.0.1` (Python manylinux2014), and source-built `relate-cli` work on `GLIBC_2.36`.
- Keep consumer MCP read-only, local Git canonical, source/evidence provenance explicit, and all private code, transcripts and secrets outside public demo fixtures.
- Product licensing, hackathon packaging, actual native integration, optional hosted CI and repository ruleset remain unverified or pending owner action.

## Next authorized action
Complete review of this RH-P1 Relate integration spike Draft PR, then proceed on `phase-1/relate-handoff-mvp` to implement the validated handoff writer, bounded cross-agent read, exact-Git-HEAD evidence freshness checks, sanitized example store, and security negative tests per `tasks/RH-P1-relate-handoff-mvp.md`. No automatic merge, deployment, publication or release.

## Verification truth
- GitHub PR #1 and PR #2 merges and `main` baseline (`7c7d4e9c1efc4911d1250fa9e4e7cef09edd94cf`): VERIFIED.
- Relate `v1.0.1` `@relate/relate` cross-process persistence + read-only enforcement (`npm run test:spike`): VERIFIED on Linux x86_64 (`GLIBC_2.36`).
- Prebuilt `relate` CLI `v1.0.1` binary on Debian 12 (`GLIBC_2.36`): BLOCKED (`GLIBC_2.39` required).
- Source-built `relate-cli v1.0.1` MCP stdio `--read-only` (`RELATE_REQUIRE_CLI=1 npm run test:spike`): VERIFIED PASS (`read_cypher` + `get_schema` only, writes refused).
- Full P1 handoff recorder, exact-HEAD freshness, and demo: NOT IMPLEMENTED.
