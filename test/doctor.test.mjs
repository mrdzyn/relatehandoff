import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { formatDoctorReport, runDoctor, sanitizeDiagnosticText } from "../src/doctor.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function makeFakeDeps(overrides = {}) {
  const calls = [];
  const defaultRunCmd = (bin, args, opts = {}) => {
    calls.push({ bin, args, cwd: opts.cwd });
    if (bin === "git") {
      const sub = args[0] === "--no-optional-locks" ? args.slice(1) : args;
      if (sub[0] === "--version") {
        return { status: 0, stdout: "git version 2.45.0\n", stderr: "" };
      }
      if (sub[0] === "rev-parse" && sub[1] === "--show-toplevel") {
        return { status: 0, stdout: "/repo\n", stderr: "" };
      }
      if (sub[0] === "rev-parse" && sub[1] === "HEAD") {
        return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
      }
      if (sub[0] === "rev-parse" && sub[1] === "--abbrev-ref") {
        return { status: 0, stdout: "main\n", stderr: "" };
      }
      if (sub[0] === "status") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (sub[0] === "remote") {
        return { status: 0, stdout: "https://github.com/mrdzyn/relatehandoff.git\n", stderr: "" };
      }
      if (sub[0] === "config") {
        return { status: 1, stdout: "", stderr: "" };
      }
    }
    if ((bin === "relate" || bin.endsWith("relate") || bin.endsWith("relate.exe")) && args[0] === "--version") {
      return { status: 0, stdout: "Relate v1.0.1 License: Apache 2.0\n", stderr: "" };
    }
    if ((bin === "relate" || bin.endsWith("relate") || bin.endsWith("relate.exe")) && args[0] === "serve") {
      return {
        status: 0,
        stdout: [
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "cypher_read" }] } }),
        ].join("\n") + "\n",
        stderr: "",
      };
    }
    return { status: 1, stdout: "", stderr: "unexpected command" };
  };

  const defaultFs = {
    realpathSync: (p) => p,
    statSync: () => ({ isDirectory: () => true }),
    accessSync: () => {},
    existsSync: () => true,
  };

  return {
    calls,
    deps: {
      env: { PATH: "/usr/bin:/bin" },
      platform: "darwin",
      nodeVersion: "v24.1.0",
      homedir: "/home/user",
      runCmd: defaultRunCmd,
      fsImpl: defaultFs,
      ...overrides,
    },
  };
}

function hashDirectory(dir) {
  const entries = [];
  function walk(cur) {
    for (const name of fs.readdirSync(cur).sort()) {
      const full = path.join(cur, name);
      const rel = path.relative(dir, full);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        entries.push(`D:${rel}`);
        walk(full);
      } else {
        const digest = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
        entries.push(`F:${rel}:${digest}`);
      }
    }
  }
  walk(dir);
  return entries;
}

test("doctor: all checks PASS on healthy environment", () => {
  const { deps, calls } = makeFakeDeps();
  const report = runDoctor({ repo: "/repo", store: "/store" }, deps);

  assert.equal(report.status, "PASS");
  assert.equal(report.exitCode, 0);
  assert.equal(report.readOnly, true);
  assert.equal(report.counts.PASS, 6);
  assert.equal(report.counts.WARN, 0);
  assert.equal(report.counts.FAIL, 0);

  const serveCall = calls.find((c) => c.args[0] === "serve");
  assert.ok(serveCall);
  assert.ok(serveCall.args.includes("--read-only"));
  assert.ok(formatDoctorReport(report).includes("6 PASS, 0 WARN, 0 FAIL"));
});

test("doctor: unsupported Node.js versions report FAIL (<20) and WARN (20..23)", () => {
  const { deps: oldDeps } = makeFakeDeps({ nodeVersion: "v18.20.0" });
  const failReport = runDoctor({ repo: "/repo", store: "/store" }, oldDeps);
  assert.equal(failReport.status, "FAIL");
  assert.equal(failReport.exitCode, 1);
  assert.equal(failReport.checks.find((c) => c.id === "node-runtime").status, "FAIL");

  const { deps: warnDeps } = makeFakeDeps({ nodeVersion: "v22.11.0" });
  const warnReport = runDoctor({ repo: "/repo", store: "/store" }, warnDeps);
  assert.equal(warnReport.status, "WARN");
  assert.equal(warnReport.exitCode, 0);

  const strictReport = runDoctor({ repo: "/repo", store: "/store", strict: true }, warnDeps);
  assert.equal(strictReport.exitCode, 1);
});

test("doctor: missing git and missing relate executables fail cleanly", () => {
  const { deps } = makeFakeDeps({
    runCmd: (bin) => ({
      status: null,
      error: Object.assign(new Error(`spawn ${bin} ENOENT`), { code: "ENOENT" }),
      stdout: "",
      stderr: "",
    }),
  });

  const report = runDoctor({ repo: "/repo", store: "/store" }, deps);
  assert.equal(report.status, "FAIL");
  assert.equal(report.exitCode, 1);
  assert.equal(report.checks.find((c) => c.id === "git-cli").status, "FAIL");
  assert.equal(report.checks.find((c) => c.id === "relate-cli").status, "FAIL");
  assert.equal(report.checks.find((c) => c.id === "relate-store").status, "WARN");
});

test("doctor: detects Linux GLIBC mismatch and suggests source-build / package alternatives", () => {
  const { deps } = makeFakeDeps({
    platform: "linux",
    runCmd: (bin, args) => {
      if (bin === "git") {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.39.5\n", stderr: "" };
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: "b".repeat(40) + "\n", stderr: "" };
        if (args[0] === "remote") return { status: 0, stdout: "org/repo\n", stderr: "" };
        return { status: 0, stdout: "main\n", stderr: "" };
      }
      if (bin === "ldd") {
        return { status: 0, stdout: "ldd (Debian GLIBC 2.36-9+deb12u7) 2.36\n", stderr: "" };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "relate: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found (required by relate)",
      };
    },
  });

  const report = runDoctor({ repo: "/repo", store: "/store" }, deps);
  const relateCheck = report.checks.find((c) => c.id === "relate-cli");
  assert.equal(relateCheck.status, "FAIL");
  assert.match(relateCheck.summary, /GLIBC_2\.39/);
  assert.match(relateCheck.remediation, /@relate\/relate@1\.0\.1/);
});

test("doctor: inaccessible store and malformed environments fail closed", () => {
  const { deps: badStoreDeps } = makeFakeDeps({
    fsImpl: {
      realpathSync: (p) => p,
      statSync: (p) => {
        if (p.includes("missing-store")) throw new Error("ENOENT: no such file or directory");
        return { isDirectory: () => true };
      },
      accessSync: () => {},
      existsSync: () => true,
    },
  });
  const storeFail = runDoctor({ repo: "/repo", store: "/missing-store" }, badStoreDeps);
  assert.equal(storeFail.checks.find((c) => c.id === "relate-store").status, "FAIL");
  assert.equal(storeFail.exitCode, 1);

  const { deps: emptyPathDeps } = makeFakeDeps({ env: { PATH: "" } });
  const envFail = runDoctor({ repo: "/repo", store: "/store" }, emptyPathDeps);
  assert.equal(envFail.checks.find((c) => c.id === "env-path").status, "FAIL");
  assert.equal(envFail.exitCode, 1);

  const { deps: nullByteDeps } = makeFakeDeps({ env: { PATH: "/usr/bin", RELATE_BIN: "/bad\0path" } });
  const nullFail = runDoctor({ repo: "/repo", store: "/store" }, nullByteDeps);
  assert.equal(nullFail.checks.find((c) => c.id === "env-path").status, "FAIL");
  assert.equal(nullFail.checks.find((c) => c.id === "relate-cli").status, "FAIL");
});

test("doctor: supports win32 Path casing and relate.exe", () => {
  const { deps, calls } = makeFakeDeps({
    platform: "win32",
    env: { Path: "C:\\Windows\\System32" },
    homedir: "C:\\Users\\dev",
  });
  const report = runDoctor({ repo: "C:\\repo", store: "C:\\store" }, deps);
  assert.equal(report.status, "PASS");
  assert.ok(calls.some((c) => c.bin.endsWith("relate.exe")));
});

test("doctor: redacts secrets and credentials in diagnostic text", () => {
  const redacted = sanitizeDiagnosticText(
    "fatal: https://user:supersecret@github.com/org/repo ghp_1234567890abcdef Bearer tok_1234567890"
  );
  assert.ok(!redacted.includes("supersecret"));
  assert.ok(!redacted.includes("ghp_1234567890abcdef"));
  assert.ok(!redacted.includes("tok_1234567890"));
});

test("doctor CLI: read-only on real git repo and copied example store", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-doctor-"));
  try {
    const storeCopy = path.join(tmpDir, "store");
    fs.cpSync(path.join(REPO_ROOT, "examples", "example-store"), storeCopy, { recursive: true });
    const beforeStore = hashDirectory(storeCopy);
    const beforeHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const beforeStatus = execFileSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });

    const out = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "src", "cli.mjs"), "doctor", "--repo", REPO_ROOT, "--store", storeCopy, "--json"],
      { encoding: "utf8" }
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.checks.find((c) => c.id === "relate-store").status, "PASS");

    const afterStore = hashDirectory(storeCopy);
    const afterHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const afterStatus = execFileSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });

    assert.deepEqual(afterStore, beforeStore);
    assert.equal(afterHead, beforeHead);
    assert.equal(afterStatus, beforeStatus);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("RH15-01: rejects missing, malformed, partial, or error MCP initialize/tools/list responses", () => {
  const cases = [
    {
      name: "missing tools/list",
      stdout: JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) + "\n",
    },
    {
      name: "malformed JSON",
      stdout: "{not-json}\n",
    },
    {
      name: "JSON-RPC error in tools/list",
      stdout:
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) +
        "\n" +
        JSON.stringify({ jsonrpc: "2.0", id: 2, error: { code: -32601, message: "method not found" } }) +
        "\n",
    },
    {
      name: "partial result without tools array",
      stdout:
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) +
        "\n" +
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: "invalid" } }) +
        "\n",
    },
  ];

  for (const tc of cases) {
    const { deps } = makeFakeDeps({
      runCmd: (bin, args) => {
        if (bin === "git") {
          const sub = args[0] === "--no-optional-locks" ? args.slice(1) : args;
          if (sub[0] === "--version") return { status: 0, stdout: "git version 2.45.0\n", stderr: "" };
          if (sub[0] === "rev-parse" && sub[1] === "HEAD") return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
          if (sub[0] === "remote") return { status: 0, stdout: "org/repo\n", stderr: "" };
          if (sub[0] === "status") return { status: 0, stdout: "", stderr: "" };
          return { status: 0, stdout: "main\n", stderr: "" };
        }
        if (args[0] === "--version") return { status: 0, stdout: "Relate v1.0.1\n", stderr: "" };
        return { status: 0, stdout: tc.stdout, stderr: "" };
      },
    });
    const report = runDoctor({ repo: "/repo", store: "/store" }, deps);
    assert.equal(report.checks.find((c) => c.id === "relate-store").status, "FAIL", tc.name);
    assert.equal(report.exitCode, 1, tc.name);
  }
});

test("RH15-02: git diagnostics use --no-optional-locks and never mutate .git/index", () => {
  const { deps, calls } = makeFakeDeps();
  runDoctor({ repo: "/repo", store: "/store" }, deps);
  const repoGitCalls = calls.filter((c) => c.bin === "git" && c.args[0] !== "--version");
  assert.ok(repoGitCalls.length > 0);
  for (const c of repoGitCalls) {
    assert.equal(c.args[0], "--no-optional-locks");
  }

  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "rh-doctor-gitidx-"));
  try {
    execFileSync("git", ["init"], { cwd: tmpRepo, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpRepo, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpRepo, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/mrdzyn/relatehandoff.git"], {
      cwd: tmpRepo,
      stdio: "ignore",
    });
    const tracked = path.join(tmpRepo, "README.md");
    fs.writeFileSync(tracked, "hello\n");
    execFileSync("git", ["add", "README.md"], { cwd: tmpRepo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: tmpRepo, stdio: "ignore" });

    // Touch tracked file mtime so a normal `git status` without --no-optional-locks would refresh .git/index
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(tracked, future, future);

    const indexPath = path.join(tmpRepo, ".git", "index");
    const beforeIndex = crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex");

    const res = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, "src", "cli.mjs"), "doctor", "--repo", tmpRepo, "--json"],
      { encoding: "utf8" }
    );
    assert.equal(res.status, 0);
    const afterIndex = crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex");
    assert.equal(afterIndex, beforeIndex);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test("RH15-03: redacts secrets in config-derived repo identity, paths, and JSON reports", () => {
  const { deps } = makeFakeDeps({
    env: {
      PATH: "/usr/bin",
      RELATE_BIN: "/tmp/bin?token=secret_tok_123",
    },
    fsImpl: {
      realpathSync: (p) => p,
      statSync: () => ({ isDirectory: () => true }),
      accessSync: () => {},
      existsSync: (p) => !String(p).includes("secret_tok_123"),
    },
    runCmd: (bin, args) => {
      if (bin === "git") {
        const sub = args[0] === "--no-optional-locks" ? args.slice(1) : args;
        if (sub[0] === "--version") return { status: 0, stdout: "git version 2.45.0\n", stderr: "" };
        if (sub[0] === "rev-parse" && sub[1] === "HEAD") return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
        if (sub[0] === "config") return { status: 0, stdout: "ghp_secretconfigtoken12345\n", stderr: "" };
        if (sub[0] === "remote") return { status: 1, stdout: "", stderr: "" };
        if (sub[0] === "status") return { status: 0, stdout: "", stderr: "" };
        return { status: 0, stdout: "main\n", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "" };
    },
  });

  const report = runDoctor({ repo: "/repo", store: "/store?access_token=abc12345" }, deps);
  const serialized = JSON.stringify(report);
  const formatted = formatDoctorReport(report);
  for (const text of [serialized, formatted]) {
    assert.ok(!text.includes("secret_tok_123"));
    assert.ok(!text.includes("ghp_secretconfigtoken12345"));
    assert.ok(!text.includes("abc12345"));
  }
});

test("RH15-04: invalid CLI usage and unsupported doctor flags exit 2 while failed checks exit 1", () => {
  const cliPath = path.join(REPO_ROOT, "src", "cli.mjs");

  const unsupportedFlag = spawnSync(process.execPath, [cliPath, "doctor", "--bogus", "1"], { encoding: "utf8" });
  assert.equal(unsupportedFlag.status, 2);
  assert.match(unsupportedFlag.stderr, /Unsupported flag for doctor/);

  const missingVal = spawnSync(process.execPath, [cliPath, "doctor", "--store"], { encoding: "utf8" });
  assert.equal(missingVal.status, 2);

  const unknownCmd = spawnSync(process.execPath, [cliPath, "unknown-cmd"], { encoding: "utf8" });
  assert.equal(unknownCmd.status, 2);

  const failedCheck = spawnSync(
    process.execPath,
    [cliPath, "doctor", "--repo", REPO_ROOT, "--store", path.join(REPO_ROOT, "does-not-exist-store")],
    { encoding: "utf8" }
  );
  assert.equal(failedCheck.status, 1);
});

test("RH15-03: suppresses non-canonical repository identities including credential-bearing SSH URLs", () => {
  const sshUrls = [
    { url: "ssh://deploy:sshsecret99@git.example.com/org/repo.git", secret: "sshsecret99" },
    { url: "git:sshsecret88@example.com:org/repo.git", secret: "sshsecret88" },
  ];

  for (const { url, secret } of sshUrls) {
    const { deps } = makeFakeDeps({
      runCmd: (bin, args) => {
        if (bin === "git") {
          const sub = args[0] === "--no-optional-locks" ? args.slice(1) : args;
          if (sub[0] === "--version") return { status: 0, stdout: "git version 2.45.0\n", stderr: "" };
          if (sub[0] === "rev-parse" && sub[1] === "HEAD") return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
          if (sub[0] === "remote") return { status: 0, stdout: `${url}\n`, stderr: "" };
          if (sub[0] === "config") return { status: 1, stdout: "", stderr: "" };
          if (sub[0] === "status") return { status: 0, stdout: "", stderr: "" };
          return { status: 0, stdout: "main\n", stderr: "" };
        }
        if (args[0] === "--version") return { status: 0, stdout: "Relate v1.0.1\n", stderr: "" };
        return {
          status: 0,
          stdout:
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) +
            "\n" +
            JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [] } }) +
            "\n",
          stderr: "",
        };
      },
    });

    const report = runDoctor({ repo: "/repo", store: "/store" }, deps);
    const repoCheck = report.checks.find((c) => c.id === "git-repo");
    assert.equal(repoCheck.status, "WARN");
    assert.match(repoCheck.summary, /suppressed/);
    const jsonText = JSON.stringify(report);
    const plainText = formatDoctorReport(report);
    assert.ok(!jsonText.includes(secret));
    assert.ok(!plainText.includes(secret));
    assert.ok(!jsonText.includes("example.com"));
    assert.ok(!plainText.includes("example.com"));
  }
});

test("RH15-05: fails closed when git status --porcelain exits 128 despite valid HEAD", () => {
  const { deps } = makeFakeDeps({
    runCmd: (bin, args) => {
      if (bin === "git") {
        const sub = args[0] === "--no-optional-locks" ? args.slice(1) : args;
        if (sub[0] === "--version") return { status: 0, stdout: "git version 2.45.0\n", stderr: "" };
        if (sub[0] === "rev-parse" && sub[1] === "HEAD") return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
        if (sub[0] === "status") return { status: 128, stdout: "", stderr: "fatal: detected dubious ownership in repository" };
        if (sub[0] === "remote") return { status: 0, stdout: "https://github.com/mrdzyn/relatehandoff.git\n", stderr: "" };
        return { status: 0, stdout: "main\n", stderr: "" };
      }
      if (args[0] === "--version") return { status: 0, stdout: "Relate v1.0.1\n", stderr: "" };
      return {
        status: 0,
        stdout:
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) +
          "\n" +
          JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [] } }) +
          "\n",
        stderr: "",
      };
    },
  });

  const report = runDoctor({ repo: "/repo", store: "/store" }, deps);
  const repoCheck = report.checks.find((c) => c.id === "git-repo");
  assert.equal(repoCheck.status, "FAIL");
  assert.match(repoCheck.summary, /dubious ownership/);
  assert.equal(report.exitCode, 1);
});
