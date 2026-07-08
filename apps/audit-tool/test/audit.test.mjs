import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { auditInventory } from "../lib/auditInventory.js";
import { parseInputFile } from "../lib/parseInput.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "..", "fixtures", "sample-inventory.json");
const cliPath = join(__dirname, "..", "bin", "audit.js");

function tmpFile(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "audit-tool-test-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// ---------- Library: parseInputFile ----------

test("parseInputFile reads the sample fixture as a 6-record array", () => {
  const records = parseInputFile(fixturePath);
  assert.equal(records.length, 6);
});

test("parseInputFile reads .jsonl as newline-delimited records", () => {
  const path = tmpFile("test.jsonl", '{"id":"a","text":"one"}\n{"id":"b","text":"two"}\n');
  const records = parseInputFile(path);
  assert.equal(records.length, 2);
  assert.equal(records[1].id, "b");
});

test("parseInputFile throws a clear error on invalid JSON, not a raw parser crash", () => {
  const path = tmpFile("bad.json", "not valid json{{{");
  assert.throws(() => parseInputFile(path), /Invalid JSON/);
});

test("parseInputFile throws a clear error when the JSON isn't an array", () => {
  const path = tmpFile("obj.json", '{"not":"an array"}');
  assert.throws(() => parseInputFile(path), /must contain a JSON array/);
});

// ---------- Library: auditInventory ----------

test("auditInventory matches the same 6-scanned/4-flagged pattern as AdSentinel's browser fixture", () => {
  const records = parseInputFile(fixturePath);
  const report = auditInventory(records);
  assert.equal(report.totalScanned, 6);
  assert.equal(report.totalFlagged, 4);
});

test("auditInventory computes hasAccessibleText automatically when the field is omitted", () => {
  const report = auditInventory([{ id: "x", text: "" }]);
  assert.ok(report.results[0].flags.some((f) => f.type === "missing_accessible_text"));
});

test("auditInventory respects an explicit hasAccessibleText override even if text is empty", () => {
  const report = auditInventory([{ id: "x", text: "", hasAccessibleText: true }]);
  assert.ok(!report.results[0].flags.some((f) => f.type === "missing_accessible_text"));
});

test("auditInventory defaults host to null (not the record's platform) for native-ad accuracy", () => {
  const report = auditInventory([{ id: "x", text: "clean ad copy" }]);
  assert.equal(report.results[0].flags.length, 0, "no host means no unverified-network false positive");
});

test("auditInventory summary counts are internally consistent with totalFlagged", () => {
  const records = parseInputFile(fixturePath);
  const report = auditInventory(records);
  const flagTypeSum = report.summary.byFlagType.reduce((s, r) => s + r.count, 0);
  const actualFlagCount = report.results.reduce((s, r) => s + r.flags.length, 0);
  assert.equal(flagTypeSum, actualFlagCount, "summary.byFlagType should sum to the total number of flag instances");
});

test("auditInventory correctly evaluates hand-written inventory data it has never seen, not just the bundled fixture", () => {
  // Deliberately NOT reusing fixtures/sample-inventory.json — a tool that
  // only works on its own demo data isn't proven to work on anything.
  const records = [
    { id: "ad-4471", platform: "tiktok.com", text: "Meet singles near you tonight", ariaLabel: "Sponsored" },
    { id: "ad-4472", platform: "tiktok.com", text: "25% off summer sandals, free shipping", ariaLabel: "Sponsored" },
    { id: "ad-4473", platform: "other", text: "Congratulations, you've been selected for a free iPhone!", host: "sketchy-adnet.biz" },
    { id: "ad-4474", platform: "youtube.com", text: "New cookbook out now — order today" }
  ];

  const report = auditInventory(records);
  assert.equal(report.totalScanned, 4);
  assert.equal(report.totalFlagged, 2);

  const byId = Object.fromEntries(report.results.map((r) => [r.id, r.flags.map((f) => f.type)]));
  assert.deepEqual(byId["ad-4471"], ["age_mismatch_category"], "dating category correctly caught");
  assert.deepEqual(byId["ad-4472"], [], "genuinely clean ad correctly left alone");
  assert.deepEqual(
    byId["ad-4473"].sort(),
    ["dark_pattern", "unverified_ad_network"].sort(),
    "fake-prize dark pattern AND the unrecognized host both caught on the same ad"
  );
  assert.deepEqual(byId["ad-4474"], [], "second genuinely clean ad correctly left alone");
});

// ---------- CLI integration (spawns the real binary) ----------

test("CLI runs against the fixture and exits 0 by default even with flags present", () => {
  const output = execFileSync("node", [cliPath, fixturePath], { encoding: "utf8" });
  assert.match(output, /scanned 6 ads, 4 flagged/);
});

test("CLI --format json produces valid, parseable JSON with correct totals", () => {
  const output = execFileSync("node", [cliPath, fixturePath, "--format", "json"], { encoding: "utf8" });
  const parsed = JSON.parse(output);
  assert.equal(parsed.totalFlagged, 4);
});

test("CLI --format csv produces a header row plus one row per flag instance", () => {
  const output = execFileSync("node", [cliPath, fixturePath, "--format", "csv"], { encoding: "utf8" });
  const lines = output.trim().split("\n");
  assert.equal(lines[0], "id,platform,flagType,category,reason");
  assert.equal(lines.length, 1 + 5, "5 total flag instances across the 4 flagged ads in the fixture");
});

test("CLI exits 1 when totalFlagged exceeds --fail-on-flags", () => {
  try {
    execFileSync("node", [cliPath, fixturePath, "--fail-on-flags", "0"], { encoding: "utf8" });
    assert.fail("expected the CLI to exit non-zero");
  } catch (err) {
    assert.equal(err.status, 1);
  }
});

test("CLI exits 0 when totalFlagged is within --fail-on-flags", () => {
  const output = execFileSync("node", [cliPath, fixturePath, "--fail-on-flags", "10"], { encoding: "utf8" });
  assert.match(output, /scanned 6 ads/);
});

test("CLI --child-directed sets the default but a record's own field still wins", () => {
  const path = tmpFile("cd.json", JSON.stringify([{ id: "y", text: "", childDirected: false }]));
  const output = execFileSync("node", [cliPath, path, "--child-directed", "--format", "json"], { encoding: "utf8" });
  const parsed = JSON.parse(output);
  assert.ok(!parsed.results[0].flags.some((f) => f.type === "needs_human_review"));
});

test("CLI --output writes the report to a file", () => {
  const outPath = join(mkdtempSync(join(tmpdir(), "audit-tool-out-")), "report.json");
  execFileSync("node", [cliPath, fixturePath, "--format", "json", "--output", outPath], { encoding: "utf8" });
  const written = JSON.parse(execFileSync("cat", [outPath], { encoding: "utf8" }));
  assert.equal(written.totalFlagged, 4);
});

test("CLI exits 2 with a clear message on invalid input, not a stack trace", () => {
  const path = tmpFile("bad.json", "not valid json{{{");
  try {
    execFileSync("node", [cliPath, path], { encoding: "utf8" });
    assert.fail("expected the CLI to exit non-zero");
  } catch (err) {
    assert.equal(err.status, 2);
    assert.match(err.stderr, /Invalid JSON/);
  }
});

test("CLI with no arguments exits 1 and prints usage", () => {
  try {
    execFileSync("node", [cliPath], { encoding: "utf8" });
    assert.fail("expected the CLI to exit non-zero");
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stdout, /Usage:/);
  }
});
