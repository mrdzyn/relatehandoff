import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

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
  evidenceId = "EV-TRUSTED-1",
}) {
  const spec = TRUSTED_VALIDATION_PROFILES[validationProfile];
  if (!spec) {
    throw new Error(
      `Untrusted validation profile '${validationProfile}'. Allowed: ${Object.keys(TRUSTED_VALIDATION_PROFILES).join(", ")}`
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
    executionMode: "TRUSTED_LOCAL_RUNNER",
    validationProfile,
    exitCode,
    attestationSha256,
  };
}

export function isTrustedEvidenceAuthenticated({ ev, repository }) {
  if (!ev || ev.executionMode !== "TRUSTED_LOCAL_RUNNER") {
    return false;
  }
  const spec = TRUSTED_VALIDATION_PROFILES[ev.validationProfile];
  if (!spec) {
    return false;
  }
  if (ev.command !== spec.displayCommand || ev.exitCode !== 0 || ev.status !== "PASS") {
    return false;
  }
  const expected = computeEvidenceAttestation({
    repository,
    headSha: ev.headSha,
    validationProfile: ev.validationProfile,
    command: ev.command,
    exitCode: ev.exitCode,
    status: ev.status,
  });
  return ev.attestationSha256 === expected;
}
