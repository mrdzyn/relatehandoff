#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordHandoff } from "../src/recorder.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(__dirname, "synthetic_handoff.json");
const storeDir = path.join(__dirname, "example-store");

const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
fs.rmSync(storeDir, { recursive: true, force: true });

const recorded = recordHandoff({
  storeDir,
  repoRoot,
  payload,
  allowFixtureCheckout: true,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      storeDir: "examples/example-store",
      handoffId: recorded.handoffId,
      taskId: recorded.taskId,
      headSha: recorded.headSha,
    },
    null,
    2
  )
);
