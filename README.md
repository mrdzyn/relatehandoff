# RelateHandoff

**One context. Every agent.**

RelateHandoff is an implemented **local-first** agent handoff and evidence graph. An authorized recorder writes structured provenance into a durable local Relate directory store; compatible agents inspect bounded graph context through **read-only MCP** (`relate serve --mcp stdio --read-only`). Git, canonical repository files, and executed tests remain authoritative. The graph cannot approve merges or make unsigned evidence authentic.

**Status:** **LOCAL-ONLY FOR NOW.** `RH-P1`–`RH-P4` planning and `RH-LOCAL-T1` (`doctor`), `RH-LOCAL-T2A` (deterministic safe `resume` JSON/Markdown output), and `RH-LOCAL-T2B` (`list` & immutable `[:SUPERSEDES]` handoff lifecycle) are merged on `main`. Hosted `RH-P5` (`cloud/`, remote MCP, OAuth) remains **ON HOLD**. See [status](docs/STATUS.md), [local-only roadmap](docs/LOCAL-ONLY-ROADMAP.md), [onboarding & distribution](docs/ONBOARDING-AND-DISTRIBUTION.md), [architecture](docs/ARCHITECTURE.md), and [judge walkthrough](docs/JUDGE-WALKTHROUGH.md). No package publishing, release, or Devpost submission is authorized.

## How Relate is used

- **Mode:** A persistent local **directory store** (`examples/example-store/` is the committed synthetic fixture). Directory persistence lets the validated recorder write a handoff and a later agent resume from the same graph after a process restart.
- **Connected graph:** `Repository -> Task <- Handoff -> Commit`, with linked `Agent`, `Evidence`, `Artifact`, `Decision`, and immutable `[:SUPERSEDES]` edges. Bounded, parameterized Cypher (`MAX_DETAIL_ROWS = 100`) lets an agent traverse provenance instead of searching unstructured transcripts.
- **Why Relate:** An embedded local graph provides relationships and provenance through real read-only MCP, without provisioning a cloud server or making the graph authoritative over Git or live verification.
- **Safety:** A controlled writer (`record`) handles validation, repo/HEAD binding, secret/path rejection, and immutable provenance; readers (`resume`, `list`, external MCP hosts) use `relate serve --mcp stdio --read-only`. External long-lived MCP readers may hold a stale open-time snapshot; restart those processes after external writes. The `resume` and `list` CLI commands start a fresh short-lived read-only MCP process per invocation.

## Pinned baseline & quickstart

**Pinned project baseline:** Node.js **24 LTS** (minimum `>= 20`, tested on `24 LTS` / `26.7.0`), Python **3.11+**, Git **2.30+**, separate **Relate CLI v1.0.1**, and npm `@relate/relate@1.0.1` (see `package-lock.json`). The Relate CLI is **not** installed by `npm ci`. Get the pinned executable from [official v1.0.1 release artifacts](https://github.com/relatedb/relate/releases/tag/v1.0.1) and follow [official installation/verification guidance](https://relatedb.ai/docs/get-started/install/). Check `relate --version` rather than mixing untested versions. If `relate` is installed outside `PATH`, set `RELATE_BIN` to its absolute path (or pass `--relate-bin` to `doctor`).

On a fresh macOS ARM64 or compatible Linux x86_64 checkout:

```bash
git clone https://github.com/mrdzyn/relatehandoff.git
cd relatehandoff
npm ci
node src/cli.mjs doctor --repo . --store examples/example-store
npm run build
npm run test:security
RELATE_REQUIRE_CLI=1 npm test
npm run demo
node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1 --format markdown
node src/cli.mjs list --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --format markdown
```

**Expected behavior:**
- `doctor` runs read-only diagnostics on Node.js, `PATH`, Git CLI, repository cleanliness/identity, Relate CLI `v1.0.1`, and `examples/example-store` (`initialize` + `tools/list` read-only MCP probe) without mutating Git or the store.
- `npm run demo` executes real Relate with a temporary synthetic repository and store, demonstrating `CURRENT`/`UNVERIFIED` unsigned store evidence, explicit `--verify` yielding `AUTHENTICATED`/`VERIFIED`, changed-HEAD `STALE`, self-asserted/missing evidence `UNVERIFIED`, failed evidence `BLOCKED`, and read-only MCP write refusals.
- `resume` and `list` against `examples/example-store/` inspect the committed synthetic fixture without regeneration (reporting `STALE`/`SELF_ASSERTED` at a newer `HEAD`, as expected). Never present the synthetic fixture as authenticated real-world evidence.

## Shipped CLI commands

All commands run strictly offline against a local Git checkout and local Relate directory store:

| Command | Purpose | Key flags |
|---|---|---|
| `doctor` | Read-only environment, CLI, Git, and store diagnostics | `--repo <dir>`, `--store <dir>`, `--relate-bin <path>`, `--json`, `--strict` |
| `record` | Validate & record an immutable handoff (and optional `[:SUPERSEDES]` edge) | `--store <dir>`, `--repo <dir>`, `--input <file>`, `--repo-id <owner/repo>`, `--verify <profile>`, `--supersedes <handoffId>`, `--supersession-reason <text>` |
| `resume` | Query latest `ACTIVE` (or `--handoff`) context over read-only MCP | `--store <dir>`, `--repo <dir>`, `--task <taskId>`, `--handoff <handoffId>`, `--repo-id <owner/repo>`, `--verify <profile>`, `--format json\|markdown` |
| `list` | List/filter handoffs for a repository over read-only MCP (100-row cap) | `--store <dir>`, `--repo <dir>`, `--task <taskId>`, `--repo-id <owner/repo>`, `--status active\|superseded\|all`, `--branch <name>`, `--agent <name>`, `--limit <1..100>`, `--format json\|markdown` |

Supported `--verify <profile>` allowlist (`src/attestation.mjs`, requires a clean Git worktree): `node-test-suite`, `relatehandoff-tests`, `relatehandoff-build`, `relatehandoff-security`.

## Copy-paste multi-agent workflows

The self-contained example below uses a temporary synthetic repository and store in `/tmp` so you can copy-paste every step safely without touching `relatehandoff`'s own Git history:

### 1. Initialize a clean scratch workspace and record a verified handoff (`Agent A`)

```bash
WORK_ROOT="$(mktemp -d /tmp/rh-workflow.XXXXXX)"
REPO_DIR="$WORK_ROOT/repo"
STORE_DIR="$WORK_ROOT/store"
mkdir -p "$REPO_DIR"
git -C "$REPO_DIR" init -b main
git -C "$REPO_DIR" config user.name "Workflow Demo"
git -C "$REPO_DIR" config user.email "workflow@example.invalid"
git -C "$REPO_DIR" config relatehandoff.repository "mrdzyn/relatehandoff-workflow"
printf 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("ok", () => assert.equal(1 + 1, 2));\n' > "$REPO_DIR/smoke.test.mjs"
git -C "$REPO_DIR" add smoke.test.mjs
git -C "$REPO_DIR" commit -m "chore: initial commit"

HEAD_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"
BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"

cat > "$WORK_ROOT/handoff-1.json" <<EOF
{
  "schemaVersion": "1.0.0",
  "handoffId": "WF-H-1",
  "taskId": "WF-TASK-1",
  "repository": "mrdzyn/relatehandoff-workflow",
  "branch": "$BRANCH",
  "sourceAgent": "codex-writer",
  "targetAgent": "claude-reviewer",
  "headSha": "$HEAD_SHA",
  "summary": "Initial smoke test implemented and verified on clean HEAD.",
  "nextAction": "Review smoke.test.mjs and verify local HEAD freshness.",
  "decisions": [{ "id": "DEC-1", "summary": "Keep consumer reads strictly read-only over MCP." }],
  "artifacts": ["smoke.test.mjs"],
  "evidence": [],
  "createdAt": "2026-11-23T12:00:00Z"
}
EOF

node src/cli.mjs doctor --repo "$REPO_DIR" --store "$STORE_DIR" || true
node src/cli.mjs record --store "$STORE_DIR" --repo "$REPO_DIR" --input "$WORK_ROOT/handoff-1.json" --verify node-test-suite
```

### 2. Resume and verify as the next agent (`Agent B`)

```bash
# Safe Markdown summary for agent/human review (read-only MCP; unsigned local store -> UNVERIFIED)
node src/cli.mjs resume --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --format markdown

# Deterministic JSON + in-process re-verification on clean matching HEAD -> VERIFIED / AUTHENTICATED
node src/cli.mjs resume --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --verify node-test-suite --format json
```

### 3. List handoffs and supersede an earlier handoff without mutating history

```bash
# List active handoffs filtered by task, branch, or agent
node src/cli.mjs list --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --status active --branch "$BRANCH" --agent codex-writer --limit 20 --format markdown

# Record a superseding handoff (WF-H-2 -> [:SUPERSEDES] -> WF-H-1); WF-H-1 stays immutable
cat > "$WORK_ROOT/handoff-2.json" <<EOF
{
  "schemaVersion": "1.0.0",
  "handoffId": "WF-H-2",
  "taskId": "WF-TASK-1",
  "repository": "mrdzyn/relatehandoff-workflow",
  "branch": "$BRANCH",
  "sourceAgent": "claude-reviewer",
  "targetAgent": "gemini-auditor",
  "headSha": "$HEAD_SHA",
  "summary": "Reviewed smoke.test.mjs and added follow-up handoff context.",
  "nextAction": "Audit WF-H-2 and inspect historical WF-H-1 provenance if needed.",
  "decisions": [{ "id": "DEC-2", "summary": "Supersede WF-H-1 via immutable [:SUPERSEDES] edge." }],
  "artifacts": ["smoke.test.mjs"],
  "evidence": [],
  "createdAt": "2026-11-23T12:05:00Z"
}
EOF

node src/cli.mjs record --store "$STORE_DIR" --repo "$REPO_DIR" --input "$WORK_ROOT/handoff-2.json" --verify node-test-suite --supersedes WF-H-1 --supersession-reason "Reviewer follow-up handoff"

# List all (active + superseded) and inspect either the active default or historical WF-H-1
node src/cli.mjs list --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --status all --format markdown
node src/cli.mjs resume --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --format markdown
node src/cli.mjs resume --store "$STORE_DIR" --repo "$REPO_DIR" --task WF-TASK-1 --handoff WF-H-1 --format markdown

# Clean up the temporary scratch workspace when finished
rm -rf "$WORK_ROOT"
```

## Linux `GLIBC_2.36` vs `GLIBC_2.39` & offline reproducibility

- **Linux GLIBC compatibility:** The prebuilt Relate `v1.0.1` Linux x86_64 binary requires `GLIBC_2.39` and fails on older distributions such as Debian 12 (`GLIBC_2.36`). `node src/cli.mjs doctor` detects this mismatch and reports `FAIL` with remediation. On `GLIBC_2.36` hosts, keep system `glibc` untouched and build the pinned `v1.0.1` CLI from source with Rust/Cargo:
  ```bash
  cargo install --git https://github.com/relatedb/relate --tag v1.0.1 relate-cli
  relate --version
  ```
  Note: `@relate/relate@1.0.1` (Node.js) and `relate-db@1.0.1` (Python `manylinux2014`) work on `GLIBC_2.36`. See [onboarding & distribution](docs/ONBOARDING-AND-DISTRIBUTION.md) and [spike](docs/RELATE-SPIKE.md) for platform status (`UNVERIFIED` for native Windows/WSL2 and native Linux runs on the current macOS host).
- **Offline clean-clone reproducibility:** When cloning locally without network access (`git clone --local`), Git sets `origin` to the local filesystem path instead of `mrdzyn/relatehandoff`, which fails canonical `owner/repo` identity checks in `doctor`, `resume`, and `RH-P1 regression (B1)`. Point `origin` to the canonical identifier offline before running validation:
  ```bash
  TMP_CLONE="$(mktemp -d /tmp/rh-offline.XXXXXX)"
  git clone --local . "$TMP_CLONE/repo"
  cd "$TMP_CLONE/repo"
  git remote set-url origin https://github.com/mrdzyn/relatehandoff.git
  npm ci --offline   # requires populated local npm cache; otherwise copy node_modules offline
  node src/cli.mjs doctor --repo . --store examples/example-store
  node src/cli.mjs resume --store examples/example-store --repo . --repo-id mrdzyn/relatehandoff --task RH-P1 --format markdown
  RELATE_REQUIRE_CLI=1 npm test
  rm -rf "$TMP_CLONE"
  ```
- **Persistent MCP snapshot limit:** Long-lived external `relate serve --mcp stdio --read-only` servers retain an open-time snapshot; restart them after external writer updates. `relatehandoff resume` and `relatehandoff list` automatically spawn fresh short-lived read-only servers.

## Canonical exact-HEAD validation

For repository development, follow [AGENTS.md](AGENTS.md), then [docs/STATUS.md](docs/STATUS.md), [config/project-profile.json](config/project-profile.json), and the active task contract. The retained [agent orchestration guide](docs/AGENT-ORCHESTRATION.md) defines one-primary-agent execution, bounded specialist work, and exact-HEAD audit responsibilities.

```bash
git diff --check origin/main...HEAD
python3 scripts/test_bootstrap.py
python3 scripts/test_entrypoints.py
python3 scripts/check_secret_tracking.py
python3 scripts/validate_project_profile.py --repository mrdzyn/relatehandoff
python3 scripts/validate.py --repository mrdzyn/relatehandoff
```

Run in a clean checkout of the **exact PR HEAD** and report real CLI availability, host, test counts, and exit codes. `validate.py` executes the project's mandatory Node test/build/security contract; fake or skipped MCP tests cannot satisfy it. See [testing](docs/TESTING.md) and [local-first CI](docs/MANUAL-CI.md).

## Origin, attribution and use

This repository uses the experimental Apache-2.0 [Relate engine](https://github.com/relatedb/relate). Its project scaffold came from [mrdzyn/ai-native-project-template](https://github.com/mrdzyn/ai-native-project-template), and its concept was informed by [jexp/relate-ideas](https://github.com/jexp/relate-ideas) (CC-BY-4.0 conceptual inspiration; no code or content copied). It is an independent [Relate hackathon](https://relate.devpost.com/) project, not endorsed by Neo4j.

**License & distribution gate:** RelateHandoff original code is licensed under **Apache-2.0** following owner approval and merged [PR #8](https://github.com/mrdzyn/relatehandoff/pull/8). See [LICENSE](LICENSE), [NOTICE](NOTICE), [third-party attribution](docs/RH-P3-THIRD-PARTY-ATTRIBUTION.md), and [onboarding & distribution](docs/ONBOARDING-AND-DISTRIBUTION.md). **Do not publish packages, release artifacts, or bundled binaries without explicit owner approval.** Do not include secrets, private transcripts, customer data, or live project stores in public examples or judge videos. No hosted service, telemetry, payments, autonomous merge, deployment, or product release is included. See [video capture plan](docs/RH-P3-DEMO-CAPTURE.md).
