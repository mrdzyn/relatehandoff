#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { recordHandoff } from "./recorder.mjs";
import { resumeTaskViaReadOnlyMcp } from "./mcp_client.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = rest[i + 1];
      if (!val || val.startsWith("--")) {
        throw new Error(`Missing value for flag --${key}`);
      }
      flags[key] = val;
      i++;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }
  return { command, flags };
}

function printHelp() {
  console.log(`RelateHandoff CLI (RH-P1)

Usage:
  node src/cli.mjs record --store <dir> --repo <dir> --input <json-file>
  node src/cli.mjs resume --store <dir> --repo <dir> --task <taskId>
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
    const recorded = recordHandoff({
      storeDir: flags.store,
      repoRoot: flags.repo,
      payload: raw,
    });
    console.log(JSON.stringify({ ok: true, recorded }, null, 2));
    return;
  }

  if (command === "resume") {
    if (!flags.store || !flags.repo || !flags.task) {
      throw new Error("resume requires --store, --repo, and --task");
    }
    const result = resumeTaskViaReadOnlyMcp({
      storeDir: flags.store,
      repoRoot: flags.repo,
      taskId: flags.task,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
