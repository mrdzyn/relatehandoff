import { isFullSha } from "./git.mjs";
import { isTrustedEvidenceAuthenticated } from "./attestation.mjs";

export function evaluateFreshness({
  handoff,
  evidenceList = [],
  gitState,
  remoteVerified = false,
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
  let hasAuthenticatedPass = false;

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
      } else {
        // status === "PASS": check whether execution was authenticated via trusted local runner
        const authenticated = isTrustedEvidenceAuthenticated({
          ev,
          repository: handoff.repository,
          currentHeadSha,
        });
        if (authenticated) {
          hasAuthenticatedPass = true;
        } else {
          hasSelfAsserted = true;
          hasUnverified = true;
          reasons.push(`UNAUTHENTICATED_SELF_ASSERTED_EVIDENCE:${ev.id ?? "unknown"}`);
        }
      }
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
  } else if (hasSelfAsserted) {
    executionAuthenticity = "SELF_ASSERTED";
  } else if (hasAuthenticatedPass && !hasUnverified) {
    executionAuthenticity = "AUTHENTICATED";
  }

  let status = "VERIFIED";
  if (hasBlocked) {
    status = "BLOCKED";
  } else if (hasStale) {
    status = "STALE";
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
