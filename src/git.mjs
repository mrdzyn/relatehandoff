import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/;
const UNC_OR_DOUBLE_SLASH_RE = /^(\\\\|\/\/)/;

export function isFullSha(sha) {
  return typeof sha === "string" && FULL_SHA_RE.test(sha);
}

export function normalizeRepositoryIdentity(rawRemote) {
  if (typeof rawRemote !== "string") return null;
  const trimmed = rawRemote.trim();
  if (!trimmed) return null;

  // Normalize common GitHub HTTPS/SSH URLs to owner/repo
  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  if (httpsMatch) return httpsMatch[1];

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];

  return trimmed;
}

export function getGitState(repoRoot, options = {}) {
  const resolvedRoot = fs.realpathSync(repoRoot);
  const runGit = (args) =>
    execFileSync("git", ["--no-optional-locks", ...args], {
      cwd: resolvedRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  const tryGit = (args) => {
    try {
      return runGit(args);
    } catch {
      return "";
    }
  };

  let headSha = "";
  let branch = "";
  let porcelain = "";

  try {
    headSha = runGit(["rev-parse", "HEAD"]);
    branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    porcelain = runGit(["status", "--porcelain"]);
  } catch (err) {
    throw new Error(`Failed to inspect Git state at ${resolvedRoot}: ${err.message}`);
  }

  const originRemote = normalizeRepositoryIdentity(tryGit(["remote", "get-url", "origin"]));
  const configuredRepo = tryGit(["config", "--get", "relatehandoff.repository"]) || null;
  const establishedRepo = originRemote || configuredRepo;
  const explicitRepo = options.repository ? String(options.repository).trim() : null;

  if (establishedRepo && explicitRepo && establishedRepo !== explicitRepo) {
    throw new Error(
      `Repository identity mismatch: checkout is '${establishedRepo}', but caller/payload specified '${explicitRepo}'`
    );
  }

  const repository = establishedRepo || explicitRepo || null;

  const dirtyFiles = porcelain
    ? porcelain
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return {
    repoRoot: resolvedRoot,
    repository,
    headSha,
    branch,
    isDirty: dirtyFiles.length > 0,
    dirtyFiles,
  };
}

export function validateRepoRelativePath(repoRoot, relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new Error("Artifact path must be a non-empty string");
  }
  if (relPath.includes("\0")) {
    throw new Error(`Artifact path contains null byte: ${relPath}`);
  }
  if (WINDOWS_DRIVE_RE.test(relPath) || UNC_OR_DOUBLE_SLASH_RE.test(relPath)) {
    throw new Error(`Artifact path must be repo-relative (drive/UNC paths rejected): ${relPath}`);
  }
  if (path.isAbsolute(relPath) || relPath.startsWith("/")) {
    throw new Error(`Artifact path must be relative, got absolute path: ${relPath}`);
  }

  const normalized = path.posix.normalize(relPath.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Artifact path escapes repository root: ${relPath}`);
  }

  const realRoot = fs.realpathSync(repoRoot);
  const candidate = path.resolve(realRoot, normalized);
  if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep)) {
    throw new Error(`Artifact path resolves outside repository root: ${relPath}`);
  }

  // Walk every existing ancestor (handles symlink-parent escapes even when leaf doesn't exist)
  let current = candidate;
  while (current !== realRoot) {
    if (fs.existsSync(current)) {
      const realCurrent = fs.realpathSync(current);
      if (realCurrent !== realRoot && !realCurrent.startsWith(realRoot + path.sep)) {
        throw new Error(`Artifact symlink or symlink-parent escapes repository root: ${relPath}`);
      }
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return normalized;
}
