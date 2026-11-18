# RH-P4 — Security and Privacy Review (planning)

**State:** Pre-implementation review of the plan in `docs/RH-P4-SHOWCASE-PLAN.md`. It reviews a design, not code; no site exists. Follows `docs/SECURITY.md` and the project invariants in `AGENTS.md`.

## Assets and boundaries
- **Protected:** the local-first engine and its read-only MCP boundary; repository isolation; the honesty of evidence statuses; the owner's Cloudflare account and credentials; visitors' privacy.
- **Out of the showcase's trust boundary:** the engine, stores, MCP, Git. The site has no connection to any of them.
- **Data on the site:** public, sanitized, committed content only. Source of truth remains Git and canonical files.

## Threat review

| # | Threat | Assessment | Required control |
|---|---|---|---|
| T1 | Public exposure of MCP/Relate or a write path | Eliminated by design: no function, API, binding or server | Forbidden-scope list; check forbids `functions/`, `_worker.js`, `wrangler` bindings |
| T2 | Misleading evidence claims (diagram taken as live proof, fixture `PASS` taken as verified) | Highest product risk | Provenance labels, no `LIVE`, engine reason codes, Limits section, automated label checks |
| T3 | Leaked secrets, tokens, paths or private transcripts in recorded data | Medium | Sanitized fields only, path-leak and secret scans, owner review; never record a live project store |
| T4 | XSS or injection | Low: static, no user input, no reflected data; recorded JSON rendered as text (`textContent`), never as HTML | Strict CSP (`script-src 'self'`, no inline), `form-action 'none'`, no `innerHTML` |
| T5 | Clickjacking, MIME sniffing, referrer and capability leakage | Low | `frame-ancestors 'none'`, `nosniff`, `no-referrer`, restrictive Permissions-Policy |
| T6 | Supply chain (npm, CDN, fonts, embeds, analytics) | Eliminated by zero third-party code | No dependencies; check forbids external `src` and unlisted `href` |
| T7 | Credential exposure for Cloudflare | Medium if mishandled | Owner-run manual deploy; no token in repo, chat or CI; no agent holds credentials; least-privilege token if later automated (separate approval) |
| T8 | Accidental publication via preview deployments or Git auto-deploy | Medium | Manual Direct Upload only; D3 gate; previews are public so only approved content |
| T9 | Visitor tracking | Low | No cookies, storage, analytics or Web Analytics; disclose Cloudflare edge logs |
| T10 | Outbound-link abuse (`target=_blank`) | Low | `rel="noopener noreferrer"` and link allowlist |
| T11 | Defacement or takeover via DNS/account | Low/Medium, owner-side | Account 2FA and DNS control are owner responsibilities; no custom domain without decision |
| T12 | Licensing and attribution | Medium | Apache-2.0 for original code, Relate attribution and non-endorsement, original or licensed media only |
| T13 | Accessibility failure excluding judges | Medium | WCAG 2.2 AA targets, text equivalents, manual QA, design gate |

## Privacy posture
No personal data is collected, stored or transmitted by the page. Cloudflare as hosting provider processes standard request metadata (for example IP address) under its own terms; the page discloses this. No third-party requests are made. The recorded demo uses synthetic identifiers only.

## Residual risks
- Visitors may still over-read a static page; mitigated by labels, not eliminated.
- Cloudflare platform configuration and the owner's account security are outside repository control.
- CSP compatibility with any future script or font addition must be re-reviewed; any change that adds a network request, embed, form, analytics or backend requires a new security review and owner approval.

## Review gates before implementation and enablement
1. Owner answers D1–D8.
2. Independent COMMENT-only audit of the plan.
3. Design approval (T1) before any UI.
4. At T2/T3: static security checks pass, secret and path scans pass, exact-HEAD canonical validation with real Relate CLI recorded truthfully.
5. At T4: explicit owner approval to enable the Cloudflare site, manual deploy by the owner, post-deploy header verification (`curl -I`) recorded as owner-reported or independently reproduced.
