#!/usr/bin/env node

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { auditInventory } from "../lib/auditInventory.js";
import { parseInputFile } from "../lib/parseInput.js";
import { formatTextReport, formatCsvReport } from "../lib/formatReport.js";

const HELP = `
SIFT AuditTool — run the shared detection ruleset against a bulk ad inventory.

Usage:
  audit-tool <input-file> [options]

Input:
  A .json (array) or .jsonl (newline-delimited) file of ad records.
  Only "text" is realistically required — everything else has a sane
  default. Full field reference and a worked example in README.md.

Options:
  --format <text|json|csv>   Output format (default: text)
  --output <file>            Write the full report to a file
  --child-directed           Default childDirected=true for any record
                              that doesn't specify its own value
  --fail-on-flags <n>        Exit 1 if more than n ads are flagged
                              (omit this flag to always exit 0 — useful
                              for CI gates once you know your baseline)
  --max-examples <n>         Cap flagged examples in text output (default 20)
  --help                     Show this message
`;

const { values, positionals } = parseArgs({
  options: {
    format: { type: "string", default: "text" },
    output: { type: "string" },
    "child-directed": { type: "boolean", default: false },
    "fail-on-flags": { type: "string" },
    "max-examples": { type: "string", default: "20" },
    help: { type: "boolean", default: false }
  },
  allowPositionals: true
});

if (values.help || positionals.length === 0) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

const inputPath = positionals[0];

let records;
try {
  records = parseInputFile(inputPath);
} catch (err) {
  console.error(`Error reading ${inputPath}: ${err.message}`);
  process.exit(2);
}

if (values["child-directed"]) {
  // Object spread: the record's own field (if present, even `false`)
  // always wins over this default, since it's spread second.
  records = records.map((r) => ({ childDirected: true, ...r }));
}

const report = auditInventory(records);

const jsonOutput = () => JSON.stringify(report, null, 2);
let printed;
if (values.format === "json") {
  printed = jsonOutput();
} else if (values.format === "csv") {
  printed = formatCsvReport(report);
} else {
  printed = formatTextReport(report, { maxExamples: parseInt(values["max-examples"], 10) || 20 });
}

if (values.output) {
  writeFileSync(values.output, values.format === "json" ? jsonOutput() : printed);
  console.log(`Report written to ${values.output}`);
  if (values.format !== "json") console.log("\n" + printed);
} else {
  console.log(printed);
}

if (values["fail-on-flags"] !== undefined) {
  const threshold = parseInt(values["fail-on-flags"], 10);
  if (Number.isNaN(threshold)) {
    console.error(`--fail-on-flags expects a number, got "${values["fail-on-flags"]}"`);
    process.exit(2);
  }
  if (report.totalFlagged > threshold) {
    process.exit(1);
  }
}
