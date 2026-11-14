# Release and Deployment

## Purpose

Make releases traceable, repeatable, reviewable, and recoverable.

## Release principles

- Human approval is the final production gate. Automation may prepare, stage, or execute an approved release workflow, but it must not remove the requirement for explicit human production-release approval.
- A release should be traceable to an exact source commit.
- Prefer promoting a known artifact through environments over rebuilding independently for production.
- Release automation should reduce manual error without hiding important decisions.
- Every material release should have a rollback or recovery strategy.
- **Closed gates block promotion, not feature scope:** When external release gates (e.g. staging test tracks, store accounts, hardware QA, production signing credentials, external API keys) are closed or unavailable, that blocks environment promotion or deployment. It does NOT authorize coding agents or technical auditors to remove, stub out, or defer approved release features or production wiring.
- **Passing mock tests does not prove live integration:** Passing tests that rely on test doubles, mocks, stubs, or synthetic fixtures validate local component behavior only; they must be truthfully declared as mock evidence and never misrepresented as proof of live third-party integration or production readiness.
- **Disclose disabled production functionality:** Any functionality that is disabled, feature-flagged off, stubbed, or using fallback mocks in a release candidate must be explicitly declared in the Release Scope Manifest (`docs/RELEASE-SCOPE-MANIFEST.md`). Silent degradation is prohibited.
- **Agent-created deferrals are prohibited:** Coding agents and auditors have zero authority to defer approved features to future phases. Releasing a reduced feature set requires explicit, documented human owner approval of the scope change.
- **Release-completeness reconciliation:** Every release candidate must undergo a formal release-completeness reconciliation against `docs/RELEASE-SCOPE-MANIFEST.md` before release-candidate verification and approval.

## Versioning

**Scheme:** [SemVer / CalVer / store build numbers / other]

Document:
- user-visible version;
- internal/build number;
- tag format;
- prerelease conventions.

## Repository enforcement

Repository-level branch/ruleset/status-check/environment configuration is defined in `docs/REPOSITORY-SETUP.md`. Do not assume policy text alone enforces merge or production gates.

## Environments

| Environment | Purpose | Deployment trigger | Approval |
|---|---|---|---|
| Local/Dev | Development | Manual/local | Developer/agent |
| CI | Validation | Local-first exact-head development checks, local-first release candidate verification (optional supplementary hosted dispatch) | Automated validation with evidence |
| Staging/Test | Release candidate validation | Approved workflow | Project-defined |
| Production | User-facing release | Approved promotion | Human gate |

Adjust this table to match the product.

## Local-first development and release candidate verification

Under `docs/MANUAL-CI.md`, both development PRs and release candidates are verified primarily through **local-first, self-controlled execution**:
- **Development validation:** Run `scripts/validate.py` (or `./scripts/validate`) for exact-HEAD local checks, diff hygiene, and objective-based tests.
- **Release candidate verification:** Run `scripts/verify_release.py` (or `./scripts/verify_release`) on the frozen candidate commit. It enforces a clean working tree, executes development validation, hashes release artifacts using SHA-256, and generates a durable sanitized release record.
- **Offline / Actions-independent:** Release verification does not depend on GitHub network access, GitHub APIs, or GitHub Actions. GitHub Actions (`workflow_dispatch`) is retained as optional supplementary automation only, never a prerequisite to approving a release.
- **Stack-native verification:** Generated products must validate their actual compiled binaries, packages, security, signing, and store requirements using their native toolchains; the generic template validator alone never proves release readiness. Separately configured required checks in mature brownfield repositories remain binding until owner-approved migration.

## PR CI vs release/deployment trust boundary

Ordinary pull-request validation and privileged release/deployment are different trust zones.

### Ordinary PR CI

PR validation may execute proposed code, including code from restricted or untrusted contributors. Therefore:

- default repository/token permission should remain read-only, normally `contents: read`;
- the common reusable validation workflow must not require production, deployment, signing, or store credentials;
- production/release secrets must not be passed through `secrets: inherit` merely because a reusable workflow supports secret inputs elsewhere;
- `id-token: write` is not part of ordinary PR validation;
- PR workflows must not deploy to production or perform irreversible release actions;
- fork/Dependabot-style restricted execution must be treated as a normal security boundary, not bypassed to make tests convenient.
- never use `pull_request_target` or a privileged `workflow_run` chained from PR validation to check out or execute untrusted PR code with secrets or a write-capable token.

Project-owned stack jobs may use explicitly scoped **non-production** credentials only when the test objective genuinely requires them and the project defines safe behavior when those credentials are unavailable in restricted PRs.

A push to `main` may validate or prepare a release candidate, but does **not** by itself authorize production deployment, publication, or release. Explicit human production-release approval remains mandatory.

### Privileged release/deployment

A release/deployment workflow or job path may request stronger privileges only when the release step actually requires them. It must preserve:

- explicit human production-release approval;
- exact source commit/candidate identity;
- release-only validation appropriate to the artifact/environment/store;
- narrowly scoped repository permissions;
- environment-scoped secrets where practical;
- rollback/recovery planning;
- post-release verification.

If GitHub OIDC is used, grant `id-token: write` only to the release/deployment job that exchanges identity for a short-lived external credential. Combine it with provider-side trust conditions and GitHub environment/repository protections where available. OIDC is a privileged trust capability; it is not a generic permission to add to shared PR workflows.

If long-lived secrets are unavoidable, scope them to the narrowest release environment/job possible and document ownership, rotation, recovery, and revocation. Do not move a production secret into repository-wide CI merely because a release command needs it.

### Reusable workflows and release privileges

The P8.0 common reusable workflow is for universal validation, not deployment. Future release-specific reusable workflows, if any, must be separate from the common PR baseline and must not rely on the baseline caller to elevate permissions.

A caller controls the maximum `GITHUB_TOKEN` permissions available to a called reusable workflow; the called workflow must not assume it can elevate beyond the caller. Secrets must be explicitly supplied only to workflows that genuinely need them.

## Platform signing

For Android release artifacts, `release/android-signing.md` is the canonical cross-stack signing contract for Flutter, React Native, and native Android/Kotlin.

Android release policy:
- debug signing is development-only and must never sign a production artifact;
- release/upload private keys and passwords remain outside Git;
- signing secret/property names are standardized, but actual key material and password values are app-specific;
- CI must fail closed when release signing inputs are missing;
- final AAB/APK signatures must be verified before production submission;
- existing production signing identities must not be replaced merely to conform to template naming.

## Release scope manifest and completeness reconciliation

Every release candidate must provide a **candidate-specific, version-controlled** Release Scope Manifest copied from `docs/RELEASE-SCOPE-MANIFEST.md` (for example `docs/releases/<version>/RELEASE-SCOPE.md`). Lock the owner-approved feature baseline for that candidate and preserve prior candidate records. Any subsequent scope reduction requires explicit owner approval; brownfield repositories may map an existing owner-approved equivalent register.

The manifest covers 9 mandatory areas:
1. **Owner-approved feature inventory:** Complete inventory of all capabilities approved by the product owner for this release.
2. **Acceptance criteria traceability:** Observable criteria demonstrating each feature satisfies its contract.
3. **Actual implementation status:** Genuine codebase status (`Implemented`, `In Progress`, `Blocked`, or `Scope Changed`), with exact file paths and disclosed limitations.
4. **Unit, integration, and security test evidence:** Test records explicitly distinguishing between mock/fixture-backed tests and live integration execution.
5. **Production integration dependencies:** Third-party services, APIs, databases, payment gateways, and authentication providers with environment readiness and credential status.
6. **Feature flags and configuration:** Complete disclosure of flags, runtime toggles, default states, and any disabled production functionality.
7. **Release artifacts and deployment targets:** Exact artifact files, distribution channels, and SHA-256 digests.
8. **Outstanding release gates:** Explicit listing of external release gates (e.g. test tracks, store accounts, hardware QA, production signing). Closed gates are recorded as promotion blockers, never as excuses to cut feature scope.
9. **Explicit owner-approved scope changes:** Documented human product owner approvals for any feature deferral or reduction. Agents cannot self-authorize scope reductions.

Prior to executing `scripts/verify_release.py`, the team/agent must complete Section 10 in the **candidate-specific** manifest and compare approved scope against code, build contents, intended production flags, integration evidence, and outstanding gates. Any silent removal, undisclosed disabling, or unapproved deferral FAILS reconciliation and blocks promotion. **This is a human/reviewer governance gate, not a check automatically implemented by `scripts/verify_release.py`:** the script proves configured technical validation and artifact integrity, not semantic feature completeness or live integration. Never report a policy-only checklist as an automated PASS.

## Release candidate record

For each production candidate, be able to identify:

- source commit SHA;
- version/build number;
- dependency lock state;
- CI/check results;
- artifact/checksum where applicable;
- signing certificate/fingerprint where applicable (public metadata only; never private key material);
- target environment/store;
- deployment/release timestamp;
- approver;
- migration version;
- rollback/recovery path;
- reconciled candidate-specific Release Scope Manifest reference (for example `docs/releases/<version>/RELEASE-SCOPE.md`), owner approvals, and outstanding gates.

## Standard flow

```text
merge to main
    ↓
build candidate
    ↓
automated validation (scripts/validate.py)
    ↓
release-completeness reconciliation (candidate-specific manifest)
    ↓
release candidate verification (scripts/verify_release.py)
    ↓
staging / store test track
    ↓
human release approval
    ↓
production promotion / submission (approved complete candidate)
    ↓
production smoke tests of approved features and live integrations
    ↓
observe
```

## Rollback / recovery

Document:
- last-known-good version;
- rollback command/process;
- migration rollback or forward-fix strategy;
- data restoration requirements;
- app-store rollback limitations if applicable.

## Release notes

Release notes should summarize:
- user-visible changes;
- security-relevant changes when appropriate;
- migrations or operational actions;
- known issues.

Do not use `docs/PROJECT-MEMORY.md` as the release changelog.

## Post-release

After release:
- verify critical journeys;
- monitor logs/crashes/errors;
- capture meaningful production feedback;
- create bounded follow-up tasks;
- update `docs/STATUS.md` when project state changes materially.


## RelateHandoff release and hackathon packaging

No service, deployment, store listing or signing is configured. Initial distribution will be a source repository plus local CLI installation steps, with optional demo assets. P0 is not releasable product code.

Versioning proposal: SemVer starting at `0.1.0` after the first demonstrable Relate integration; no tag or release has been created. Every release candidate must include the approved-scope record under `docs/releases/<version>/`, license decision, a clean exact-HEAD local audit, a sanitized persistent demo graph, verified installation steps, relevant tests and the owner's explicit release approval.

The inherited baseline is manual-dispatch only. Do not configure a dispatch-only check as GitHub required-PR status. Confirm actual ruleset protection in GitHub settings; policy text is not enforcement.
