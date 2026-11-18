# RelateHandoff

**One context. Every agent.**

RelateHandoff is an implemented local-first agent handoff and evidence graph. An authorized recorder writes structured provenance into a durable Relate store; other compatible agents read bounded graph context through **read-only MCP**. Git, canonical repository files, and executed tests remain authoritative. The graph cannot approve merges or make unsigned evidence authentic.

**Status:** RH-P1 and RH-P2 are merged; RH-P3 is judge-readiness preparation. See [status](docs/STATUS.md), [architecture](docs/ARCHITECTURE.md), [RH-P3 plan](docs/RH-P3-PLAN.md), and the [walkthrough](docs/JUDGE-WALKTHROUGH.md). No product release or Devpost submission is authorized.

## Reproducible judge quickstart

**Pinned project baseline:** Node.js **24 LTS**, Python **3.11+**, Git **2.30+**, separate **Relate CLI v1.0.1**, and npm `@relate/relate@1.0.1` (see `package-lock.json`). The CLI is **not** installed by `npm ci`. Get the pinned executable from [official v1.0.1 release artifacts](https://github.com/relatedb/relate/releases/tag/v1.0.1) and follow [official signature/checksum verification guidance](https://relatedb.ai/docs/get-started/install/). The convenience installer selects the **latest** release, not necessarily v1.0.1; check `relate --version` instead of mixing untested versions. If already installed outside PATH, set `RELATE_BIN` to its absolute path.

On a fresh macOS ARM64 or compatible Linux x86_64 checkout:

```bash
git clone https://github.com/mrdzyn/relatehandoff.git
cd relatehandoff
node --version
python3 --version
relate --version
npm ci
npm run build
npm run test:security
RELATE_REQUIRE_CLI=1 npm test
npm run demo
node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1
```

**Expected behavior:** `npm run demo` executes real Relate with a temporary synthetic repository and store. It demonstrates a recorded handoff and connected provenance, `CURRENT` metadata but `UNVERIFIED` unsigned proof, explicit `--verify` giving `AUTHENTICATED`/`VERIFIED`, changed-HEAD `STALE`, missing/self-asserted evidence `UNVERIFIED`, failed evidence `BLOCKED`, and write refusal through read-only MCP. Do not claim any PASS that a local command did not actually produce.

The final `resume` reads the committed, sanitized `examples/example-store/` **without regeneration**. An earlier owner-side real-CLI run returned `RH-P1-EXAMPLE-1`, tools `read_cypher`/`get_schema`, and expected `STALE`/`SELF_ASSERTED` for a synthetic handoff at a different Git HEAD. Verify fresh output on your own checkout, and do not present the fixture as authenticated real-world evidence.

### Linux GLIBC compatibility

The prebuilt Relate v1.0.1 Linux amd64 CLI was observed to require `GLIBC_2.39`, failing on Debian 12 (`GLIBC_2.36`). A source-built v1.0.1 CLI was separately reported working there. On older glibc, use the pinned upstream source and Rust/Cargo rather than replacing system glibc or introducing a fake:

```bash
cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli
relate --version
```

Report actual compatibility for each test host; this project has not validated native Windows/WSL2 judge execution. See [spike](docs/RELATE-SPIKE.md). The external long-lived `relate serve --mcp stdio --read-only` server can retain an open-time snapshot: **restart it after external writer updates**. The RelateHandoff `resume` command uses a fresh, short-lived read-only server.

## Canonical exact-HEAD validation

```bash
git diff --check origin/main...HEAD
python3 scripts/test_bootstrap.py
python3 scripts/test_entrypoints.py
python3 scripts/check_secret_tracking.py
python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff
python3 scripts/validate.py --repository mrdzyn/relatehandoff
```

Run in a clean checkout of the **exact PR HEAD** and report real CLI availability, host, test counts and exit codes. `validate.py` executes the project's mandatory Node test/build/security contract; fake or skipped MCP tests cannot satisfy it. See [testing](docs/TESTING.md) and [local-first CI](docs/MANUAL-CI.md).

## Origin, attribution and use

This repository uses the experimental Apache-2.0 [Relate engine](https://github.com/relatedb/relate). Its project scaffold came from [mrdzyn/ai-native-project-template](https://github.com/mrdzyn/ai-native-project-template), and its concept was informed by [jexp/relate-ideas](https://github.com/jexp/relate-ideas) (CC-BY-4.0 conceptual inspiration; no code or content copied). It is an independent [Relate hackathon](https://relate.devpost.com/) project, not endorsed by Neo4j.

**The RelateHandoff project's own source license has NOT been chosen.** Public visibility alone is not permission to redistribute its original code. Do not include secrets, private transcripts, customer data, or live project stores in public examples or judge videos. No hosted service, telemetry, payments, autonomous merge, deployment, or product release is included. See [video capture plan](docs/RH-P3-DEMO-CAPTURE.md).
