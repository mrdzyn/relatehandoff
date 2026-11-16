# RelateHandoff — Judge Walkthrough (RH-P1)

This walkthrough demonstrates the complete RH-P1 local-first handoff and evidence freshness workflow using the real Relate `v1.0.1` engine (`@relate/relate@1.0.1` + `relate serve --mcp stdio --read-only`), with zero mocks and zero private data.

## Prerequisites

1. Node.js 18+ (`node --version`) and Git (`git --version`).
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Ensure a runnable `relate` `v1.0.1` CLI binary is available (`relate --version`):
   - macOS / Windows / Linux (`GLIBC >= 2.39`): `curl -sSfL https://relatedb.ai/install.sh | bash`
   - Linux (`GLIBC < 2.39`, e.g. Debian 12 `GLIBC 2.36`): build from source with Cargo (`cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli`) or set `RELATE_BIN` to the built binary.

## 1. Run the Self-Contained Demo

```bash
npm run demo
```

`scripts/demo.mjs` creates a temporary synthetic Git repository and a temporary Relate directory store, then executes all seven steps end-to-end:
1. Records `RH-P1-DEMO-1` with provenance at `SHA-A` via a separate writer process (`src/cli.mjs record`).
2. Retrieves the handoff and multi-hop provenance (`Repository -> Task <- Handoff -> Commit`, `Evidence`, `Artifact`, `Decision`, `Agent`) through `relate serve --mcp stdio --database <store> --read-only`.
3. Confirms `freshness.status: "VERIFIED"` at exact `SHA-A` (with `remoteStatus: "UNVERIFIED"` offline).
4. Advances Git `HEAD` to `SHA-B` and confirms `freshness.status: "STALE"` (`HEAD_SHA_MISMATCH`, `EVIDENCE_SHA_MISMATCH`).
5. Records `RH-P1-DEMO-2` without evidence and confirms `freshness.status: "UNVERIFIED"` (`MISSING_TEST_EVIDENCE`).
6. Records `RH-P1-DEMO-3` with failing evidence (`status: "FAIL"`) and confirms `freshness.status: "BLOCKED"` (`EVIDENCE_FAILED`).
7. Sends `CREATE` to `read_cypher` and calls `write_cypher` on the read-only MCP server, proving both are refused (`isError: true`).

### Captured Reproducible Output (`npm run demo`)

```json
{
  "relateCliVersion": "Relate v1.0.1",
  "step1_recordAtShaA": {
    "handoffId": "RH-P1-DEMO-1",
    "shaA": "476f613e6d761e506541fc7d3245ee81cdf5526d"
  },
  "step2_3_readOnlyMcpVerified": {
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
        "README.md"
      ],
      "decisions": [
        "DEC-1"
      ],
      "evidenceIds": [
        "EV-1:PASS"
      ]
    },
    "freshness": {
      "status": "VERIFIED",
      "reasons": [
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "476f613e6d761e506541fc7d3245ee81cdf5526d",
      "currentHeadSha": "476f613e6d761e506541fc7d3245ee81cdf5526d",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step4_shaBStaleDetection": {
    "shaB": "6c537bcdb8f7d814732dea775decf949808c10c1",
    "freshness": {
      "status": "STALE",
      "reasons": [
        "HEAD_SHA_MISMATCH: handoff=476f613e6d761e506541fc7d3245ee81cdf5526d current=6c537bcdb8f7d814732dea775decf949808c10c1",
        "EVIDENCE_SHA_MISMATCH:EV-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "476f613e6d761e506541fc7d3245ee81cdf5526d",
      "currentHeadSha": "6c537bcdb8f7d814732dea775decf949808c10c1",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step5_missingEvidenceUnverified": {
    "handoffId": "RH-P1-DEMO-2",
    "freshness": {
      "status": "UNVERIFIED",
      "reasons": [
        "MISSING_TEST_EVIDENCE",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "6c537bcdb8f7d814732dea775decf949808c10c1",
      "currentHeadSha": "6c537bcdb8f7d814732dea775decf949808c10c1",
      "isDirty": false,
      "remoteStatus": "UNVERIFIED"
    }
  },
  "step6_failedEvidenceBlocked": {
    "handoffId": "RH-P1-DEMO-3",
    "freshness": {
      "status": "BLOCKED",
      "reasons": [
        "EVIDENCE_FAILED:EV-FAIL-1",
        "REMOTE_PR_STATE_UNVERIFIED"
      ],
      "handoffSha": "6c537bcdb8f7d814732dea775decf949808c10c1",
      "currentHeadSha": "6c537bcdb8f7d814732dea775decf949808c10c1",
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

A sanitized persistent Relate directory store is committed at `examples/example-store/` (generated deterministically from `examples/synthetic_handoff.json` via `npm run generate:example`).

Query it directly via the RelateHandoff CLI (using read-only MCP):

```bash
node src/cli.mjs resume --store examples/example-store --repo . --task RH-P1
```

Or query it directly via `relate serve --mcp stdio`:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_cypher","arguments":{"statement":"MATCH (r:Repository)-[:OWNS_TASK]->(t:Task {id: $taskId})<-[:HANDOFF_FOR]-(h:Handoff)-[:TARGETS_HEAD]->(c:Commit) RETURN r.name AS repo, h.id AS handoffId, c.sha AS sha","parameters":{"taskId":"RH-P1"}}}}' \
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
