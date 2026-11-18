# RH-P4 — Cloudflare Judge Showcase Plan

**State:** Proposal for owner review. Baseline `main@81e8e208eeb8a23417e18f2a8d3f379f441e6ed8`. No site, Cloudflare resource, deployment or submission exists or is authorized. Cloudflare facts below were checked against Cloudflare's documentation on 2026-11-18; re-verify before implementation.

## 1. Goal and non-goals

**Goal:** a single static page that lets a judge grasp, in about two minutes, what RelateHandoff does, how evidence is labeled honestly, and where to run the real thing.

**Non-goals (hard boundaries):**
- No change to `src/`, tests, schema, fixtures, dependencies of the engine, or the read-only MCP boundary.
- No public MCP server, API, serverless function, Pages Functions, Workers, database, KV/D1/R2, queue, or any write path.
- No authentication, accounts, forms, cookies, analytics scripts, third-party embeds, fonts or CDNs.
- No API keys or secrets in the repository, the site, or CI. No user-data collection.
- No claim that the page executes Relate. The page never authorizes a merge, approval or release.

## 2. Truthfulness model (the core requirement)

Every visual or number on the page carries exactly one provenance label, shown in text (not color alone):

| Label | Meaning | Allowed sources |
|---|---|---|
| `RECORDED` | Copied from a real run, with HEAD SHA, date, host and Relate version stated | A real exact-HEAD `npm run demo` or `resume` output, sanitized, stored as one committed JSON file |
| `ILLUSTRATIVE` | Drawn to explain a concept; not output of any run | Architecture graph layout, the three-step story, example arrows |
| `LIVE` | Executed by a visitor's browser against Relate | **Forbidden.** Does not exist in this showcase |

Rules:
- Status examples (`VERIFIED`, `STALE`, `UNVERIFIED`, `BLOCKED`, plus `CURRENT`/`AUTHENTICATED`/`SELF_ASSERTED`/`FAILED` as the engine emits them) are taken from the demo's actual states, with the engine's own reason codes (for example `HEAD_SHA_MISMATCH`, `UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE`, `EVIDENCE_FAILED`).
- Persisted unsigned evidence is shown as `UNVERIFIED`; the page states that a fixture's `PASS` is a claim, not proof.
- Each `RECORDED` block shows date, Git SHA, Relate `v1.0.1`, host platform and "reviewed by owner" only if that is true.
- Mock, `(fake)` or author-reported evidence is never shown as real. Environmental limits (Linux `GLIBC_2.39` for the prebuilt CLI, snapshot-on-open MCP behavior, unsigned local store) get a visible "Limits" section.
- The video slot reads "Demo video: not yet recorded" until the owner supplies a real public URL; it then becomes a plain outbound link (no embed). No placeholder link is shipped.

## 3. Requirements (observable acceptance for T2/T3)

1. **Architecture graph** (`ILLUSTRATIVE`): Git repo/commit, task, handoff, decision, evidence, writer agent → recorder → Relate directory store ← read-only MCP ← reader agent. Inline SVG with a text-equivalent list/table so nothing is graphics-only.
2. **Three-step handoff** (`ILLUSTRATIVE` narrative, with a `RECORDED` excerpt): (1) *Record* — validated recorder writes handoff + Git state + evidence; (2) *Resume* — a fresh agent reads bounded context through read-only MCP; (3) *Check* — freshness is recomputed against the current Git HEAD; changed HEAD ⇒ `STALE`.
3. **Evidence status examples** (`RECORDED`): one card per status with the real reason codes and a one-line plain-language explanation.
4. **Links:** GitHub repository (`https://github.com/mrdzyn/relatehandoff`), README quickstart, license (Apache-2.0), and the demo video once real.
5. **Responsive and accessible:** works from 320 px; WCAG 2.2 AA targets (see §5); no horizontal page scroll; supports light/dark and reduced motion; fully usable without JavaScript.
6. **Minimal dependencies:** zero runtime and zero build-time npm packages; hand-written HTML, CSS and optionally one small first-party script. No bundler.
7. **Privacy:** no cookies, storage, analytics, or third-party requests. Cloudflare's own edge request logging still applies and is disclosed on the page.

## 4. Screen map and flows (for design review; no mockups yet)

Single route `/` (plus `/404.html`). Sections in order, each reachable from an in-page anchor nav:

1. **Hero** — name, tagline "One context. Every agent.", one-sentence summary, provenance legend, buttons: *View on GitHub*, *Demo video* (state-dependent).
2. **How a handoff works** — three steps with the `RECORDED` excerpt.
3. **Architecture** — graph + text equivalent.
4. **What the evidence statuses mean** — status cards.
5. **Try it yourself** — the pinned judge commands copied from `README.md` (static text; copy button optional and progressive).
6. **Limits and honesty** — unsigned store, snapshot behavior, GLIBC, "Git stays authoritative", Cloudflare logging note.
7. **Footer** — license, attribution (Relate by Neo4j Labs, not endorsed), repository link.

Required states: no-JS, narrow viewport, high zoom/text scaling (200 %), forced-colors, print, video-not-yet-available, and JSON-fixture-missing (page still renders static content). There are no loading, auth, empty-data, offline-write or destructive states because nothing is dynamic.

User flows: judge lands → reads hero → follows GitHub or video link, or scrolls the three steps → copies commands. No flow collects input.

## 5. Design gate procedure (closed; follow before T2)

Per `AGENTS.md` and `docs/CAPABILITY-PACKS.md`:
1. Owner approves UI work (decision D1).
2. Set `config/project-profile.json` to `capabilities.design=true`, `platforms=["web"]` (nothing else) in a reviewed PR.
3. Restore only the selected guidance from `mrdzyn/ai-native-project-template` per `docs/REPOSITORY-SETUP.md`: design core, accessibility, web platform file, component catalog. Do not restore store, integration or Android packs. `scripts/validate_project_profile.py` then expects those files (currently 16 files verified); re-run it.
4. Produce screen designs/mockups with required states; owner approves.
5. Only then build the shell (T2).

Accessibility targets once restored guidance exists: landmarks and heading order; skip link; visible focus; contrast ≥ 4.5:1 text / 3:1 UI; status shown as text + icon + shape, never color alone; SVG has `role="img"` with title/desc and the text-equivalent list; target size ≥ 24 px; `prefers-reduced-motion` and `prefers-color-scheme` honored; `lang` set; no auto-playing media.

## 6. Build plan

**Layout (proposed, created only at T2):**
```
site/
  index.html
  404.html
  styles.css
  graph.svg            # or inline in index.html
  data/recorded-demo.json   # RECORDED, sanitized; one file
  _headers             # security headers (static assets only)
scripts/check_site.mjs # Node built-ins only; no new dependency
test/site.test.mjs     # node:test content/security checks
```
No bundler, no framework, no `package.json` dependency changes. The only `package.json` edit allowed at T2 is adding a `check:site` script (decision D6), and wiring it into the existing `test` contract needs separate owner approval because it changes `config/validation-contract.json`/`npm test` behavior.

**Recorded data capture (T3):** run `npm run demo` and `resume` on the exact HEAD with real Relate `v1.0.1`; copy only status, reason codes, tool names and synthetic IDs into `recorded-demo.json` with `{gitSha, capturedAt, relateVersion, platform, command}`. Strip temp paths, usernames and machine details. The static check re-validates no path-like strings (`/Users/`, `/home/`, `C:\`).

**Automated checks (T2, Node built-ins):**
- every `RECORDED` block has SHA/date/version fields; no element labelled `LIVE`;
- no `<form>`, `<iframe>`, `<script src=http…>`, external `href` other than the allowlist (GitHub repo, Cloudflare/Neo4j/Relate/Devpost references the owner approves, video URL when supplied), no `fetch(`/`XMLHttpRequest`/`WebSocket`, no `localStorage`/`document.cookie`;
- heading order, `lang`, alt/title/desc present, skip link, `_headers` contains the required policy;
- no secret patterns (reuse `scripts/check_secret_tracking.py` plus content scan); recorded JSON path-leak scan.

**Manual QA (T3):** the built-in browser at 320/375/768/1280 px, 200 % zoom, light/dark, reduced motion, forced colors, JavaScript disabled, keyboard-only pass, screen-reader spot check; screenshots stay private unless sanitized.

**Local preview:** any static file server over `site/` (for example `python3 -m http.server --directory site`); never exposes the repository root.

## 7. Cloudflare Pages configuration (proposal; nothing created)

- **Product:** Cloudflare Pages static site. Cloudflare's Pages docs describe Git-integration setup with a build command (`exit 0` recommended) and a build output directory, and `_headers` support for static assets. Cloudflare may recommend Workers static assets for new projects; that was **not** confirmed from the pages checked, so owner decision D2 asks which product to use.
- **Deployment mode:** **Direct Upload, manual, owner-run** (for example `npx wrangler pages deploy site --project-name <name>`, to be re-verified against current Wrangler docs at T4). **No Git-connected automatic production deployment** and no preview-deployment automation until the owner explicitly approves each (D3).
- **Settings if Git integration is later approved:** production branch `main`, build command `exit 0`, output directory `site`, no environment variables, no secrets.
- **Bindings/Functions:** none. No `functions/` directory, no `_worker.js`, no KV/D1/R2/Queues/AI. Response headers from `_headers` apply only to static assets, which is all that exists.
- **Domain:** default `*.pages.dev`; custom domain only by separate owner decision.
- **Web Analytics / RUM:** off.
- **Access control:** public read-only static content. Preview URLs are public too, so previews must contain only content already approved for publication.
- **Proposed `_headers` (T2 draft):**
```
/*
  Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'none'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
```
  HSTS is provided at the Cloudflare edge by owner setting, not asserted here. Within `_headers` limits (100 rules, 2,000 characters per line).
- **Enablement:** creating the Pages project, uploading, and any DNS change require explicit owner approval at T4. Cloudflare account/API credentials are the owner's and are never placed in the repository, chat or CI by an agent.

## 8. STATUS and validation policy (this PR)

- `docs/STATUS.md` names `tasks/RH-P4-cloudflare-judge-showcase.md` as the active task. `scripts/test_bootstrap.py` requires the active task to be in an allowlist and to exist; this PR adds exactly that task path and leaves both fail-closed checks intact. This is the same pattern as merged PR #9.
- Canonical validation applies unchanged: `validate.py` 8/8, `RELATE_REQUIRE_CLI=1 npm test` (15/15, 0 skipped), `test:security`, `build`. Site checks added at T2 must run through the contract rather than being a side script that CI ignores (D6).
- Hosted CI and rulesets remain owner decisions; GitHub Actions stay manual-dispatch.
- Verification labels stay explicit: author-reported versus independently reproduced.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Visitors mistake the diagram for live execution | Provenance labels (§2), no `LIVE` class, "Limits" section, static checks |
| Recorded data leaks paths or identities | Sanitized fields only; path-leak scan; owner review |
| Scope creep into a public MCP or demo API | Hard non-goals; forbidden-scope list; security review |
| Supply-chain exposure | Zero dependencies; no CDN, fonts or embeds |
| Preview/prod publishes unreviewed content | Manual deploy only; no auto-deploy; owner approval |
| Design pack restoration disturbs validation | Separate T1 PR; re-run `validate_project_profile.py` |
| Licensing/attribution gaps | Apache-2.0 notice, Relate attribution and non-endorsement text; media original or licensed |
| Cloudflare product guidance changes | Re-verify docs at T4 (D2) |

## 10. Owner decisions required

- **D1** Approve beginning UI work and enabling `design=true`, `platforms=["web"]`.
- **D2** Choose Cloudflare Pages versus Workers static assets after re-checking current guidance.
- **D3** Confirm manual Direct Upload only, no Git-connected auto-deploy or preview automation.
- **D4** Approve the provenance-label model and the "no `LIVE`" rule.
- **D5** Approve the outbound link allowlist and the wording for the video slot.
- **D6** Decide whether site checks join the `npm test`/validation contract (changes `config/validation-contract.json`).
- **D7** Provide Cloudflare account/project name and DNS intent when T4 is approved (never share secrets in chat).
- **D8** Confirm the site is in hackathon scope and does not alter the Devpost submission gates in `docs/HACKATHON.md`.
