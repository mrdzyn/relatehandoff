# RH-P3 — Judge Readiness Documentation Package

**Status:** Draft task for RH-P3-T1 plus RH-P3-T4 preparation; no release or submission authorized.
**Base:** `main@e61b84dd0e7aada50f2ea8e94e6b8f9b1cd1b0d8`.
**UI design gate:** Not applicable (documentation only).

## Objective
Bring README and walkthrough to accurate pinned judge commands; propose S2 stale PRODUCT/ARCHITECTURE status sync; reflect current Devpost rules; prepare a truthful original real-Relate video capture guide.

## Allowed files
`README.md`, `docs/JUDGE-WALKTHROUGH.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/HACKATHON.md`, `docs/RH-P3-DEMO-CAPTURE.md`, `docs/RH-P3-SUBMISSION-DRAFT.md`, `docs/STATUS.md`, append-only `docs/HANDOFFS.md`, this task.

## Forbidden files/actions
No source, tests, fixtures, dependencies, schema, workflows, or store data changes. No licensing decision, GitHub topic edit, S1 wrapper, S3 CI change, merge, deploy, release, video upload, or Devpost submission.

## Acceptance
- [x] Commands use local `node src/cli.mjs resume --store ... --repo . --repo-id ... --task RH-P1` and `npm ci`; CLI version is explicitly pinned.
- [x] Synthetic unsigned data is clearly distinguished from verified evidence; persistent server snapshot/restart caveat documented.
- [x] Official Nov 13 rules update reflected: `relate` GitHub topic required; optional `relate-neo4j-hackathon`; license encouraged; video ≤2 minutes.
- [ ] S2 status sync approved by owner.
- [ ] Fresh macOS ARM64 and risk-appropriate Linux validation: `git diff --check`, `scripts/validate.py` 8/8, real Relate `npm test`, `npm run demo`, `npm run test:security`, fixture `resume`; disclose GLIBC limits.
- [ ] Independent COMMENT-only audit at exact final HEAD.
- [ ] Owner explicitly approves merge.
- [ ] RH-P3-T3 license selection and attribution approved separately.
- [ ] RH-P3-T4 original video captured, sanitized and reviewed; submission separately approved.

**Testing objective:** A new judge can use actual pinned commands on a clean checkout, see the documented statuses without misrepresenting fixture authenticity, and reproduce the demo.

**Environment disclosure:** ChatGPT connector could inspect GitHub but the local sandbox has Node 22, no Relate CLI, and no GitHub DNS. Tests have not been executed for this proposed branch.
