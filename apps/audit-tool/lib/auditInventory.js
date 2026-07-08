/**
 * The actual point of AuditTool: everything below is a thin wrapper
 * around @sift/heuristics, imported directly since Node has none of the
 * "extension can only load its own folder" constraint that makes
 * AdSentinel need a synced copy. One ruleset, no fork, no drift — that's
 * the entire reason this app was cheap to build once packages/heuristics
 * existed.
 */

import { evaluateAd } from "@sift/heuristics";

/**
 * @param {Array<object>} records - raw ad records. Only `text` is
 *   realistically required; everything else has a sane default. See
 *   README.md for the full field reference.
 * @returns {object} report - see formatReport.js for how this gets
 *   rendered as text/CSV, or just JSON.stringify it directly.
 */
export function auditInventory(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("auditInventory expects an array of ad records");
  }

  const results = records.map((record, index) => {
    const text = record.text || "";
    const altText = record.altText || "";
    const ariaLabel = record.ariaLabel || "";

    const ad = {
      text,
      altText,
      ariaLabel,
      // Same convention as detector.js: host is only meaningful for a
      // real third-party network relationship. If the input doesn't say,
      // default to null rather than guessing — an unset host silently
      // becoming "unverified network" would be a false positive on every
      // record that just didn't bother filling the field in.
      host: record.host ?? null,
      hasAccessibleText:
        record.hasAccessibleText ?? Boolean(text.trim() || altText.trim() || ariaLabel.trim())
    };

    const flags = evaluateAd(ad, { childDirectedPage: Boolean(record.childDirected) });

    return {
      id: record.id ?? String(index),
      platform: record.platform ?? "unknown",
      flags
    };
  });

  const flaggedResults = results.filter((r) => r.flags.length > 0);

  return {
    scannedAt: new Date().toISOString(),
    totalScanned: records.length,
    totalFlagged: flaggedResults.length,
    results,
    summary: buildSummary(results)
  };
}

function buildSummary(results) {
  const byPlatform = new Map();
  const byFlagType = new Map();
  const byCategory = new Map();

  for (const r of results) {
    for (const f of r.flags) {
      byPlatform.set(r.platform, (byPlatform.get(r.platform) || 0) + 1);
      byFlagType.set(f.type, (byFlagType.get(f.type) || 0) + 1);
      if (f.category) byCategory.set(f.category, (byCategory.get(f.category) || 0) + 1);
    }
  }

  const toSortedArray = (map) =>
    [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

  return {
    byPlatform: toSortedArray(byPlatform),
    byFlagType: toSortedArray(byFlagType),
    byCategory: toSortedArray(byCategory)
  };
}
