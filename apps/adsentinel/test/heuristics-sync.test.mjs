// Confirms apps/adsentinel/lib/heuristics.js actually matches
// packages/heuristics/heuristics.js. This is the safety net for "someone
// edited the package and forgot to run npm run sync" — without it, a
// stale copy would sit in lib/ silently, and AdSentinel would ship a
// different ruleset than the one that just passed the package's own tests.
//
// Deliberately does NOT run `npm run sync` itself before checking — that
// would guarantee a pass regardless of whether anyone actually remembered
// to sync, which defeats the point.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageSource = join(__dirname, "..", "..", "..", "packages", "heuristics", "heuristics.js");
const extensionCopy = join(__dirname, "..", "lib", "heuristics.js");

test("lib/heuristics.js is in sync with packages/heuristics/heuristics.js", () => {
  const source = readFileSync(packageSource, "utf8");
  const copy = readFileSync(extensionCopy, "utf8");

  // The copy has a warning header prepended by sync-heuristics.js — strip
  // everything before the first real line of source to compare fairly.
  const copyBody = copy.slice(copy.indexOf(source.slice(0, 40)));

  assert.equal(
    copyBody,
    source,
    "apps/adsentinel/lib/heuristics.js doesn't match packages/heuristics/heuristics.js — " +
    "run `npm run sync` from apps/adsentinel before committing."
  );
});
