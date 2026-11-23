import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isFullSha, normalizeRepositoryIdentity } from "./git.mjs";

const NODE_MIN_MAJOR = 20;
const NODE_RECOMMENDED_MAJOR = 24;
const EXPECTED_RELATE_VERSION = "1.0.1";
const CMD_TIMEOUT_MS = 5000;

const SECRET_REDACTION_PATTERNS = [
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/gi,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{10,}\b/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bAuthorization\s*:\s*[^\s,;]+(?:\s+[^\s,;]+)?/gi,
  /([?&](?:token|access_token|secret|password|passwd|api_key|apikey|key)=)[^&\s]+/gi,
];

/**
 * Redact common credential/token patterns and normalize whitespace from external/config strings.
 */
export function sanitizeDiagnosticText(text) {
  if (typeof text !== "string") return "";
  let out = text.trim();
  for (const re of SECRET_REDACTION_PATTERNS) {
    out = out.replace(re, (match, p1) => (typeof p1 === "string" && p1.includes("=") ? `${p1}[REDACTED]` : "[REDACTED]"));
  }
  return out.replace(/\s+/g, " ").slice(0, 280);
}

function defaultRunCmd(bin, args, opts = {}) {
  return spawnSync(bin, args, {
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeout ?? CMD_TIMEOUT_MS,
    killSignal: "SIGKILL",
    shell: false,
    stdio: [opts.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
  });
}

function hasNullByte(value) {
  return typeof value === "string" && value.includes("\0");
}

function checkNodeRuntime(nodeVersion) {
  const match = String(nodeVersion || "").match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return {
      id: "node-runtime",
      name: "Node.js runtime",
      status: "FAIL",
      summary: `Unrecognized Node.js version string: ${String(nodeVersion || "<empty>")}`,
      remediation: `Install Node.js >= ${NODE_RECOMMENDED_MAJOR} LTS (minimum >= ${NODE_MIN_MAJOR}).`,
    };
  }
  const major = Number(match[1]);
  if (major < NODE_MIN_MAJOR) {
    return {
      id: "node-runtime",
      name: "Node.js runtime",
      status: "FAIL",
      summary: `Node.js ${nodeVersion} is unsupported (minimum >= v${NODE_MIN_MAJOR}, recommended v${NODE_RECOMMENDED_MAJOR} LTS).`,
      remediation: `Upgrade Node.js to v${NODE_RECOMMENDED_MAJOR} LTS or newer.`,
    };
  }
  if (major < NODE_RECOMMENDED_MAJOR) {
    return {
      id: "node-runtime",
      name: "Node.js runtime",
      status: "WARN",
      summary: `Node.js ${nodeVersion} works, but v${NODE_RECOMMENDED_MAJOR} LTS is the pinned baseline.`,
      remediation: `Upgrade to Node.js v${NODE_RECOMMENDED_MAJOR} LTS for full baseline parity.`,
    };
  }
  return {
    id: "node-runtime",
    name: "Node.js runtime",
    status: "PASS",
    summary: `Node.js ${nodeVersion} meets the >= v${NODE_RECOMMENDED_MAJOR} LTS baseline.`,
  };
}

function checkEnvironmentSanity(env, platform) {
  const pathKey = platform === "win32" ? (env.Path !== undefined && env.PATH === undefined ? "Path" : "PATH") : "PATH";
  const pathVal = env[pathKey];
  if (typeof pathVal !== "string" || pathVal.trim().length === 0) {
    return {
      id: "env-path",
      name: "Environment PATH",
      status: "FAIL",
      summary: `${pathKey} is empty or unset; external tools (git, relate) cannot be discovered reliably.`,
      remediation: `Restore a valid ${pathKey} in your shell environment.`,
    };
  }
  if (hasNullByte(pathVal) || hasNullByte(env.RELATE_BIN)) {
    return {
      id: "env-path",
      name: "Environment PATH",
      status: "FAIL",
      summary: "Malformed environment variable contains a null byte.",
      remediation: "Fix malformed PATH or RELATE_BIN environment variables.",
    };
  }
  return {
    id: "env-path",
    name: "Environment PATH",
    status: "PASS",
    summary: `${pathKey} is configured (${pathVal.split(path.delimiter).filter(Boolean).length} entries).`,
  };
}

function checkGitAndRepo({ repoInput, env, runCmd, fsImpl }) {
  const gitVer = runCmd("git", ["--version"], { env });
  if (gitVer.error || gitVer.status !== 0) {
    const detail = sanitizeDiagnosticText(gitVer.stderr || gitVer.error?.message || `exit ${gitVer.status}`);
    return {
      gitCheck: {
        id: "git-cli",
        name: "Git CLI",
        status: "FAIL",
        summary: `Git executable is unavailable or failed (${detail}).`,
        remediation: "Install Git and ensure `git` is on PATH.",
      },
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "FAIL",
        summary: "Skipped repository inspection because Git CLI is unavailable.",
        remediation: "Install Git first, then re-run `relatehandoff doctor`.",
      },
      resolvedRepo: null,
    };
  }

  const gitCheck = {
    id: "git-cli",
    name: "Git CLI",
    status: "PASS",
    summary: sanitizeDiagnosticText(gitVer.stdout) || "git available",
  };

  if (typeof repoInput !== "string" || repoInput.trim().length === 0 || hasNullByte(repoInput)) {
    return {
      gitCheck,
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "FAIL",
        summary: "Invalid --repo path.",
        remediation: "Pass a valid local repository directory with `--repo <dir>`.",
      },
      resolvedRepo: null,
    };
  }

  let resolvedRepo;
  try {
    resolvedRepo = fsImpl.realpathSync(path.resolve(repoInput));
    const st = fsImpl.statSync(resolvedRepo);
    if (!st.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (err) {
    return {
      gitCheck,
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "FAIL",
        summary: `Repository path is inaccessible (${sanitizeDiagnosticText(err.message)}).`,
        remediation: "Verify the `--repo <dir>` path exists and is a readable directory.",
      },
      resolvedRepo: null,
    };
  }

  const topRes = runCmd("git", ["--no-optional-locks", "rev-parse", "--show-toplevel"], { cwd: resolvedRepo, env });
  const headRes = runCmd("git", ["--no-optional-locks", "rev-parse", "HEAD"], { cwd: resolvedRepo, env });
  const branchRes = runCmd("git", ["--no-optional-locks", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: resolvedRepo, env });
  const statusRes = runCmd("git", ["--no-optional-locks", "status", "--porcelain"], { cwd: resolvedRepo, env });

  if (topRes.status !== 0 || headRes.status !== 0 || !isFullSha((headRes.stdout || "").trim())) {
    const errDetail = sanitizeDiagnosticText(topRes.stderr || headRes.stderr || "not a Git checkout with a valid HEAD");
    return {
      gitCheck,
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "FAIL",
        summary: `Directory is not a healthy Git worktree with a valid HEAD (${errDetail}).`,
        remediation: "Run inside a valid Git repository with at least one commit.",
      },
      resolvedRepo,
    };
  }

  const headSha = headRes.stdout.trim();
  const branch = (branchRes.stdout || "").trim() || "HEAD";
  const dirtyLines = (statusRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);

  const remoteRes = runCmd("git", ["--no-optional-locks", "remote", "get-url", "origin"], { cwd: resolvedRepo, env });
  const cfgRes = runCmd("git", ["--no-optional-locks", "config", "--get", "relatehandoff.repository"], { cwd: resolvedRepo, env });
  const rawRepoId =
    normalizeRepositoryIdentity(remoteRes.status === 0 ? remoteRes.stdout : "") ||
    (cfgRes.status === 0 ? cfgRes.stdout.trim() : "") ||
    null;
  const repoId = rawRepoId ? sanitizeDiagnosticText(rawRepoId) : null;

  if (!repoId) {
    return {
      gitCheck,
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "WARN",
        summary: `Git worktree OK (${branch} @ ${headSha.slice(0, 12)}), but no origin remote or relatehandoff.repository config is set.`,
        remediation: "Configure `git remote add origin <url>` or `git config relatehandoff.repository <owner/repo>`, or pass `--repo-id` on record/resume.",
      },
      resolvedRepo,
    };
  }

  if (dirtyLines.length > 0) {
    return {
      gitCheck,
      repoCheck: {
        id: "git-repo",
        name: "Git repository",
        status: "WARN",
        summary: `Git worktree is dirty (${dirtyLines.length} modified/untracked entries on ${branch} @ ${headSha.slice(0, 12)}).`,
        remediation: "Commit or stash changes before running `record --verify` or `resume --verify`.",
      },
      resolvedRepo,
    };
  }

  return {
    gitCheck,
    repoCheck: {
      id: "git-repo",
      name: "Git repository",
      status: "PASS",
      summary: `Clean Git worktree for ${repoId} (${branch} @ ${headSha.slice(0, 12)}).`,
    },
    resolvedRepo,
  };
}

function detectLinuxGlibcIssue(failuresText, env, runCmd, platform) {
  const glibcMatch = failuresText.match(/GLIBC_(\d+\.\d+)/);
  if (glibcMatch) {
    return {
      detected: true,
      required: glibcMatch[1],
      system: null,
    };
  }
  if (platform === "linux") {
    const lddRes = runCmd("ldd", ["--version"], { env });
    const out = `${lddRes.stdout || ""}\n${lddRes.stderr || ""}`;
    const verMatch = out.match(/(\d+\.\d+)\s*$/m);
    if (verMatch && Number(verMatch[1]) < 2.39) {
      return {
        detected: true,
        required: "2.39",
        system: verMatch[1],
      };
    }
  }
  return { detected: false };
}

function checkRelateCli({ explicitBin, env, platform, homedir, runCmd, fsImpl }) {
  const envBin = env.RELATE_BIN ? String(env.RELATE_BIN).trim() : "";
  if (env.RELATE_BIN !== undefined && (!envBin || hasNullByte(env.RELATE_BIN))) {
    return {
      check: {
        id: "relate-cli",
        name: "Relate CLI",
        status: "FAIL",
        summary: "RELATE_BIN is set to an empty or malformed value.",
        remediation: "Unset RELATE_BIN or point it to a valid `relate` v1.0.1 executable.",
      },
      bin: null,
    };
  }

  const exe = platform === "win32" ? "relate.exe" : "relate";
  const candidates = [
    explicitBin,
    envBin || null,
    path.join(homedir, ".cargo", "bin", exe),
    platform !== "win32" ? "/tmp/relate-cargo/bin/relate" : null,
    "relate",
  ].filter(Boolean);

  if (envBin && !fsImpl.existsSync(envBin)) {
    return {
      check: {
        id: "relate-cli",
        name: "Relate CLI",
        status: "FAIL",
        summary: `RELATE_BIN points to a missing path: ${envBin}.`,
        remediation: "Fix RELATE_BIN or unset it to use PATH / ~/.cargo/bin/relate.",
      },
      bin: null,
    };
  }

  const failures = [];
  for (const bin of candidates) {
    const res = runCmd(bin, ["--version"], { env });
    if (res.status === 0) {
      const versionOut = sanitizeDiagnosticText(res.stdout);
      if (versionOut.includes(EXPECTED_RELATE_VERSION)) {
        return {
          check: {
            id: "relate-cli",
            name: "Relate CLI",
            status: "PASS",
            summary: `Found ${versionOut} at ${bin}.`,
          },
          bin,
        };
      }
      return {
        check: {
          id: "relate-cli",
          name: "Relate CLI",
          status: "WARN",
          summary: `Found '${versionOut || "unknown"}' at ${bin}, expected Relate v${EXPECTED_RELATE_VERSION}.`,
          remediation: `Install Relate v${EXPECTED_RELATE_VERSION} for full compatibility.`,
        },
        bin,
      };
    }
    const errText = sanitizeDiagnosticText(res.stderr || res.error?.message || `exit ${res.status}`);
    failures.push(`${bin}: ${errText}`);
  }

  const combinedFailures = failures.join(" | ");
  const glibc = detectLinuxGlibcIssue(combinedFailures, env, runCmd, platform);
  if (glibc.detected) {
    const sysNote = glibc.system ? ` (host GLIBC ${glibc.system})` : "";
    return {
      check: {
        id: "relate-cli",
        name: "Relate CLI",
        status: "FAIL",
        summary: `Relate binary failed due to unsupported Linux GLIBC${sysNote}; prebuilt relate-linux-amd64 requires GLIBC_${glibc.required}.`,
        remediation: "Build relate-cli v1.0.1 from source (`cargo install`), or use `@relate/relate@1.0.1` / `relate-db@1.0.1`.",
      },
      bin: null,
    };
  }

  return {
    check: {
      id: "relate-cli",
      name: "Relate CLI",
      status: "FAIL",
      summary: `No runnable Relate v${EXPECTED_RELATE_VERSION} CLI found (${combinedFailures}).`,
      remediation: "Install Relate CLI v1.0.1 on PATH, at ~/.cargo/bin/relate, or set RELATE_BIN.",
    },
    bin: null,
  };
}

function checkLocalStore({ storeInput, resolvedRepo, env, relateBin, runCmd, fsImpl }) {
  let targetStore = storeInput;
  let explicit = Boolean(storeInput);
  if (!targetStore && env.RELATE_STORE) {
    targetStore = env.RELATE_STORE;
    explicit = true;
  }
  if (!targetStore && resolvedRepo) {
    const exampleStore = path.join(resolvedRepo, "examples", "example-store");
    if (fsImpl.existsSync(exampleStore)) {
      targetStore = exampleStore;
    }
  }

  if (!targetStore) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "WARN",
      summary: "No store configured or discovered (pass --store <dir> or set RELATE_STORE).",
      remediation: "Pass `--store examples/example-store` (or your project store directory) to verify store access.",
    };
  }

  if (hasNullByte(targetStore) || targetStore.trim().length === 0) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "FAIL",
      summary: "Malformed --store path.",
      remediation: "Provide a valid local Relate directory store path.",
    };
  }

  const resolvedStore = path.resolve(targetStore);
  try {
    const st = fsImpl.statSync(resolvedStore);
    if (!st.isDirectory()) {
      return {
        id: "relate-store",
        name: "Local Relate store",
        status: "FAIL",
        summary: `Store path is not a directory: ${resolvedStore}.`,
        remediation: "Point `--store` to a valid Relate directory store.",
      };
    }
    fsImpl.accessSync(resolvedStore, fs.constants.R_OK);
  } catch (err) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: explicit ? "FAIL" : "WARN",
      summary: `Store directory is inaccessible at ${resolvedStore} (${sanitizeDiagnosticText(err.message)}).`,
      remediation: "Verify the store directory exists and is readable by the current user.",
    };
  }

  if (!relateBin) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "WARN",
      summary: `Store directory ${resolvedStore} is readable, but read-only MCP probe was skipped (Relate CLI unavailable).`,
      remediation: "Fix the Relate CLI check above to verify read-only MCP store access.",
    };
  }

  const mcpInput = [
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "relatehandoff-doctor", version: "0.1.0" },
      },
    }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  ].join("\n") + "\n";

  const res = runCmd(
    relateBin,
    ["serve", "--mcp", "stdio", "--database", resolvedStore, "--read-only"],
    { env, input: mcpInput }
  );

  if (res.error || res.status !== 0) {
    const detail = sanitizeDiagnosticText(res.stderr || res.error?.message || `exit ${res.status}`);
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "FAIL",
      summary: `Read-only MCP probe failed on ${sanitizeDiagnosticText(resolvedStore)} (${detail}).`,
      remediation: "Check store integrity/WAL files and ensure the directory is a valid Relate store.",
    };
  }

  const lines = String(res.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return {
        id: "relate-store",
        name: "Local Relate store",
        status: "FAIL",
        summary: `Read-only MCP probe returned malformed JSON on ${sanitizeDiagnosticText(resolvedStore)}.`,
        remediation: "Verify Relate CLI v1.0.1 stdio MCP output and store integrity.",
      };
    }
    if (msg && typeof msg === "object" && msg.id !== undefined) {
      byId.set(msg.id, msg);
    }
  }

  const initResp = byId.get(1);
  const toolsResp = byId.get(2);
  if (!initResp || !toolsResp) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "FAIL",
      summary: `Read-only MCP probe returned an incomplete response on ${sanitizeDiagnosticText(resolvedStore)} (missing initialize or tools/list reply).`,
      remediation: "Ensure `relate serve --mcp stdio --read-only` completes both initialize and tools/list.",
    };
  }
  if (initResp.error || toolsResp.error) {
    const errMsg = sanitizeDiagnosticText(
      initResp.error?.message || toolsResp.error?.message || "MCP JSON-RPC error"
    );
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "FAIL",
      summary: `Read-only MCP probe returned an error on ${sanitizeDiagnosticText(resolvedStore)} (${errMsg}).`,
      remediation: "Check store integrity/WAL files and Relate CLI compatibility.",
    };
  }
  if (
    !initResp.result ||
    typeof initResp.result !== "object" ||
    !toolsResp.result ||
    typeof toolsResp.result !== "object" ||
    !Array.isArray(toolsResp.result.tools)
  ) {
    return {
      id: "relate-store",
      name: "Local Relate store",
      status: "FAIL",
      summary: `Read-only MCP probe returned a malformed result payload on ${sanitizeDiagnosticText(resolvedStore)}.`,
      remediation: "Verify Relate CLI v1.0.1 MCP protocol compatibility.",
    };
  }

  return {
    id: "relate-store",
    name: "Local Relate store",
    status: "PASS",
    summary: `Read-only MCP probe succeeded against ${sanitizeDiagnosticText(resolvedStore)} (${toolsResp.result.tools.length} tools).`,
  };
}

/**
 * Run all read-only environment diagnostics for `relatehandoff doctor`.
 */
export function runDoctor(options = {}, deps = {}) {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const nodeVersion = deps.nodeVersion ?? process.version;
  const homedir = deps.homedir ?? os.homedir();
  const runCmd = deps.runCmd ?? defaultRunCmd;
  const fsImpl = deps.fsImpl ?? fs;
  const repoInput = options.repo ?? process.cwd();

  const checks = [];
  checks.push(checkNodeRuntime(nodeVersion));
  checks.push(checkEnvironmentSanity(env, platform));

  const { gitCheck, repoCheck, resolvedRepo } = checkGitAndRepo({
    repoInput,
    env,
    runCmd,
    fsImpl,
  });
  checks.push(gitCheck);
  checks.push(repoCheck);

  const relateResult = checkRelateCli({
    explicitBin: options.relateBin,
    env,
    platform,
    homedir,
    runCmd,
    fsImpl,
  });
  checks.push(relateResult.check);

  checks.push(
    checkLocalStore({
      storeInput: options.store,
      resolvedRepo,
      env,
      relateBin: relateResult.bin,
      runCmd,
      fsImpl,
    })
  );

  const sanitizedChecks = checks.map((c) => ({
    ...c,
    summary: sanitizeDiagnosticText(c.summary),
    ...(c.remediation ? { remediation: sanitizeDiagnosticText(c.remediation) } : {}),
  }));

  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const c of sanitizedChecks) {
    counts[c.status] = (counts[c.status] || 0) + 1;
  }

  const overallStatus = counts.FAIL > 0 ? "FAIL" : counts.WARN > 0 ? "WARN" : "PASS";
  const strict = Boolean(options.strict);
  const exitCode = counts.FAIL > 0 || (strict && counts.WARN > 0) ? 1 : 0;

  return {
    ok: exitCode === 0,
    status: overallStatus,
    exitCode,
    platform,
    readOnly: true,
    counts,
    checks: sanitizedChecks,
  };
}

/**
 * Format doctor report as concise human-readable text.
 */
export function formatDoctorReport(report) {
  const lines = [`RelateHandoff Doctor (${report.platform}, read-only) — ${report.status}`];
  for (const c of report.checks) {
    lines.push(`[${c.status}] ${c.name}: ${c.summary}`);
    if (c.remediation && c.status !== "PASS") {
      lines.push(`       Fix: ${c.remediation}`);
    }
  }
  lines.push(
    `Summary: ${report.counts.PASS} PASS, ${report.counts.WARN} WARN, ${report.counts.FAIL} FAIL (exit ${report.exitCode})`
  );
  return lines.join("\n");
}
