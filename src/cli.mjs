#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { recordHandoff } from "./recorder.mjs";
import { listHandoffsViaReadOnlyMcp, resumeTaskViaReadOnlyMcp } from "./mcp_client.mjs";
import { formatDoctorReport, runDoctor } from "./doctor.mjs";
import { formatHandoffListMarkdown, formatResumeMarkdown } from "./resume_format.mjs";
import { MAX_DETAIL_ROWS } from "./schema.mjs";

const BOOLEAN_FLAGS = new Set(["help", "json", "strict"]);
const DOCTOR_ALLOWED_FLAGS = new Set(["help", "json", "strict", "repo", "store", "relate-bin"]);
const RESUME_ALLOWED_FLAGS = new Set(["help", "store", "repo", "task", "handoff", "repo-id", "verify", "format"]);
const LIST_ALLOWED_FLAGS = new Set([
  "help",
  "store",
  "repo",
  "task",
  "repo-id",
  "status",
  "branch",
  "agent",
  "limit",
  "format",
]);
const ALLOWED_FORMATS = new Set(["json", "markdown"]);
const ALLOWED_LIST_STATUSES = new Set(["active", "superseded", "all"]);

class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const val = rest[i + 1];
      if (!val || val.startsWith("--")) {
        throw new CliUsageError(`Missing value for flag --${key}`);
      }
      flags[key] = val;
      i++;
    } else {
      throw new CliUsageError(`Unexpected positional argument: ${arg}`);
    }
  }
  return { command, flags };
}

function assertAllowedFlags(flags, allowed, commandName) {
  for (const key of Object.keys(flags)) {
    if (!allowed.has(key)) {
      throw new CliUsageError(`Unsupported flag for ${commandName}: --${key}`);
    }
  }
}

function printHelp() {
  console.log(`RelateHandoff CLI

Usage:
  node src/cli.mjs record --store <dir> --repo <dir> --input <json-file> [--repo-id <owner/repo>] [--verify <profile>] [--supersedes <handoffId>] [--supersession-reason <text>]
  node src/cli.mjs resume --store <dir> --repo <dir> --task <taskId> [--handoff <handoffId>] [--repo-id <owner/repo>] [--verify <profile>] [--format json|markdown]
  node src/cli.mjs list --store <dir> --repo <dir> [--task <taskId>] [--repo-id <owner/repo>] [--status active|superseded|all] [--branch <name>] [--agent <name>] [--limit <1..100>] [--format json|markdown]
  node src/cli.mjs doctor [--repo <dir>] [--store <dir>] [--relate-bin <path>] [--json] [--strict]
  node src/cli.mjs --help`);
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === "--help" || command === "-h" || flags.help) {
    printHelp();
    process.exit(0);
  }

  if (command === "record") {
    if (!flags.store || !flags.repo || !flags.input) {
      throw new Error("record requires --store, --repo, and --input");
    }
    const raw = JSON.parse(fs.readFileSync(path.resolve(flags.input), "utf8"));
    if (flags.supersedes !== undefined) {
      if (raw.supersedesHandoffId !== undefined && raw.supersedesHandoffId !== null && raw.supersedesHandoffId !== flags.supersedes) {
        throw new Error(
          `Supersession conflict: CLI --supersedes '${flags.supersedes}' differs from payload supersedesHandoffId '${raw.supersedesHandoffId}'`
        );
      }
      raw.supersedesHandoffId = flags.supersedes;
    }
    if (flags["supersession-reason"] !== undefined) {
      if (raw.supersessionReason !== undefined && raw.supersessionReason !== null && raw.supersessionReason !== flags["supersession-reason"]) {
        throw new Error(
          "Supersession conflict: CLI --supersession-reason differs from payload supersessionReason"
        );
      }
      raw.supersessionReason = flags["supersession-reason"];
    }
    const recorded = recordHandoff({
      storeDir: flags.store,
      repoRoot: flags.repo,
      payload: raw,
      repository: flags["repo-id"],
      validationProfile: flags.verify,
    });
    console.log(JSON.stringify({ ok: true, recorded }, null, 2));
    return;
  }

  if (command === "resume") {
    assertAllowedFlags(flags, RESUME_ALLOWED_FLAGS, "resume");
    const format = flags.format ?? "json";
    if (!ALLOWED_FORMATS.has(format)) {
      throw new CliUsageError(`Invalid --format '${format}': expected 'json' or 'markdown'`);
    }
    if (!flags.store || !flags.repo || !flags.task) {
      throw new Error("resume requires --store, --repo, and --task");
    }
    const result = resumeTaskViaReadOnlyMcp({
      storeDir: flags.store,
      repoRoot: flags.repo,
      taskId: flags.task,
      handoffId: flags.handoff ?? null,
      repository: flags["repo-id"],
      verifyProfile: flags.verify ?? null,
    });
    if (format === "markdown") {
      console.log(formatResumeMarkdown(result, { taskId: flags.task, repository: flags["repo-id"] }));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  if (command === "list") {
    assertAllowedFlags(flags, LIST_ALLOWED_FLAGS, "list");
    const format = flags.format ?? "json";
    if (!ALLOWED_FORMATS.has(format)) {
      throw new CliUsageError(`Invalid --format '${format}': expected 'json' or 'markdown'`);
    }
    const status = flags.status ?? "all";
    if (!ALLOWED_LIST_STATUSES.has(status)) {
      throw new CliUsageError(`Invalid --status '${status}': expected 'active', 'superseded', or 'all'`);
    }
    let limit = MAX_DETAIL_ROWS;
    if (flags.limit !== undefined) {
      if (!/^\d+$/.test(flags.limit)) {
        throw new CliUsageError(`Invalid --limit '${flags.limit}': must be an integer between 1 and ${MAX_DETAIL_ROWS}`);
      }
      limit = Number(flags.limit);
      if (limit < 1 || limit > MAX_DETAIL_ROWS) {
        throw new CliUsageError(`Invalid --limit '${flags.limit}': must be an integer between 1 and ${MAX_DETAIL_ROWS}`);
      }
    }
    if (!flags.store || !flags.repo) {
      throw new CliUsageError("list requires --store and --repo");
    }
    const result = listHandoffsViaReadOnlyMcp({
      storeDir: flags.store,
      repoRoot: flags.repo,
      taskId: flags.task ?? null,
      repository: flags["repo-id"],
      status,
      branch: flags.branch ?? null,
      agent: flags.agent ?? null,
      limit,
    });
    if (format === "markdown") {
      console.log(formatHandoffListMarkdown(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  if (command === "doctor") {
    assertAllowedFlags(flags, DOCTOR_ALLOWED_FLAGS, "doctor");
    const report = runDoctor({
      repo: flags.repo,
      store: flags.store,
      relateBin: flags["relate-bin"],
      strict: Boolean(flags.strict),
    });
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report));
    }
    process.exitCode = report.exitCode;
    return;
  }

  throw new CliUsageError(`Unknown command: ${command}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(err instanceof CliUsageError ? 2 : 1);
}
