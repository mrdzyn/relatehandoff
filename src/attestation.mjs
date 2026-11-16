import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { getGitState } from "./git.mjs";

export const TRUSTED_VALIDATION_PROFILES = Object.freeze({
  "relatehandoff-tests": {
    bin: "python3",
    args: ["scripts/run_p1_tests.py"],
    displayCommand: "python3 scripts/run_p1_tests.py",
    kind: "integration-test",
  },
  "relatehandoff-build": {
    bin: "npm",
    args: ["run", "build"],
    displayCommand: "npm run build",
    kind: "build-check",
  },
  "relatehandoff-security": {
    bin: "python3",
    args: ["scripts/run_p1_security.py"],
    displayCommand: "python3 scripts/run_p1_security.py",
    kind: "security-test",
  },
  "node-test-suite": {
    bin: process.execPath,
    args: ["--test"],
    displayCommand: "node --test",
    kind: "unit-test",
  },
});

// Unkeyed SHA-256 consistency checksum over runner fields (NOT a cryptographic credential).
export function computeEvidenceAttestation({
  repository,
  headSha,
  validationProfile,
  command,
  exitCode,
  status,
}) {
  const canonical = JSON.stringify({
    repository,
    headSha,
    validationProfile,
    command,
    exitCode,
    status,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function runTrustedValidation({
  repoRoot,
  repository,
  headSha,
  validationProfile,
  evidenceId = "EV-RUNNER-1",
}) {
  const spec = TRUSTED_VALIDATION_PROFILES[validationProfile];
  if (!spec) {
    throw new Error(
      `Untrusted validation profile '${validationProfile}'. Allowed: ${Object.keys(TRUSTED_VALIDATION_PROFILES).join(", ")}`
    );
  }

  const beforeGit = getGitState(repoRoot, { repository });
  if (beforeGit.isDirty) {
    throw new Error("Refusing --verify on dirty worktree; commit or stash changes first");
  }
  if (beforeGit.headSha !== headSha) {
    throw new Error(
      `Refusing --verify: checkout HEAD '${beforeGit.headSha}' does not match expected '${headSha}'`
    );
  }
  if (beforeGit.repository !== repository) {
    throw new Error(
      `Refusing --verify: checkout repository '${beforeGit.repository}' does not match expected '${repository}'`
    );
  }

  let exitCode = 0;
  let status = "PASS";
  try {
    execFileSync(spec.bin, spec.args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  } catch (err) {
    exitCode = typeof err.status === "number" ? err.status : 1;
    status = "FAIL";
  }

  const afterGit = getGitState(repoRoot, { repository });
  if (
    afterGit.isDirty ||
    afterGit.headSha !== beforeGit.headSha ||
    afterGit.repository !== beforeGit.repository
  ) {
    throw new Error(
      "Git HEAD, repository, or worktree changed during validation window; refusing to record stale runner evidence"
    );
  }

  const attestationSha256 = computeEvidenceAttestation({
    repository,
    headSha,
    validationProfile,
    command: spec.displayCommand,
    exitCode,
    status,
  });

  return {
    id: evidenceId,
    kind: spec.kind,
    command: spec.displayCommand,
    status,
    headSha,
    observedAt: new Date().toISOString(),
    executionMode: "RUNNER_RECORDED_UNSIGNED",
    validationProfile,
    exitCode,
    attestationSha256,
  };
}
