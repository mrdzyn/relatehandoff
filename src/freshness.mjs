import { isFullSha } from "./git.mjs";

export function evaluateFreshness({
  handoff,
  evidenceList = [],
  gitState,
  remoteVerified = false,
  inProcessVerification = null,
}) {
  const reasons = [];
  const currentHeadSha = gitState?.headSha ?? null;
  const currentRepo = gitState?.repository ?? null;
  const isDirty = Boolean(gitState?.isDirty);
  const remoteStatus = remoteVerified ? "VERIFIED" : "UNVERIFIED";

  if (!handoff || !isFullSha(handoff.headSha)) {
    reasons.push("MISSING_OR_INVALID_HANDOFF_SHA");
    return {
      status: "UNVERIFIED",
      metadataFreshness: "UNVERIFIED",
      executionAuthenticity: "MISSING",
      reasons,
      handoffSha: handoff?.headSha ?? null,
      currentHeadSha,
      isDirty,
      remoteStatus,
    };
  }

  if (!isFullSha(currentHeadSha)) {
    reasons.push("MISSING_LOCAL_HEAD_SHA");
    return {
      status: "UNVERIFIED",
      metadataFreshness: "UNVERIFIED",
      executionAuthenticity: "MISSING",
      reasons,
      handoffSha: handoff.headSha,
      currentHeadSha,
      isDirty,
      remoteStatus,
    };
  }

  let hasStale = false;
  let hasBlocked = false;
  let hasUnverified = false;
  let hasSelfAsserted = false;
  let hasUnsignedStored = false;
  let hasInProcessVerified = false;

  if (currentRepo && handoff.repository !== currentRepo) {
    hasBlocked = true;
    reasons.push(`REPOSITORY_MISMATCH: handoff=${handoff.repository} checkout=${currentRepo}`);
  }

  if (handoff.headSha !== currentHeadSha) {
    hasStale = true;
    reasons.push(`HEAD_SHA_MISMATCH: handoff=${handoff.headSha} current=${currentHeadSha}`);
  }

  if (isDirty) {
    hasStale = true;
    reasons.push("DIRTY_WORKTREE");
  }

  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    hasUnverified = true;
    reasons.push("MISSING_TEST_EVIDENCE");
  } else {
    for (const ev of evidenceList) {
      if (!isFullSha(ev.headSha)) {
        hasUnverified = true;
        reasons.push(`EVIDENCE_INVALID_SHA:${ev.id ?? "unknown"}`);
      } else if (ev.headSha !== currentHeadSha) {
        hasStale = true;
        reasons.push(`EVIDENCE_SHA_MISMATCH:${ev.id ?? "unknown"}`);
      }

      if (ev.status === "FAIL") {
        hasBlocked = true;
        reasons.push(`EVIDENCE_FAILED:${ev.id ?? "unknown"}`);
      } else if (ev.status !== "PASS") {
        hasUnverified = true;
        reasons.push(`EVIDENCE_UNVERIFIED:${ev.id ?? "unknown"}`);
      } else if (ev.executionMode === "SELF_ASSERTED" || !ev.executionMode) {
        hasSelfAsserted = true;
        hasUnverified = true;
        reasons.push(`UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE:${ev.id ?? "unknown"}`);
      } else {
        // Unsigned local Relate store cannot act as a cryptographic signing authority on read alone.
        hasUnsignedStored = true;
        hasUnverified = true;
        reasons.push(`UNSIGNED_LOCAL_STORE_EVIDENCE:${ev.id ?? "unknown"}`);
      }
    }
  }

  if (inProcessVerification) {
    if (inProcessVerification.status === "FAIL") {
      hasBlocked = true;
      reasons.push(`IN_PROCESS_VERIFICATION_FAILED:${inProcessVerification.validationProfile}`);
    } else if (
      inProcessVerification.status === "PASS" &&
      inProcessVerification.headSha === currentHeadSha &&
      !isDirty
    ) {
      hasInProcessVerified = true;
      reasons.push(`IN_PROCESS_VERIFICATION_PASSED:${inProcessVerification.validationProfile}`);
    }
  }

  if (!remoteVerified) {
    reasons.push("REMOTE_PR_STATE_UNVERIFIED");
  }

  const metadataFreshness = hasStale
    ? "STALE"
    : !Array.isArray(evidenceList) || evidenceList.length === 0
      ? "UNVERIFIED"
      : "CURRENT";

  let executionAuthenticity = "MISSING";
  if (hasBlocked) {
    executionAuthenticity = "FAILED";
  } else if (hasInProcessVerified) {
    executionAuthenticity = "AUTHENTICATED";
  } else if (hasUnsignedStored) {
    executionAuthenticity = "UNVERIFIED";
  } else if (hasSelfAsserted) {
    executionAuthenticity = "SELF_ASSERTED";
  }

  let status = "VERIFIED";
  if (hasBlocked) {
    status = "BLOCKED";
  } else if (hasStale) {
    status = "STALE";
  } else if (hasInProcessVerified) {
    status = "VERIFIED";
  } else if (hasUnverified) {
    status = "UNVERIFIED";
  }

  return {
    status,
    metadataFreshness,
    executionAuthenticity,
    reasons,
    handoffSha: handoff.headSha,
    currentHeadSha,
    isDirty,
    remoteStatus,
  };
}
