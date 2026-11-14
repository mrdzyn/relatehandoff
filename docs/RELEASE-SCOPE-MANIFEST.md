# Release Scope Manifest & Completeness Reconciliation

> **Purpose:** Reusable release scope governance template for AI-native projects. Prevents coding agents and technical auditors from silently removing, disabling, deferring, or replacing owner-approved production release features when external release gates or test tracks are closed.
>
> **Template, not a completed release record.** For each candidate, copy this file to a distinct, version-controlled record such as `docs/releases/<version>/RELEASE-SCOPE.md`. Record the exact source SHA, approved feature baseline, gate results, artifact hashes, and owner references there. Never overwrite a prior candidate's sign-off or treat these sample rows and PASS labels as evidence. Brownfield projects may map an existing equivalent register rather than duplicate it. Never store credential values or private keys.

---

## Release Candidate Metadata

| Field | Value |
|---|---|
| **Repository** | `[OWNER/REPO]` |
| **Release candidate version** | `[e.g. v1.0.0-candidate, P8.0-M7]` |
| **Target candidate commit SHA** | `[FULL 40-CHAR GIT COMMIT SHA]` |
| **Candidate branch** | `[e.g. main, release/v1.0.0]` |
| **Prepared by / agent** | `[AGENT OR HUMAN NAME]` |
| **Date (UTC)** | `[YYYY-MM-DD]` |
| **Reconciliation status** | `[PENDING / RECONCILED / BLOCKED]` |
| **Approved scope baseline reference** | `[OWNER-APPROVED TASK / MILESTONE / ISSUE / LINK AND DATE]` |
| **Candidate record path** | `[docs/releases/<version>/RELEASE-SCOPE.md OR EQUIVALENT]` |

---

## Release Scope Governance Rules

1. **Closed gates block promotion, not feature scope:** When external release gates (e.g. store test tracks, external API credentials, hardware QA, staging environments) are unavailable or closed, they halt deployment/promotion. They do **not** authorize agents or auditors to remove, stub out, or defer approved release features.
2. **Passing mock tests does not prove live integration:** Tests passing against in-memory stubs, synthetic fixtures, or mocks validate local component logic only. They must be explicitly disclosed as mock evidence and never misrepresented as proof of live third-party integration or production readiness.
3. **Disabled production functionality must be disclosed:** Any feature flag, stubbed endpoint, mock fallback, or disabled functionality present in the release candidate must be explicitly declared in Section 6. Silent feature disabling or degradation is strictly prohibited.
4. **Agent-created deferrals are prohibited:** Coding agents and automated auditors have zero authority to defer approved features to future phases or scope down releases.
5. **Reduced feature releases require explicit owner approval:** Shipping a reduced feature set requires documented, explicit human owner approval recorded in Section 9.
6. **Production promotion requires explicit human release approval:** Technical verification (`scripts/verify_release.py`) confirms artifact integrity; promoting to production or submitting to storefronts always requires explicit human sign-off.

---

## 1. Owner-Approved Feature Inventory

List every feature approved by the product owner for this production release:

| Feature ID | Feature Name | Description & Approved Scope | Owner Approval Reference |
|---|---|---|---|
| `FEAT-01` | `[Feature 1 Name]` | `[Brief scope and user-facing capability]` | `[Task / Issue / Contract Link]` |
| `FEAT-02` | `[Feature 2 Name]` | `[Brief scope and user-facing capability]` | `[Task / Issue / Contract Link]` |
| `FEAT-03` | `[Feature 3 Name]` | `[Brief scope and user-facing capability]` | `[Task / Issue / Contract Link]` |

---

## 2. Acceptance Criteria Traceability

Map each approved feature to its observable acceptance criteria:

| Feature ID | Observable Acceptance Criteria | Verification Method |
|---|---|---|
| `FEAT-01` | `[Observable behavior or output]` | `[Automated test / manual QA]` |
| `FEAT-02` | `[Observable behavior or output]` | `[Automated test / manual QA]` |
| `FEAT-03` | `[Observable behavior or output]` | `[Automated test / manual QA]` |

---

## 3. Actual Implementation Status

Record the genuine implementation status of each approved feature in the codebase:

| Feature ID | Implementation Status | Code Paths / Artifacts | Disclosed Limitations / Stubs |
|---|---|---|---|
| `FEAT-01` | `[Implemented / In Progress / Blocked / Scope Changed]` | `[src/path/to/component]` | `[None / Describe any limitation]` |
| `FEAT-02` | `[Implemented / In Progress / Blocked / Scope Changed]` | `[src/path/to/component]` | `[None / Describe any limitation]` |
| `FEAT-03` | `[Implemented / In Progress / Blocked / Scope Changed]` | `[src/path/to/component]` | `[None / Describe any limitation]` |

*Note: If any feature is incomplete, blocked, or altered, it must NOT be marked "Implemented".*

---

## 4. Unit, Integration & Security Test Evidence

Record test evidence, clearly distinguishing between mock/fixture testing and live integrated execution:

| Feature ID | Test Level | Verification Tier | Test Command / Test File | Result |
|---|---|---|---|---|
| `FEAT-01` | Unit / Component | Mock / Fixture-backed | `[pytest / npm test command]` | PASS |
| `FEAT-01` | Security / Lint | Static Analysis | `[linter / security check]` | PASS |
| `FEAT-02` | Integration | Live Integration | `[integration test command]` | PASS |
| `FEAT-03` | Integration | Mock / Fixture-backed | `[test command with mocks]` | PASS (Mock only) |

*Rule: Never claim live integration passing status when tests were executed with synthetic or in-memory doubles.*

---

## 5. Production Integration Dependencies

Identify all third-party services, external APIs, databases, payment gateways, and authentication providers:

| Integration | Type | Environment Readiness | Production Credential / Host Status | Live Integration Proven? |
|---|---|---|---|---|
| `[e.g. Stripe / RevenueCat]` | Payment Gateway | `[Staging / Production]` | `[Configured / Gate Closed]` | `[Yes (Live) / No (Mocked)]` |
| `[e.g. OAuth / Auth0]` | Authentication | `[Production]` | `[Configured / Gate Closed]` | `[Yes (Live) / No (Mocked)]` |
| `[e.g. Database / Migration]`| Persistence | `[Production]` | `[Configured / Gate Closed]` | `[Yes (Live) / No (Mocked)]` |

---

## 6. Feature Flags and Configuration

Disclose the state of all feature flags, runtime toggles, and environment configurations:

| Flag / Setting | Intended Production State | Default Value | Disclosed Disabled Functionality? | Rationale |
|---|---|---|---|---|
| `FEATURE_X_ENABLED` | `true` | `false` | `[No / Yes - describe what is off]` | `[Why default is set this way]` |
| `LIVE_GATEWAY_MODE`| `true` | `true` | `[No / Yes - describe mock fallback]`| `[Why live mode is active]` |

*Rule: Any functionality disabled by configuration or flag in production must be disclosed here. Silent feature disabling is prohibited.*

---

## 7. Release Artifacts & Deployment Targets

List built release artifacts, target platforms, and verifiable SHA-256 digests:

| Artifact Name | File Path / Storefront Target | Target Environment | SHA-256 Digest |
|---|---|---|---|
| `[artifact.tar.gz / .aab]` | `dist/[artifact-file]` | `[Production / Google Play / App Store]` | `[64-hex SHA-256 hash]` |
| `[package.zip / .exe]`    | `dist/[artifact-file]` | `[Production / Microsoft Store / Direct]` | `[64-hex SHA-256 hash]` |

---

## 8. Outstanding Release Gates

List all external release gates, their current status, and promotion impact:

| Release Gate | Gate Type | Current Status | Promotion Impact | Scope Integrity Note |
|---|---|---|---|---|
| `[e.g. Staging Test Track]` | Store / Platform Gate | `[OPEN / CLOSED / UNVERIFIED]` | Blocks Production Promotion | Gate closed: deployment halted; feature code preserved intact. |
| `[e.g. Production Signing]` | Security Gate | `[OPEN / CLOSED / UNVERIFIED]` | Blocks Production Promotion | Gate closed: signing pending; feature code preserved intact. |
| `[e.g. Live API Gateway]`  | Third-Party Gate | `[OPEN / CLOSED / UNVERIFIED]` | Blocks Production Promotion | Gate closed: promotion paused; feature code preserved intact. |

*Rule: A closed gate blocks promotion to production. It does NOT permit deleting, stubbing, or deferring the feature.*

---

## 9. Explicit Owner-Approved Scope Changes

If any owner-approved feature is deferred, descoped, or modified for this release, record the explicit human owner approval:

| Change ID | Feature ID | Proposed Scope Change (Deferral / Reduction) | Justification & Impact | Human Owner Approval Signature & Date |
|---|---|---|---|---|
| `SC-01` | `[FEAT-XX]` | `[e.g. Defer live sync to v1.1.0]` | `[Reason scope reduction accepted]` | `[Approved by OWNER on YYYY-MM-DD]` |

*Rule: Coding agents and auditors cannot create entries here on their own authority. Every scope change requires explicit human product owner sign-off.*

---

## 10. Release-Completeness Reconciliation Sign-Off

Prior to release-candidate verification and approval, complete this reconciliation checklist:

- [ ] **Feature scope preservation:** All owner-approved features (`Section 1`) are accounted for; none were silently removed, disabled, or replaced.
- [ ] **No agent-created deferrals:** No features were deferred to future phases without explicit owner approval recorded in `Section 9`.
- [ ] **Disclosed configuration:** All feature flags, stubbed logic, and disabled production functions are fully disclosed in `Section 6`.
- [ ] **Truthful test classification:** Mock-backed tests and live integration tests are truthfully distinguished in `Section 4`; no mock test is claimed as live integration proof.
- [ ] **Closed gate promotion discipline:** All closed external release gates (`Section 8`) are treated strictly as promotion blockers, not feature scope reductions.
- [ ] **Artifact inventory verification:** All release artifacts (`Section 7`) exist, are non-empty, and are verified by `scripts/verify_release.py` or an approved stack-native equivalent.
- [ ] **Production configuration parity:** The intended production flags, integrations, and packages include every approved feature; configuration-only exclusions and mock fallbacks are disclosed and blocked unless owner-approved.
- [ ] **Unverified live gates preserved:** An unavailable live integration/third-party test is marked NOT VERIFIED or BLOCKED, never PASS. The feature remains in scope until its required promotion gate passes.

### Reconciliation Verdict

- [ ] **RECONCILED (READY FOR VERIFICATION):** Release scope matches owner approvals; all requirements and disclosures complete.
- [ ] **UNRECONCILED (PROMOTION BLOCKED):** Scope discrepancy, undisclosed disabled functionality, or unapproved deferral detected. Release candidate verification cannot proceed.
- **Reconciled by:** `[NAME / ROLE]`
- **Date (UTC):** `[YYYY-MM-DD]`
- **Owner Scope Acceptance (if scope changed):** `[OWNER NAME / DATE / N/A]`
