import { readFileSync } from "node:fs";

/**
 * Reads an ad-inventory file. Two supported formats:
 *  - .json  — a single JSON array of records
 *  - .jsonl — one JSON object per line (common for large exports, since
 *             it can be streamed/appended without rewriting the whole file)
 *
 * CSV isn't supported yet — ad copy legitimately contains commas and
 * quotes, and a hand-rolled parser for that is exactly the kind of thing
 * that looks fine in a demo and breaks on real data. Worth adding
 * properly (a real CSV parser, not a split(",")) if someone's actual
 * inventory export needs it — not simulated here without a real case to
 * test against.
 */
export function parseInputFile(path) {
  const raw = readFileSync(path, "utf8").trim();

  if (path.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, i) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          throw new Error(`Invalid JSON on line ${i + 1} of ${path}: ${err.message}`);
        }
      });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON array of ad records (use .jsonl for newline-delimited records instead)`);
  }

  return parsed;
}
