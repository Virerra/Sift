const FLAG_LABELS = {
  dark_pattern: "Dark pattern",
  age_mismatch_category: "Age-restricted category",
  unverified_ad_network: "Unverified network",
  missing_accessible_text: "No accessible text",
  needs_human_review: "Needs review"
};

export function formatTextReport(report, { maxExamples = 20 } = {}) {
  const lines = [];
  lines.push(`SIFT AuditTool — scanned ${report.totalScanned} ads, ${report.totalFlagged} flagged`);
  lines.push("");

  if (report.summary.byFlagType.length) {
    lines.push("By flag type:");
    for (const { key, count } of report.summary.byFlagType) {
      lines.push(`  ${FLAG_LABELS[key] || key}: ${count}`);
    }
    lines.push("");
  }

  if (report.summary.byCategory.length) {
    lines.push("By category:");
    for (const { key, count } of report.summary.byCategory) lines.push(`  ${key}: ${count}`);
    lines.push("");
  }

  if (report.summary.byPlatform.length) {
    lines.push("By platform:");
    for (const { key, count } of report.summary.byPlatform) lines.push(`  ${key}: ${count}`);
    lines.push("");
  }

  const flaggedResults = report.results.filter((r) => r.flags.length > 0);
  if (flaggedResults.length) {
    lines.push(`Flagged ads (showing up to ${maxExamples} of ${flaggedResults.length}):`);
    for (const r of flaggedResults.slice(0, maxExamples)) {
      lines.push(`  [${r.id}] ${r.platform}`);
      for (const f of r.flags) {
        const label = FLAG_LABELS[f.type] || f.type;
        const category = f.category ? ` (${f.category})` : "";
        lines.push(`      - ${label}${category}: ${f.reason}`);
      }
    }
    if (flaggedResults.length > maxExamples) {
      lines.push(`  ...and ${flaggedResults.length - maxExamples} more`);
    }
  }

  return lines.join("\n");
}

export function formatCsvReport(report) {
  const rows = [["id", "platform", "flagType", "category", "reason"]];
  for (const r of report.results) {
    for (const f of r.flags) {
      rows.push([r.id, r.platform, f.type, f.category || "", f.reason]);
    }
  }
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
