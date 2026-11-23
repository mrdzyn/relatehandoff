import { isFullSha, validateRepoRelativePath } from "./git.mjs";

export const SCHEMA_VERSION = "1.0.0";
export const MAX_DETAIL_ROWS = 100;

export const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const EVIDENCE_STATUSES = new Set(["PASS", "FAIL", "UNVERIFIED"]);

// Best-effort regex guard for common token/key formats (not a comprehensive secret scanner).
const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/i,
];

const SENSITIVE_ARTIFACT_NAMES = new Set([
  ".env",
  ".npmrc",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
  "secrets.json",
]);

const SENSITIVE_ARTIFACT_PATHS = new Set([
  ".aws/credentials",
]);

function assertNonEmptyString(val, field, maxLen = 2000) {
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new Error(`Invalid field '${field}': must be a non-empty string`);
  }
  if (val.length > maxLen) {
    throw new Error(`Invalid field '${field}': exceeds max length ${maxLen}`);
  }
  assertNoSecrets(val, field);
  return val.trim();
}

export function assertNoSecrets(text, context) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`Security rejection in ${context}: potential secret/token pattern detected`);
    }
  }
}

export function validateHandoffPayload(raw, repoRoot) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Handoff payload must be a JSON object");
  }

  const schemaVersion = raw.schemaVersion ?? SCHEMA_VERSION;
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion '${schemaVersion}' (expected '${SCHEMA_VERSION}')`);
  }

  const handoffId = assertNonEmptyString(raw.handoffId, "handoffId", 128);
  if (!ID_RE.test(handoffId)) {
    throw new Error("Invalid field 'handoffId': must match ^[A-Za-z0-9._-]{1,128}$");
  }

  const taskId = assertNonEmptyString(raw.taskId, "taskId", 128);
  if (!ID_RE.test(taskId)) {
    throw new Error("Invalid field 'taskId': must match ^[A-Za-z0-9._-]{1,128}$");
  }

  const repository = assertNonEmptyString(raw.repository, "repository", 256);
  const branch = assertNonEmptyString(raw.branch, "branch", 256);
  const sourceAgent = assertNonEmptyString(raw.sourceAgent, "sourceAgent", 128);
  const targetAgent = assertNonEmptyString(raw.targetAgent, "targetAgent", 128);

  if (!isFullSha(raw.headSha)) {
    throw new Error("Invalid field 'headSha': must be an exact 40-character lowercase hex Git SHA");
  }

  const summary = assertNonEmptyString(raw.summary, "summary", 2000);
  const nextAction = assertNonEmptyString(raw.nextAction, "nextAction", 1000);

  const decisions = [];
  const seenDecisionIds = new Set();
  if (raw.decisions !== undefined) {
    if (!Array.isArray(raw.decisions)) {
      throw new Error("Invalid field 'decisions': must be an array");
    }
    if (raw.decisions.length > MAX_DETAIL_ROWS) {
      throw new Error(
        `BoundExceededError: decisions count (${raw.decisions.length}) exceeds MAX_DETAIL_ROWS (${MAX_DETAIL_ROWS})`
      );
    }
    for (let i = 0; i < raw.decisions.length; i++) {
      const d = raw.decisions[i];
      if (!d || typeof d !== "object" || Array.isArray(d)) {
        throw new Error(`Invalid decision at index ${i}`);
      }
      const id = assertNonEmptyString(d.id, `decisions[${i}].id`, 128);
      if (!ID_RE.test(id)) {
        throw new Error(`Invalid decisions[${i}].id`);
      }
      if (seenDecisionIds.has(id)) {
        throw new Error(`Duplicate decision id '${id}' in payload`);
      }
      seenDecisionIds.add(id);
      const dSummary = assertNonEmptyString(d.summary, `decisions[${i}].summary`, 1000);
      decisions.push({ id, summary: dSummary });
    }
  }

  const artifacts = [];
  if (raw.artifacts !== undefined) {
    if (!Array.isArray(raw.artifacts)) {
      throw new Error("Invalid field 'artifacts': must be an array");
    }
    if (raw.artifacts.length > MAX_DETAIL_ROWS) {
      throw new Error(
        `BoundExceededError: artifacts count (${raw.artifacts.length}) exceeds MAX_DETAIL_ROWS (${MAX_DETAIL_ROWS})`
      );
    }
    for (let i = 0; i < raw.artifacts.length; i++) {
      const rel = raw.artifacts[i];
      const normalized = validateRepoRelativePath(repoRoot, rel);
      const lowerNorm = normalized.toLowerCase();
      const base = lowerNorm.split("/").pop();
      if (
        SENSITIVE_ARTIFACT_NAMES.has(base) ||
        SENSITIVE_ARTIFACT_PATHS.has(lowerNorm) ||
        (base.startsWith(".env.") && base !== ".env.example") ||
        /\.(p12|pfx|pem|key)$/.test(base)
      ) {
        throw new Error(`Security rejection: sensitive artifact filename '${normalized}'`);
      }
      artifacts.push(normalized);
    }
  }

  const evidence = [];
  const seenEvidenceIds = new Set();
  if (raw.evidence !== undefined) {
    if (!Array.isArray(raw.evidence)) {
      throw new Error("Invalid field 'evidence': must be an array");
    }
    if (raw.evidence.length > MAX_DETAIL_ROWS) {
      throw new Error(
        `BoundExceededError: evidence count (${raw.evidence.length}) exceeds MAX_DETAIL_ROWS (${MAX_DETAIL_ROWS})`
      );
    }
    for (let i = 0; i < raw.evidence.length; i++) {
      const ev = raw.evidence[i];
      if (!ev || typeof ev !== "object" || Array.isArray(ev)) {
        throw new Error(`Invalid evidence at index ${i}`);
      }
      const id = assertNonEmptyString(ev.id ?? `ev-${i + 1}`, `evidence[${i}].id`, 128);
      if (!ID_RE.test(id)) {
        throw new Error(`Invalid evidence[${i}].id`);
      }
      if (seenEvidenceIds.has(id)) {
        throw new Error(`Duplicate evidence id '${id}' in payload`);
      }
      seenEvidenceIds.add(id);

      const kind = assertNonEmptyString(ev.kind, `evidence[${i}].kind`, 64);
      const command = assertNonEmptyString(ev.command, `evidence[${i}].command`, 512);
      if (!EVIDENCE_STATUSES.has(ev.status)) {
        throw new Error(`Invalid evidence[${i}].status: must be PASS, FAIL, or UNVERIFIED`);
      }
      if (!isFullSha(ev.headSha)) {
        throw new Error(`Invalid evidence[${i}].headSha: must be 40-char lowercase hex SHA`);
      }
      const observedAt = assertNonEmptyString(ev.observedAt, `evidence[${i}].observedAt`, 64);
      if (Number.isNaN(Date.parse(observedAt))) {
        throw new Error(`Invalid evidence[${i}].observedAt: must be ISO-8601 timestamp`);
      }

      if (ev.executionMode !== undefined && ev.executionMode !== "SELF_ASSERTED") {
        throw new Error(
          `Security rejection: evidence[${i}].executionMode '${ev.executionMode}' cannot be client-supplied; use --verify <profile>`
        );
      }
      if (ev.validationProfile !== undefined && ev.validationProfile !== null) {
        throw new Error(
          `Security rejection: evidence[${i}].validationProfile cannot be client-supplied; use --verify <profile>`
        );
      }
      if (ev.exitCode !== undefined && ev.exitCode !== null) {
        throw new Error(
          `Security rejection: evidence[${i}].exitCode cannot be client-supplied; use --verify <profile>`
        );
      }
      if (ev.attestationSha256 !== undefined && ev.attestationSha256 !== null) {
        throw new Error(
          `Security rejection: evidence[${i}].attestationSha256 cannot be client-supplied; use --verify <profile>`
        );
      }

      evidence.push({
        id,
        kind,
        command,
        status: ev.status,
        headSha: ev.headSha,
        observedAt,
        executionMode: "SELF_ASSERTED",
        validationProfile: null,
        exitCode: null,
        attestationSha256: null,
      });
    }
  }

  const createdAt = raw.createdAt
    ? assertNonEmptyString(raw.createdAt, "createdAt", 64)
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Invalid field 'createdAt': must be ISO-8601 timestamp");
  }

  let supersedesHandoffId = null;
  if (raw.supersedesHandoffId !== undefined && raw.supersedesHandoffId !== null) {
    supersedesHandoffId = assertNonEmptyString(raw.supersedesHandoffId, "supersedesHandoffId", 128);
    if (!ID_RE.test(supersedesHandoffId)) {
      throw new Error("Invalid field 'supersedesHandoffId': must match ^[A-Za-z0-9._-]{1,128}$");
    }
    if (supersedesHandoffId === handoffId) {
      throw new Error("SupersessionError: Handoff cannot supersede itself");
    }
  }

  let supersessionReason = null;
  if (raw.supersessionReason !== undefined && raw.supersessionReason !== null) {
    if (supersedesHandoffId === null) {
      throw new Error("Invalid field 'supersessionReason': requires 'supersedesHandoffId'");
    }
    supersessionReason = assertNonEmptyString(raw.supersessionReason, "supersessionReason", 500);
  }

  return {
    schemaVersion,
    handoffId,
    taskId,
    repository,
    branch,
    sourceAgent,
    targetAgent,
    headSha: raw.headSha,
    summary,
    nextAction,
    decisions,
    artifacts,
    evidence,
    createdAt,
    supersedesHandoffId,
    supersessionReason,
  };
}
