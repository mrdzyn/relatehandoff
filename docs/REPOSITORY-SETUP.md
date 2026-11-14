# Repository Setup and Enforcement

## Purpose

Repository files express the engineering policy, but GitHub administrative settings enforce important parts of it.

Creating a repository from a template does **not** by itself guarantee that branch rules, required status checks, deployment environments, secrets, or production approvals are configured correctly. Complete this setup during greenfield initialization and assess it during brownfield adoption.

Official GitHub references:
- Rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets
- Rules available in rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- Deployment environments: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- Encrypted secrets: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions

GitHub plan/repository type can affect which controls are available. If a control is unavailable, document the compensating human/process control rather than pretending enforcement exists.

## Project adoption hygiene

The template should leave each project with **one canonical source per operating concern** and only the guidance that project actually needs.

### Brownfield reconciliation

Do not copy template files into a mature repository before mapping what already exists.

Create a reconciliation matrix in the adoption task/PR:

| Concern | Existing authoritative source | Template source | Decision | Canonical after adoption |
|---|---|---|---|---|
| Agent instructions | [PATH] | `AGENTS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Current status | [PATH] | `docs/STATUS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Handoffs / continuation | [PATH] | `docs/HANDOFFS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Architecture | [PATH] | `docs/ARCHITECTURE.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Testing | [PATH] | `docs/TESTING.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Security/privacy | [PATH] | `docs/SECURITY.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Release | [PATH] | `docs/RELEASE.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Durable memory | [PATH] | `docs/PROJECT-MEMORY.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| PR CI / required checks | [existing workflows and contexts] | `ci.yml` + `common-validation.yml` | KEEP / MERGE / ADD / RETIRE | [canonical CI + stack jobs] |
| Post-merge/release CI | [push-main consumers and release jobs] | `docs/RELEASE.md` | KEEP / MERGE / ADD / RETIRE | [canonical release pipeline] |

Decision meanings:
- **KEEP** — the existing project source already satisfies the concern and remains canonical.
- **MERGE** — add only missing template controls into the existing canonical source; do not create a second policy.
- **ADD** — no authoritative equivalent exists, so add the needed project artifact.
- **RETIRE** — remove an obsolete/duplicate source, or reduce it to a short pointer to the canonical source when a compatibility path must remain. Before retiring a source, confirm that any unique content it contains has been merged into the canonical source or is deliberately no longer needed; never retire a source merely because its filename overlaps with the template.

Rules:
- for CI, reconcile **all** required contexts, PR versus `push: main`/manual triggers, privileged release jobs, permissions and unique tests before changing any pipeline;
- **KEEP** stronger existing CI; **MERGE** only missing checks without losing unique coverage; **ADD** the paired reusable workflow and caller only when needed; **RETIRE** duplicate jobs only after preserving unique behavior and safely migrating required statuses;
- in brownfield repositories, an equivalent project-owned CI system may remain canonical; do not force the template filenames or remove `push: main` when release/artifact/coverage consumers still depend on it;
- never copy or require the master-only `Template integrity` job in a child repository;
- one concern should end with one authoritative source;
- project-specific guidance outranks generic template guidance unless it conflicts with the human-gated safety model;
- do not duplicate policy merely to match template filenames;
- if Project Baseline expects a path that the mature repository intentionally replaces, adapt the baseline mapping/validator deliberately rather than maintaining two competing documents;
- update `AGENTS.md`, task templates, and other pointers so agents load only the canonical source;
- if two existing sources conflict materially and authority is unclear, stop for owner resolution before editing either one.

### Greenfield pruning

A repository created with **Use this template** initially contains the complete master-template inventory. After `config/project-profile.json` is changed to `repositoryMode: "project"`, prune inherited material that is not part of the new project.

Always:
- replace master `README.md`, product/architecture/status content, and placeholders with project-specific content;
- remove the master-only block from `docs/PROJECT-MEMORY.md`;
- remove the inherited master-template handoff block from `docs/HANDOFFS.md` while retaining its policy/template and generic entry markers, then reset `docs/STATUS.md` to `Active handoff: None`;
- **keep** `.github/workflows/ci.yml` **and** `.github/workflows/common-validation.yml` together: the former calls the latter via `uses: ./.github/workflows/common-validation.yml`; removing the callee breaks caller wiring and local/hosted baseline validation;
- **keep** `scripts/validate_project_profile.py` (used by the shared baseline);
- **keep** `docs/SESSION-CONTINUITY.md` and `scripts/session_context.py` (retaining read-only session continuity context recovery across conversations without prior chat memory);
- **keep** core `docs/AGENT-ORCHESTRATION.md` guidance; subagent frameworks and token-usage instrumentation are optional and should not become prerequisites for child projects;
- **keep** core governance template `docs/RELEASE-SCOPE-MANIFEST.md` even when `capabilities.storeRelease=false`; create an owner-reconciled record for each candidate, such as `docs/releases/<version>/RELEASE-SCOPE.md`, without carrying master-template sample features or PASS labels as actual approvals;
- **remove** `.github/workflows/template-integrity.yml`, `scripts/validate_master_template.py`, `scripts/test_validate_project_profile.py`, and `scripts/test_session_context.py` (all master-only);
- remove inherited master task/history files under `tasks/` while keeping `tasks/README.md` and `tasks/TEMPLATE.md`, then create only project-specific task files;
- verify the shared baseline's master-only inventory and self-test steps retain the `github.repository == 'mrdzyn/ai-native-project-template'` guard and skip in the child;
- under the inherited local-first default (`docs/MANUAL-CI.md`), routine development PRs use exact-head local validation (`scripts/validate` and stack tests) rather than automatic GitHub-hosted PR runs. Do **not** require `Project baseline / Common validation` in the child's GitHub ruleset unless the child explicitly adopts automated hosted PR enforcement (which requires adding `pull_request` to `ci.yml`). Final release candidate verification executes locally on approved/trusted infrastructure (`scripts/verify_release`), while dispatching the retained hosted baseline via `workflow_dispatch` remains optional supplementary automation. Add and require real project stack lint/test/build/security checks separately according to the project's chosen gate mode; GitHub ruleset settings do **not** copy from the master repository.

Then prune optional packs according to the project profile:
- if `capabilities.design=false`, remove `docs/DESIGN-SYSTEM.md`, `docs/ACCESSIBILITY.md`, and `design/`;
- if design is enabled, keep the design core but remove unselected platform files and unselected design-integration guides;
- if `capabilities.storeRelease=false`, remove `store/`;
- if store release is enabled, keep the shared distribution core and selected storefront profiles; remove unselected storefronts and app-store overlays that do not apply;
- keep `store/china-mainland-games.md` only when mainland-China game distribution is actually in scope;
- remove unselected third-party integration guides under `integrations/`; the directory README may be removed when no integration guidance remains;
- keep `release/android-signing.md` only when Android, Google Play, or Huawei AppGallery is in scope.

Core operating-model files required by Project Baseline should remain unless an approved brownfield mapping intentionally replaces them. An optional file may be retained despite not being selected only when the project documents a concrete reason; it must not become default agent context merely because it is present.

Pruning is a **greenfield bootstrap step**, not a recurring cleanup job. Do it before normal feature work so future agents do not spend context on inherited template material.

## Main branch baseline

**Local-first policy (2026-11-07):** `docs/MANUAL-CI.md` defines the local-first, Actions-independent CI and release validation default. Mandatory development validation and release candidate verification execute **locally** on approved infrastructure (`scripts/validate`, `scripts/verify_release`), preserving exact-head automated checks, independent review, PR protections and human approval. GitHub Actions is retained as optional supplementary automation (`workflow_dispatch`), never a prerequisite to approving or releasing. Earlier E2a/E2b descriptions below are historical and must not override the adopted current mode. Existing brownfield/project-specific required checks remain effective until separately changed by that owner.


Configure `main` with a branch protection rule or ruleset appropriate to the repository.

Recommended baseline:
- require changes through a pull request;
- require the repository's *current* approved validation evidence (local exact-head tests under the adopted local-first mode, or the GitHub-required checks actually configured);
- block force pushes to protected release branches;
- block branch deletion where appropriate;
- require conversation resolution where the team workflow supports it;
- prevent bypass except for explicitly governed break-glass administration;
- keep the repository's default branch set to `main`.

Release-scope preservation is a core operating-model control, not an optional storefront pack. For brownfield adoption, KEEP or MAP the existing approved release register rather than replacing owner decisions or importing generic example features. Record discrepancies as blockers, never agent-created deferrals. See `docs/RELEASE.md` and `docs/RELEASE-SCOPE-MANIFEST.md`.

For generated projects adopting the local-first default, run the deterministic profile and hygiene baseline locally on each development PR (`scripts/validate`) plus the project's real stack tests. Release candidate verification runs locally via `scripts/verify_release`; the retained `Project baseline / Common validation` hosted job is optional supplementary automation, not automatically required on PRs or releases. Existing projects with stronger GitHub-required checks must satisfy them unless their owner separately approves migration.

The master template has active PR protection, thread resolution, no forced updates/deletion and PR-only admin bypass under `Protect Main` ruleset `23809419` (with required status check contexts removed). The standalone `Template Integrity` is manual-only. Restoring automatic required checks later demands reactivating and proving the PR trigger **before** making the emitted status required again.

## Review and human approval

The operating model requires:

```text
implementation → CI → independent review → human approval → merge
```

Where GitHub supports the desired reviewer model, configure required PR approvals and stale-review handling.

For a solo-owner repository where a GitHub approval rule would make normal work impossible, do not fabricate an approval. Keep required CI, independent audit evidence in the PR, explicit owner approval before merge, and protected direct-push behavior where available.

## Direct pushes and force pushes

Routine feature work should not bypass PR review by pushing directly to `main`.

Recommended:
- disallow force pushes to `main`;
- disallow deletion of protected release branches;
- limit bypass permissions;
- when an owner/admin CI-availability exception is required, prefer a ruleset bypass configured as **For pull requests only** so the actor must still use a pull request and does not gain routine direct-push authority;
- document any emergency/break-glass path and require follow-up review.

## Required status checks

Do not rely only on the generic template check.

Under the local-first development default (`docs/MANUAL-CI.md`), routine development PRs and release candidates use exact-head local automated validation (`scripts/validate`, `scripts/verify_release`), independent review, thread resolution, and human merge approval, with **zero required GitHub status checks** configured in branch rulesets to prevent dispatch-only workflows from deadlocking PR merges.

If a project repository operates in or transitions to an automated hosted PR CI mode (e.g. mature brownfield repositories or funded hosted CI teams), require only the stable emitted contexts for checks that run on the `pull_request` event, as defined by the gate classes in `docs/TESTING.md`:

- `Project baseline / Common validation` (confirm this actual emitted check name for the child repository, and verify the `pull_request` trigger is active before marking required; never require a dispatch-only check on PRs);
- stack-specific lint/static analysis where required;
- typecheck/compile where applicable;
- risk-required tests;
- build/package validation when needed for merge safety;
- security/dependency checks appropriate to the product;
- artifact validation only when needed to establish **PR merge safety**. Verification of the exact signed/published release candidate belongs to the **release-only** gate in `docs/TESTING.md` and `docs/RELEASE.md` via manual `workflow_dispatch`.

A check should only be marked required after its trigger is active and its name and behavior are stable enough not to deadlock merges.

### Project-owned stack extension contract

The reusable common-validation workflow is deliberately stack-neutral. Child projects extend CI by adding **explicit sibling jobs** in their own `.github/workflows/ci.yml`; do not add arbitrary command inputs to `.github/workflows/common-validation.yml` merely to centralize stack behavior.

Recommended shape:

```yaml
jobs:
  project-baseline:
    name: Project baseline
    permissions:
      contents: read
    uses: ./.github/workflows/common-validation.yml

  stack-validation:
    name: Stack validation
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<PINNED_COMMIT>
        with:
          persist-credentials: false
      - name: Set up toolchain
        run: <PROJECT-OWNED SETUP>
      - name: Validate
        run: <PROJECT-OWNED COMMAND>
```

Replace the placeholder stack job with the project's real native commands and split it into stable jobs when separate status checks are useful. Examples include lint/static analysis, typecheck/analyze, unit or targeted integration tests, build/package, and security/dependency checks.

Rules:

- keep stack commands in the project's native package/build system or small project-owned scripts when that improves local/CI parity;
- keep stack jobs visible in the project repository rather than hiding them behind a universal command-runner configuration;
- do not create empty/fake jobs for ecosystems the project does not use;
- choose stable job names before making their emitted status checks required;
- use the narrowest practical `permissions`; ordinary PR validation should normally remain `contents: read`;
- follow the canonical PR vs release/deployment trust boundary in `docs/RELEASE.md` for production secrets, restricted-fork credentials, `pull_request_target`, privileged `workflow_run`, OIDC, and release/signing/store/deployment separation.

The four gate classes — required PR, optional informational, release-only, and manual/human — are defined in `docs/TESTING.md`. Do not make every CI job required merely because it exists.

### Local-first CI and release validation policy — 2026-11-07

See `docs/MANUAL-CI.md` for the owner-approved model applying to the master template and future generated children. This is **intentional cost and autonomy conservation**, ensuring development, testing, security, and release-candidate verification are fully executable locally on approved infrastructure without requiring GitHub Actions. The master `Protect Main` ruleset `23809419` maintains PR protection and administrative safeguards without required GitHub status contexts. No other existing repository's ruleset is automatically modified.

Exact-head local checks (`scripts/validate`, `scripts/verify_release`), independent audit and owner approval are mandatory for development PRs and release candidates. Older sections describing always-hosted PR checks become historical rather than current. The emergency exception below applies to brownfield or child repositories that intentionally configure required hosted status checks when hosted CI is unavailable.

### CI availability / hosted-runner quota exception

Required CI is the normal merge gate. A project should also define what happens when the required GitHub-hosted checks **cannot execute at all** for reasons outside the proposed change, such as:

- the repository owner's included GitHub Actions quota is exhausted and additional hosted-runner use is blocked;
- GitHub Actions or the required hosted runner is experiencing a service outage;
- an account/repository runner-availability condition prevents the required job from starting.

This exception is **not** valid when the workflow ran and found a real failure. A failing test, build, security check, signing check, migration check, or policy validation must be fixed or explicitly handled through the normal risk-acceptance process; do not relabel it as "CI unavailable."

Recommended break-glass process:

1. Keep the change in a pull request. Do not switch to a direct push to the protected branch.
2. Record the CI-unavailable reason in the PR, with enough evidence to distinguish external runner/quota unavailability from a real code/check failure.
3. Run the equivalent required validation locally or on another approved trusted execution path and record the commands/results actually obtained. If equivalent required validation cannot be executed, the CI-unavailable bypass must not be used.
4. Record the exact PR head SHA covered by the equivalent validation, then complete the repository's required independent review/audit against that same head. If the PR head changes afterward, repeat the equivalent validation and independent review for the new head before using the bypass.
5. Require an explicit project-owner or authorized repository-admin decision to use the exception.
6. Use a **pull-request-only** ruleset bypass where GitHub supports it. Do not grant a blanket always-bypass role merely to solve temporary CI unavailability.
7. Keep the normal required-check configuration in place for future PRs. Do not globally remove the checks or disable the ruleset as the routine workaround.
8. After hosted CI becomes available again, resume the normal required-CI path.

Suggested PR record:

```text
CI availability exception:
GitHub-hosted Actions could not execute because [quota/service/runner availability reason].
Validated PR head SHA: [exact SHA].
Equivalent required checks run outside hosted CI: [commands/results].
Independent exact-head review: [completed/reference].
Owner/admin PR-only bypass approved by: [name/role].
No genuine failing executable check is being overridden.
If the PR head changes, this evidence and review must be repeated for the new head before bypass.
```

Where supported, configure the branch ruleset bypass list with only the smallest appropriate owner/admin actor or role and set its bypass mode to **For pull requests only**. This preserves a PR/audit trail while preventing the exception from becoming direct-push permission.

### Master-template CI runner consolidation (E2a and E2b completed; superseded by local-first CI and release validation)

The master template previously required two contexts: `Template integrity` and `Project baseline / Common validation`. The project-owner-approved ruleset cutover retained **only** `Project baseline / Common validation` as required. E2b PR #23 was squash-merged (`2d167b52bff2cce9506315b8615e53e84c62c642`), making the standalone `Template integrity` workflow manual-only (`workflow_dispatch`).

- **E2a shadow phase — completed:** The required common baseline executed master-only inventory and capability self-tests when `github.repository == 'mrdzyn/ai-native-project-template'`. Before cutover, the separately required `Template integrity` job ran those checks in parallel, and both workflows passed exact-head hosted CI.
- **Owner-controlled gate cutover — completed:** Following E2a's independent audit, merge and real-PR verification, the owner separately approved the change to live ruleset `23809419`. GitHub read-back confirmed the baseline became the **sole required check**, and its master inventory/self-tests continued to execute.
- **E2b job economy — completed:** PR #23 was squash-merged, removing the automatic `pull_request` trigger from `template-integrity.yml` while retaining `workflow_dispatch` and both validators. Exact-head GitHub runs confirmed one automatic PR runner (`Project Baseline CI`) executed all master checks, with zero dedicated `Template Integrity` PR runs.

**Security trade-off accepted before the E2b ruleset change:** a separate required `Template integrity` context previously failed closed if that job disappeared from a PR. With only the baseline required, a PR could remove or weaken master-only steps in `common-validation.yml` (or their caller/script) yet still emit a successful baseline check. Mere presence of validator files is not a defense. The owner explicitly chose process-only independent audit with this residual risk acknowledged; E2a's passing result alone was not used as authorization.

The compensating controls evaluated before the cutover were:

- **Option A — enforced independent review (not selected):** would require a verified code owner or independent approving reviewer for sensitive CI/validator changes. There is no additional eligible human reviewer available. No CODEOWNERS or live review-enforcement rule was introduced.
- **Option B — process-only independent review (selected):** require independent exact-head audit of every PR, followed by separate owner merge approval. This is **not technically enforced** by the live ruleset (zero required approving reviews); privileged mergers can bypass the process. The owner explicitly accepted that limitation before the live ruleset cutover. If independent review cannot be assured later, stop and consider restoring the second required check through the ordered rollback procedure below.

### E2b Option B — owner-selected process-only independent audit (active governance)

**Decision:** The project owner selected **Option B** after confirming no additional human GitHub reviewer is available. The owner knowingly accepts that external AI audit and chat-based merge authorization are **process controls only**, not GitHub-enforced approving reviews; a privileged repository actor may bypass these process steps. A single required `Project baseline / Common validation` check will not independently detect its own workflow steps being removed or weakened. These limitations are **accepted for the master operating model**, not a representation that GitHub now enforces them.

**Compensating controls (mandatory project workflow):**

1. **Development CI and release policy:** Under the adopted local-first CI policy (`docs/MANUAL-CI.md`), development PRs and release candidate verification execute on approved local/self-controlled infrastructure (`scripts/validate`, `scripts/verify_release`), with exact-HEAD automated evidence, diff and tracked-env hygiene, and objective-based stack tests, rather than requiring GitHub Actions. The previous E2b imperative requirement of an active GitHub-hosted status check is historical; the master `Protect Main` ruleset `23809419` had its required status context removed prior to merge. Hosted validation via `workflow_dispatch` is optional supplementary automation, never a release prerequisite. No genuine failing check may be waived. Preserve PR-based development, conversation thread resolution, no force-pushes/deletion, and PR-only admin bypass.
2. For **every** PR, especially changes to `.github/workflows/ci.yml`, `.github/workflows/common-validation.yml`, `.github/workflows/template-integrity.yml`, `scripts/validate_master_template.py`, `scripts/validate_project_profile.py`, `scripts/test_validate_project_profile.py`, or relevant security/branch policy, require **Claude's independent exact-head review** after implementation by Grok/ChatGPT. Obtain PASS or explicitly remediate/re-audit findings. Do not mistake a GitHub `COMMENTED` bot review for formal GitHub approval.
3. Have ChatGPT independently check the PR's current SHA, required CI/local validation results, review-thread disposition, scope and release/security boundaries, and the Claude review conclusion before recommending a merge. If the SHA changes, refresh the evidence and repeat the independent exact-head audit as required.
4. Require a **new explicit decision from the human project owner** to merge each PR, including documentation-only PRs; any production deployment or publish action requires separate explicit approval.
5. The owner must consciously maintain this human/AI review discipline; it is not guaranteed by the live ruleset (which requires zero GitHub approving reviews). Authorized bypass actors remain able to circumvent this policy. If the owner later needs GitHub-enforced approval, introduce a genuinely independent eligible GitHub reviewer first, or retain/reinstate two separate required CI checks.

**Gate status (master repository):** Live ruleset ID `23809419` maintains PR protection and thread resolution with required status check contexts removed under the manual-first / local-first policy adoption (P8.0 M4/M5). Standalone `Template integrity` is manual `workflow_dispatch` only. Every merge still requires exact-head validation, Claude audit, and fresh owner approval. Retain rollback ordering below.

**Rollback order (do not reverse):**

1. Keep or restore `Project baseline / Common validation` operational. First restore the `pull_request` trigger to `template-integrity.yml` (and/or `ci.yml`) in a reviewed, normally validated PR; do not yet re-add its required context.
2. On a **subsequent real PR**, verify the workflow is emitted and passes, with inventory and capability self-tests actually executed.
3. Only then, with owner approval, re-add the context as required in the active ruleset; confirm required contexts and PR/bypass protections remain unchanged.
4. If either job fails or a check is absent, stop; do not add a non-emitted required context or use a ruleset bypass to manufacture success.

This is a **master-only** cutover. Generated projects are not expected to require `Template integrity`. Their inherited baseline's master-only steps are guarded and skip outside the canonical master repository. P8.0 M3 must explicitly prune `scripts/validate_master_template.py`, the dedicated master-only integrity workflow, and master-only self-test script while preserving the child-compatible `common-validation.yml`.

### CI trigger economy

Under the local-first development model (`docs/MANUAL-CI.md`), the master template and newly generated projects default to manual dispatch for universal baseline validation:

```yaml
on:
  workflow_dispatch:
```

This means:
- routine development PRs are validated locally by agents and reviewers running exact-head automated checks (`scripts/validate`), conserving hosted runner minutes and quota;
- no redundant universal-validation runner jobs start automatically on every PR push or merge;
- for release candidates, verification is performed locally on approved infrastructure via `scripts/verify_release`, while dispatching the retained workflow on the candidate SHA remains an optional supplementary check.

**Automated hosted PR alternative (e.g. brownfield or funded hosted teams):**
For repositories that explicitly choose enforced GitHub-hosted PR checks, the recommended economical trigger is one PR run without duplicate post-merge runs:

```yaml
on:
  pull_request:
  workflow_dispatch:
```

In that mode:
- ordinary changes are validated on PRs; protected `main` requires the emitted validation status before merge;
- no redundant universal-validation runner jobs start automatically just because the reviewed PR is merged;
- a human can dispatch the workflow on `main` when an exact post-merge validation run is needed, without granting PR jobs production credentials.

**Trade-off:** PR validation is not proof that an exact post-merge commit or production artifact has been verified. A project requiring that guarantee must explicitly retain appropriate `push` validation or add an independent release-candidate validation gate (per `docs/RELEASE.md`). PR-only checks are **not** production-release authorization.

For an existing/brownfield repository, inspect consumers of `push: main` (release preparation, branch coverage, external automation, badge/monitoring status, environment readiness, etc.) before removing it. Preserve a required post-merge trigger if it protects a real invariant; do not blindly apply the default to projects with different CI/release needs.

If a project adds explicit stack-specific jobs, place their required PR checks in the project workflow without also running the same expensive matrix on feature-branch pushes. Use normal PR concurrency cancellation where appropriate; cancellation cannot substitute for required validation.

Do not make a required workflow depend on `paths:`, `paths-ignore:`, or other filters that can skip its required context and leave a PR blocked. Keep required check names stable, and coordinate any rule change independently of trigger optimization.

### Optional self-hosted runner fallback

Self-hosted runners may be used as an optional fallback when hosted-runner quota or availability is the constraint. They are not a default dependency of this template.

If used:
- treat the runner machine as security-sensitive infrastructure;
- keep it patched and access-controlled;
- avoid exposing long-lived production credentials to general CI jobs;
- self-hosted runners are especially risky on public repositories, where external contributors can open pull requests that may execute workflow code; avoid them for public repos unless the project has a deliberate, reviewed containment model such as ephemeral/isolated runners plus explicit approval for workflows from forks;
- isolate or avoid untrusted fork/PR code on persistent privileged runners unless the project has a deliberate containment model;
- keep runner labels/repository access scoped as narrowly as practical;
- document who operates the runner and how it is recovered or disabled.

The project may choose the simpler documented PR-only bypass + equivalent local validation process instead of operating self-hosted infrastructure.

## Repository secrets and variables

Use GitHub Actions secrets/variables or an approved external secret manager.

Rules:
- never commit secrets to source;
- separate development/staging/production credentials;
- scope credentials with least privilege;
- use environment-scoped secrets for production where appropriate;
- prefer short-lived/federated cloud credentials when supported;
- document required secret/variable names without recording values;
- rotate credentials when exposure is suspected.

Maintain a project-specific setup table, for example:

| Name | Type | Environment | Purpose | Owner |
|---|---|---|---|---|
| `DEPLOY_TOKEN` | secret | staging | deployment | TBD |

For Android release projects, `release/android-signing.md` defines the canonical signing names:

| Name | Type | Typical scope | Purpose |
|---|---|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | secret | release/production | CI transport of app-specific upload keystore |
| `ANDROID_UPLOAD_STORE_PASSWORD` | secret | release/production | keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | variable/config | release/production | upload/release key alias (greenfield default: `upload`) |
| `ANDROID_UPLOAD_KEY_PASSWORD` | secret | release/production | upload private-key password |
| `ANDROID_UPLOAD_STORE_FILE` | runtime variable | build job | temporary/local keystore path |

Record names only, never values. Base64 keystore content is still critical secret material.

## Environments

For projects with deployment automation, use explicit environments such as:

```text
development → staging/test → production
```

Production should remain human-gated.

Where supported, configure:
- required reviewers/protection rules;
- environment-scoped secrets;
- deployment branch/tag restrictions;
- clear environment naming;
- audit-friendly release records.

If GitHub environment reviewers are unavailable, retain the explicit human approval gate in the release process and document the compensating control.

## Store releases

App-store submission is a production release.

For app-store projects:
- use the applicable `store/` profiles;
- for Android, also follow `release/android-signing.md`;
- protect signing keys/certificates;
- separate sandbox/test from production commerce credentials;
- record the exact source SHA/build submitted;
- require human release approval before submission.

## Greenfield checklist

- [ ] `config/project-profile.json` changed from `template` to `project`.
- [ ] Relevant capability packs selected.
- [ ] Master-only memory and Template Integrity workflow removed.
- [ ] Inherited master handoff block removed; HANDOFFS policy/template and generic entry markers retained; `Active handoff` reset to `None`.
- [ ] Inherited master task/history files removed; only task scaffolding and project tasks remain.
- [ ] Unselected optional design/store/platform/integration/release guidance pruned or explicitly justified.
- [ ] Master-only capability self-test script removed unless intentionally maintained by the child project.
- [ ] Canonical core operating-model files contain project-specific rather than master-template status/history.
- [ ] Default branch confirmed.
- [ ] PR/ruleset or branch-protection configuration reviewed.
- [ ] Required CI checks selected.
- [ ] CI trigger model avoids duplicate feature-branch push + pull-request validation unless explicitly justified.
- [ ] CI-unavailable/quota break-glass process documented; if bypass is configured, it is pull-request-only and limited to the smallest appropriate owner/admin actor or role.
- [ ] Direct/force-push policy configured.
- [ ] Review/conversation rules configured where practical.
- [ ] Repository/environment secrets and variables identified.
- [ ] Production environment/protection configured where applicable.
- [ ] Human merge and production gates confirmed.

## Brownfield checklist

Before changing settings:
- [ ] build the KEEP / MERGE / ADD / RETIRE reconciliation matrix;
- [ ] identify one canonical source for each operating concern;
- [ ] identify duplicate/conflicting instructions and resolve authority before editing;
- [ ] reconcile any existing handoff/continuation mechanism so only one remains canonical;
- [ ] update agent/task pointers so retired sources are not loaded;
- [ ] inspect existing branch protections/rulesets;
- [ ] inspect current required status checks, integration identities and any potential rename-induced merge deadlock;
- [ ] if using the inherited baseline caller, retain its same-repository `.github/workflows/common-validation.yml` dependency;
- [ ] inspect whether branch-push and pull-request workflows duplicate validation/cost; check post-merge/release consumers before removing `push: main`;
- [ ] preserve stronger existing stack-specific and privileged release controls; exclude the master-only Template Integrity workflow;
- [ ] inspect existing ruleset bypass actors/modes and preserve or tighten any CI-unavailable break-glass path;
- [ ] inspect deployment environments;
- [ ] identify existing secrets/variables without exposing values;
- [ ] preserve stronger existing controls;
- [ ] identify conflicts before replacing policy;
- [ ] document any control the template cannot enforce automatically.

Do not weaken a mature repository's protections merely to make it resemble the template.
