# RH-P1 — Persistent Relate Handoffs and Evidence Freshness MVP

- **Status:** Draft / not authorized for implementation until P0 owner review
- **Owner/orchestrator:** mrdzyn
- **Implementation agent:** Unassigned
- **Target branch:** `main` after owner-approved P0 merge
- **Working branch:** `phase-1/relate-handoff-mvp` (proposed)

## Objective
Two separate agent sessions can exchange a validated, persistent Relate-backed task handoff through read-only MCP, and stale exact-Git-HEAD evidence is detected.

## Context
Project concept and boundaries are in `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`. A bootstrap-only repository does not demonstrate Relate usage. This task creates the minimum actual working engine needed for the hackathon.

## Delivery mode / UI design gate
- **Material user-facing UI:** No; initial CLI and MCP only
- **UI design gate:** Not applicable
- **Requirements/product contract:** `docs/PRODUCT.md`
- **Screen map / designs:** Not applicable
- **Wiring scope:** local Git metadata, handoff validation, Relate persistence, MCP read-only retrieval
- **Test scope:** deterministic unit checks + actual local Relate process integration (no mock-only completion)

## Agent context and delegation
- **Primary write owner:** one implementation agent
- **Subagents:** none by default; use disjoint specialists only when justified
- **Context budget:** focused
- **Usage evidence:** actual usage if available; otherwise NOT AVAILABLE

## Test objective / validation budget
Prove a valid handoff survives process restart and is consumed by an independent client via the actual Relate MCP surface. Prove mismatched, missing, or dirty checkout evidence is NOT reported ready.
- **Minimum automated evidence:** graph creation and persistence/reopen; parameterized Cypher provenance traversal; read-only MCP refuses writes; SHA-A → SHA-B stale test; malformed payload and path-traversal negative cases; deterministic re-run.
- **Manual QA:** Codex writes a sanitized example; Claude/Gemini or a second MCP test client retrieves and explains the next action; capture screen-share evidence.
- **Escalation:** race conditions, cross-process storage locking, data leakage, or incorrect PASS triggers broader tests.
- **Required gates:** inherited exact-HEAD `scripts/validate.py` + stack test/build/security; independent review; owner approval; configured GitHub rules remain binding.

## Allowed scope
- Product source/test files and package manifests created by this task
- Schema, sanitized example graph, MCP config/example, README setup, phase-specific docs
- Stack-specific validation-contract entries and appropriate optional CI

## Forbidden scope
- Automatic merges/approvals, deployment, billing or hosted user accounts
- Committing real conversation transcripts or private repository content
- Arbitrary agent shell execution, writable MCP access exposed by default
- Replacing GitHub truth with unverified graph claims
- Material browser UI before design-first approval

## Acceptance criteria
- [ ] Pin and document a working Relate version/CLI invocation and local installation across supported demo OS.
- [ ] Relate is actually executed and persists a graph with typed multi-hop relationships.
- [ ] Commit a synthetic persistent example store or documented reproducible creation with inspectable persisted data.
- [ ] Record one schema-validated, provenance-tagged handoff against an exact full Git SHA.
- [ ] Retrieve the handoff in a fresh process via *read-only* MCP; write attempt is refused.
- [ ] SHA changed, missing SHA, missing test evidence, and unverified remote state report STALE/UNVERIFIED, never false PASS.
- [ ] Integrate security/privacy negative cases and targeted unit + real Relate integration tests.
- [ ] Provide a clone-and-run judge walkthrough, query examples and captured demo.
- [ ] No owner-approved scope silently removed, disabled or deferred; mocks identified as mocks.
- [ ] Independent exact-HEAD audit and separate human merge approval recorded.

## Risks / open decisions
- Relate is experimental; verify actual CLI, directory-store concurrency and Windows compatibility before final stack choice.
- License and redistribution requirements require explicit owner selection before distribution.
- Cross-device synchronization is deliberately not part of this local-first MVP.
- ChatGPT Work desktop MCP access is conditional on the actual host capabilities; demonstrate at least two verified client processes instead of claiming universal support.

## Deliverable
A Draft PR against `main` with real Relate integration, automated evidence, a sanitized persistent graph, README and short demo. No merge or production publication.
