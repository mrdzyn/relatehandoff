import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FULL_SHA_RE = /^[0-9a-f]{40}$/;

export function isFullSha(sha) {
  return typeof sha === "string" && FULL_SHA_RE.test(sha);
}

export function getGitState(repoRoot) {
  const resolvedRoot = fs.realpathSync(repoRoot);
  const runGit = (args) =>
    execFileSync("git", args, {
      cwd: resolvedRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

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

  const dirtyFiles = porcelain
    ? porcelain
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return {
    repoRoot: resolvedRoot,
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
  if (path.isAbsolute(relPath)) {
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

  if (fs.existsSync(candidate)) {
    const realTarget = fs.realpathSync(candidate);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
      throw new Error(`Artifact symlink escapes repository root: ${relPath}`);
    }
  }

  return normalized;
}
