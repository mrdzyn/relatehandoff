# RelateHandoff — Judge Walkthrough (RH-P1)

This walkthrough demonstrates the complete RH-P1 local-first handoff and evidence freshness workflow using the real Relate `v1.0.1` engine (`@relate/relate@1.0.1` + `relate serve --mcp stdio --read-only`), with zero mocks and zero private data.

## Prerequisites (pinned project judge baseline)

1. Node.js **24 LTS**, Python **3.11+**, Git **2.30+**, real **Relate CLI v1.0.1**. Check `node --version`, `python3 --version`, `git --version`, and `relate --version` first.
2. Install project packages with `npm ci` (pinned `@relate/relate@1.0.1`). This does **not** install the separate Relate CLI. See [official v1.0.1 release artifacts](https://github.com/relatedb/relate/releases/tag/v1.0.1) and [signed-install guidance](https://relatedb.ai/docs/get-started/install/). The convenience installer selects the latest release; verify v1.0.1 rather than silently mixing versions.
3. Linux `GLIBC_2.36` (for example, Debian 12) cannot run the observed prebuilt v1.0.1 Linux amd64 CLI requiring `GLIBC_2.39`. A pinned Rust/Cargo source-build fallback is `cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli`; then verify the resulting version. Do not upgrade host glibc to bypass the constraint.
4. In a clean clone run `npm run build`, `npm run test:security`, `RELATE_REQUIRE_CLI=1 npm test`, and `npm run demo`. Missing CLI must fail closed, not become a mock PASS.

The committed `examples/example-store/` is synthetic. On a later Git HEAD, a read-only `resume` returning `STALE`/`SELF_ASSERTED` is expected, not a successful authentication of old test claims. A long-lived external MCP process must be restarted after another process writes new handoffs; `src/cli.mjs resume` starts fresh short-lived read-only sessions.


## 1. Run the Self-Contained Demo

```bash
npm run demo
```

`scripts/demo.mjs` creates a temporary synthetic Git repository and a temporary Relate directory store, then executes all seven steps end-to-end:
1. Records `RH-P1-DEMO-1` with provenance at `SHA-A` via a separate writer process (`src/cli.mjs record --verify node-test-suite`), executing an allowlisted local runner (`node --test`, `shell: false`) on a clean worktree and recording `RUNNER_RECORDED_UNSIGNED` with an unkeyed SHA-256 consistency checksum (not a cryptographic signing credential).
2. Retrieves the handoff and multi-hop provenance (`Repository -> Task <- Handoff -> Commit`, `Evidence`, `Artifact`, `Decision`, `Agent`) through `relate serve --mcp stdio --database <store> --read-only` **without** re-executing tests: confirms `metadataFreshness: "CURRENT"` at exact `SHA-A`, while `executionAuthenticity: "UNVERIFIED"` and `status: "UNVERIFIED"` (`UNSIGNED_LOCAL_STORE_EVIDENCE`), because an unsigned local graph store cannot cryptographically authenticate persisted execution claims on read alone.
3. Resumes via read-only MCP **with** explicit in-process allowlisted re-execution (`--verify node-test-suite`) on the clean `SHA-A` checkout, establishing `executionAuthenticity: "AUTHENTICATED"` and `status: "VERIFIED"` (`IN_PROCESS_VERIFICATION_PASSED:node-test-suite`) without altering the read-only MCP trust boundary.
4. Advances Git `HEAD` to `SHA-B` and confirms `freshness.status: "STALE"` (`metadataFreshness: "STALE"`, `HEAD_SHA_MISMATCH`, `EVIDENCE_SHA_MISMATCH`).
5. Records `RH-P1-DEMO-2A` with unauthenticated self-asserted `PASS` (`UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE`, `executionAuthenticity: "SELF_ASSERTED"`) and `RH-P1-DEMO-2B` without evidence (`MISSING_TEST_EVIDENCE`), confirming both yield `freshness.status: "UNVERIFIED"`.
6. Records `RH-P1-DEMO-3` with failing evidence (`status: "FAIL"`) and confirms `freshness.status: "BLOCKED"` (`EVIDENCE_FAILED`).
7. Sends `CREATE` to `read_cypher` and calls `write_cypher` on the read-only MCP server, proving both are refused (`isError: true`).

### Captured Reproducible Output (`npm run demo`)

```json
{
  "relateCliVersion": "Relate v1.0.1",
  "step1_recordAtShaA": {
    "handoffId": "RH-P1-DEMO-1",
    "shaA": "b0b60cbbc3d8c9595114f2c90510780694c79b63"
  },
  "step2_readOnlyUnsignedStore": {
    "mcpTools": [
      "read_cypher",
      "get_schema"
    ],
    "handoffId": "RH-P1-DEMO-1",
    "provenance": {
      "repository": "mrdzyn/relatehandoff-synthetic",
      "sourceAgent": "codex-writer",
      "targetAgent": "claude-reviewer",
      "artifacts": [
        "README.md",
        "smoke.test.mjs"
      ],
      "decisions": [
        "DEC-1"
      ],
      "evidenceIds": [
        "EV-RUNNER-1:PASS:RUNNER_RECORDED_UNSIGNED"
      ]
    },
    "freshness": {
      "status": "UNVERIFIED",
      "metadataFreshness": "CURRENT",
      "executionAuthenticity": "UNVERIFIED",
      "reasons": [
        "UNSIGNED_LOCAL_STORE_EVIDENCE:EV-RUNNER-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "b0b60cbbc3d8c9595114f2c90510780694c79b63",
      "currentHeadSha": "b0b60cbbc3d8c9595114f2c90510780694c79b63",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step3_inProcessVerified": {
    "verifyProfile": "node-test-suite",
    "freshness": {
      "status": "VERIFIED",
      "metadataFreshness": "CURRENT",
      "executionAuthenticity": "AUTHENTICATED",
      "reasons": [
        "UNSIGNED_LOCAL_STORE_EVIDENCE:EV-RUNNER-1",
        "IN_PROCESS_VERIFICATION_PASSED:node-test-suite",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "b0b60cbbc3d8c9595114f2c90510780694c79b63",
      "currentHeadSha": "b0b60cbbc3d8c9595114f2c90510780694c79b63",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step4_shaBStaleDetection": {
    "shaB": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
    "freshness": {
      "status": "STALE",
      "metadataFreshness": "STALE",
      "executionAuthenticity": "UNVERIFIED",
      "reasons": [
        "HEAD_SHA_MISMATCH: handoff=b0b60cbbc3d8c9595114f2c90510780694c79b63 current=01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
        "EVIDENCE_SHA_MISMATCH:EV-RUNNER-1",
        "UNSIGNED_LOCAL_STORE_EVIDENCE:EV-RUNNER-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "b0b60cbbc3d8c9595114f2c90510780694c79b63",
      "currentHeadSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step5a_selfAssertedPassUnverified": {
    "handoffId": "RH-P1-DEMO-2A",
    "freshness": {
      "status": "UNVERIFIED",
      "metadataFreshness": "CURRENT",
      "executionAuthenticity": "SELF_ASSERTED",
      "reasons": [
        "UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE:EV-SELF-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "currentHeadSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step5b_missingEvidenceUnverified": {
    "handoffId": "RH-P1-DEMO-2B",
    "freshness": {
      "status": "UNVERIFIED",
      "metadataFreshness": "UNVERIFIED",
      "executionAuthenticity": "MISSING",
      "reasons": [
        "MISSING_TEST_EVIDENCE",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "currentHeadSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step6_failedEvidenceBlocked": {
    "handoffId": "RH-P1-DEMO-3",
    "freshness": {
      "status": "BLOCKED",
      "metadataFreshness": "CURRENT",
      "executionAuthenticity": "FAILED",
      "reasons": [
        "EVIDENCE_FAILED:EV-FAIL-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "currentHeadSha": "01d91fcb7e7eb359bb5e4c5e17ae4ee916339757",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step7_mcpWriteRefusals": [
    {
      "id": 101,
      "isError": true,
      "message": "Only MATCH queries are allowed for read-query"
    },
    {
      "id": 102,
      "isError": true,
      "message": "unknown tool 'write_cypher'"
    }
  ]
}
```

## 2. Inspect the Committed Synthetic Example Store

A sanitized persistent Relate directory store is committed at `examples/example-store/` (including its WAL under `.gitattributes` binary protection, generated deterministically from `examples/synthetic_handoff.json` via `npm run generate:example`).

Query it directly via the RelateHandoff CLI (using read-only MCP):

```bash
node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1
```

Or query it directly via `relate serve --mcp stdio`:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_cypher","arguments":{"statement":"MATCH (r:Repository {name: $repo})-[:OWNS_TASK]->(t:Task {id: $taskId})<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit) RETURN r.name AS repo, h.id AS handoffId, c.sha AS sha","parameters":{"repo":"mrdzyn/relatehandoff","taskId":"RH-P1"}}}}' \
  | relate serve --mcp stdio --database examples/example-store --read-only 2>/dev/null
```

## 3. Run Full Validation

```bash
python3 scripts/test_bootstrap.py
python3 scripts/test_entrypoints.py
python3 scripts/check_secret_tracking.py
python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff
python3 scripts/validate.py --repository mrdzyn/relatehandoff
```
