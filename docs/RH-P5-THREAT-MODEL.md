# RH-P5 — OAuth, Ingestion and Isolation Threat Model (planning)

**State:** Design-time review of [the platform plan](RH-P5-PLATFORM-PLAN.md) and [D1 schema](RH-P5-D1-SCHEMA.md); no code exists. It reviews a design and must be redone against the implementation at RH-P5-T7. Normative references: MCP authorization specification (2025-06-18), OAuth 2.1 draft security considerations, RFC 9728/8414/8707/7591, `docs/SECURITY.md`.

## 1. Assets, actors, trust boundaries
- **Assets:** per-project handoff context and evidence labels; the honesty of freshness/authenticity statuses; the owner's GitHub identity and Cloudflare account; OAuth tokens and publisher keys; Git (authoritative, outside the platform).
- **Actors:** owner; reader clients (ChatGPT, Claude, Codex, Grok); publishers (local/cloud agents, CI); a malicious or compromised agent or publisher; a malicious web page/MCP client; network attacker; another project's content (including attacker-written text); a Cloudflare/platform misconfiguration.
- **Boundaries:** (1) reader ⇄ gateway, (2) publisher ⇄ ingest, (3) owner browser ⇄ auth/consent, (4) Workers ⇄ `rh-data`, (5) `rh-data` ⇄ D1/KV, (6) agent ⇄ returned text (prompt-injection boundary), (7) local Relate store ⇄ cloud digest.

## 2. Threats and required controls

### A. OAuth and reader access
| # | Threat | Controls | Test |
|---|---|---|---|
| A1 | Token for another resource accepted (audience confusion, token passthrough) | Verify `aud`/`resource` = gateway canonical URI on every request; reject tokens issued for ingest, auth or other servers; never forward the inbound token or the GitHub login token | wrong-aud/iss/resource corpus |
| A2 | Confused deputy via static upstream client and dynamic clients | Own issued tokens only; per-client explicit owner consent; consent page shows client label, redirect, requested projects; GitHub scopes limited to identity | consent-bypass tests |
| A3 | Authorization-code interception/injection | PKCE S256 mandatory; single-use short-lived codes; code bound to client, redirect URI and `resource` | replay and verifier-mismatch tests |
| A4 | Open redirect / redirect-URI substitution | Exact-match registered redirect URIs; HTTPS or loopback only; allowlist ChatGPT's documented redirects; `state` verified | redirect fuzzing |
| A5 | CSRF/clickjacking on consent | CSRF token and `SameSite` session cookie on the consent page; `frame-ancestors 'none'`; re-auth for connection approval | UI security tests |
| A6 | DCR abuse (client flooding, malicious metadata, SSRF through CIMD fetch) | Rate limits and caps on registrations; owner approval before any client is usable; CIMD fetch restricted to public hosts (`global_fetch_strictly_public`), size/time limits; no auto-approved clients | flood and SSRF tests |
| A7 | Token theft/replay | Short-lived access tokens, refresh rotation with reuse detection, hashed storage (library), no tokens in URLs/logs, revocation checked live against `oauth_connections` | rotation-reuse test; log scan |
| A8 | Over-broad grants / privilege creep | Scope `projects:read` only; project allowlist per connection in D1; no wildcard "all projects"; new project is not auto-granted to existing connections | grant-matrix tests |
| A9 | Owner account takeover (GitHub identity) | Numeric-id allowlist, GitHub 2FA is an owner prerequisite, re-authentication for new connections and grant changes, alerts on new connections | owner-side runbook |
| A10 | Revocation lag | Gateway checks grant and connection state per request; no long-lived authorization cache | mid-session revoke test |
| A11 | DNS rebinding / cross-origin abuse of Streamable HTTP | Validate `Origin`, deny-by-default CORS, no cookies on the MCP endpoint, bearer header only | origin tests |
| A12 | Impersonating ChatGPT | Optional OpenAI client-certificate (mTLS) validation and egress allowlist **[verify]**; OAuth remains the authorization control | staging check |

### B. Ingestion and synchronization
| # | Threat | Controls | Test |
|---|---|---|---|
| B1 | Unauthenticated or public write | Separate hostname/Worker, signed requests only, no anonymous route, no write MCP tool | route inventory test |
| B2 | Publisher key theft (cloud agent environment) | One project per key; publish-only; no read; rate limits and row caps; expiry and rotation; instant revoke; audit on every use | key-scope tests |
| B3 | Replay or tampered request | Signature over method+path+timestamp+nonce+body hash; skew window; nonce store | replay/tamper tests |
| B4 | Cross-project write (payload names another repo) | Payload `repository` must equal the publisher's project repo; `403` and audit; nothing written | cross-project ingest negatives |
| B5 | False evidence promotion | Reject client-supplied `executionMode≠SELF_ASSERTED`, `validationProfile`, `exitCode`, `attestationSha256`; schema `CHECK`s allow only the unsigned class; gateway caps authenticity at `UNVERIFIED` | trust-ceiling tests |
| B6 | History rewriting / silent overwrite | Immutable handoffs, `409` on same key with different hash, supersede instead of edit, retraction audited | conflict tests |
| B7 | Secret or private data leakage into the index | Local-validator secret patterns and sensitive-artifact rules at both ends, digest-only fields, canary-secret tests, no file contents/transcripts accepted | canary tests |
| B8 | Stale or forged "current" claims | `CURRENT` only on SHA equality with a caller-supplied or trusted observed head; force-push shown as changed head; unknown basis ⇒ `UNVERIFIED` | freshness matrix |
| B9 | Resource exhaustion / cost abuse | Body, row and rate caps; bounded queries per invocation; D1 limits respected; alerts and kill switch | load/limit tests |
| B10 | Partial writes | Single atomic `db.batch()`; unique `(project_id, server_seq)` | fault-injection test |
| B11 | Compromised publisher poisons context with false but well-formed handoffs | Cannot be eliminated by the cloud: output is labeled `UNSIGNED_CLOUD_INGESTED`/`UNVERIFIED`, never `VERIFIED`; readers must re-verify locally at their own HEAD | documented residual risk |

### C. Isolation
| # | Threat | Controls | Test |
|---|---|---|---|
| C1 | Cross-project read via tool argument tampering | Slug resolves through grants only; uniform `NOT_FOUND`; no multi-project tool | isolation suite §7 items 1–2 |
| C2 | IDOR / key collision across projects | Opaque random ids, composite `(tenant_id, project_id)` keys and FKs, per-project unique handoff keys | items 2, 9 |
| C3 | Cursor or pagination crossing projects | Signed, project-bound cursors | item 5 |
| C4 | Missing scope filter in a new query | `ProjectScope` required by type, parameterized-only static test, review checklist, DAL is the only SQL location | item 8 |
| C5 | Slug/Unicode normalization confusion, rename/transfer | Restricted slug alphabet; immutable repo id; mismatch fails closed | items 6–7 |
| C6 | Cross-tenant leakage later | Tenant id in every key; synthetic second-tenant fixture in CI; option of DB-per-tenant | item 11 |
| C7 | Error/timing oracle revealing other projects | Uniform denial; no differentiating messages | item 1 |
| C8 | Shared cache poisoning | No cross-project cache; per-request lookups | cache test |

### D. Agent-facing risks
| # | Threat | Controls | Test |
|---|---|---|---|
| D1 | **Stored prompt injection:** a handoff summary in project A tells a reader agent to take an action | All free text returned as inert, labeled-untrusted data; control characters stripped; length-bounded; advisory string; no tool returns "commands to run"; no tool can act on other systems; per-project scope limits blast radius to the same project | injection corpus |
| D2 | Tool poisoning via tool descriptions | Static, reviewed, snapshot-tested `tools/list`; no dynamic descriptions from data | snapshot test |
| D3 | Automation over-trust (merge/deploy on cloud "PASS") | Status text states the platform authorizes nothing; no merge/deploy tool; statuses never `VERIFIED`; docs and provenance block repeat this | contract tests |
| D4 | Reader writes through side channels | Gateway has no D1 write path and no ingestion credentials | static + binding test |

### E. Platform and operations
| # | Threat | Controls |
|---|---|---|
| E1 | Secret exposure (OAuth signing keys, Worker secrets) | Workers secrets only; never in repo/chat/CI logs; owner-held; rotation runbook |
| E2 | Over-privileged Cloudflare API token | Least-privilege scoped tokens; no agent holds production credentials |
| E3 | Supply chain | Minimal pinned dependencies, lockfile, review of the OAuth/MCP libraries and their versions, no CDN/runtime code loading |
| E4 | Logging leaks | Redaction by construction; log-scan test; retention policy |
| E5 | Migration or schema drift | Version check fails closed; staged rollout; PITR rehearsal |
| E6 | Misconfiguration exposing a Worker route | Route inventory, `workers_dev` off for production, separate staging, config reviewed in PR |
| E7 | Availability / vendor lock | Local-first design keeps Git and local stores fully functional without the platform |

## 3. Residual risks (accepted only with owner sign-off)
- A compromised publisher can place misleading but well-formed context for its own project; mitigated by labels and local re-verification, not eliminated. Cryptographic evidence attestation is future work outside this plan.
- ChatGPT, Claude, Codex and Grok each implement MCP/OAuth differently; behavior differences are discovered in T6, not assumed.
- D1 has no per-binding read-only permission and no row-level security; isolation rests on the data Worker, scoped DAL and tests.
- Cloudflare processes request metadata; there is a hosting-provider trust dependency.

## 4. Gates
1. Owner answers D0–D14. 2. Independent COMMENT-only audit of this plan. 3. Each implementation phase repeats the relevant rows above against code. 4. T7 independent security review before any production connection. 5. Production enablement is a separate explicit owner approval; no agent connects production infrastructure.
