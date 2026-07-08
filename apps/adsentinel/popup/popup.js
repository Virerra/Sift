import { evaluateAd, FLAG_TYPES } from "../lib/heuristics.js";

// Set this once you've deployed apps/addashboard to Vercel — e.g.
// "https://your-project.vercel.app/api/reports". Left blank, the Share
// button explains that clearly instead of failing silently against a
// nonexistent endpoint.
const ADDASHBOARD_URL = "https://sift-addashboard.vercel.app/api/reports";

const scanBtn = document.getElementById("scanBtn");
const statusText = document.getElementById("statusText");
const summaryEl = document.getElementById("summary");
const adCountEl = document.getElementById("adCount");
const flagCountEl = document.getElementById("flagCount");
const flagListEl = document.getElementById("flagList");
const emptyStateEl = document.getElementById("emptyState");
const actionRowEl = document.getElementById("actionRow");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const shareRowEl = document.getElementById("shareRow");
const shareBtn = document.getElementById("shareBtn");
const shareStatusEl = document.getElementById("shareStatus");

// Holds the most recent scan+evaluation so export buttons can reuse it
// without re-scanning.
let lastReport = null;

const FLAG_LABELS = {
  [FLAG_TYPES.DARK_PATTERN]: "Dark pattern",
  [FLAG_TYPES.AGE_MISMATCH]: "Age-restricted category",
  [FLAG_TYPES.UNKNOWN_NETWORK]: "Unverified network",
  [FLAG_TYPES.MISSING_LABEL]: "No accessible text",
  [FLAG_TYPES.NEEDS_REVIEW]: "Needs your review"
};

scanBtn.addEventListener("click", runScan);

async function runScan() {
  setBusy(true, "Scanning…");
  flagListEl.innerHTML = "";
  emptyStateEl.hidden = true;
  summaryEl.hidden = true;
  actionRowEl.hidden = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) {
      setBusy(false, "Open a regular web page first.");
      return;
    }

    // Inject the extraction script, then call the function it defines.
    // Two calls: files can't return a value directly, so we grab the
    // return value with a tiny follow-up `func` call.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/detector.js"]
    });
    const [{ result: payload }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__adSentinelScan()
    });

    const flaggedAds = payload.ads
      .map((ad) => ({
        ad,
        flags: evaluateAd(ad, { childDirectedPage: payload.childDirectedPage })
      }))
      .filter((entry) => entry.flags.length > 0);

    lastReport = {
      url: payload.url,
      scannedAt: payload.scannedAt,
      childDirectedPage: payload.childDirectedPage,
      adCount: payload.adCount,
      flagged: flaggedAds
    };

    render(lastReport);
    chrome.runtime.sendMessage({
      type: "ADSENTINEL_SET_BADGE",
      tabId: tab.id,
      count: flaggedAds.length
    });
    setBusy(false, `Scanned ${new URL(payload.url).host}`);
  } catch (err) {
    console.error(err);
    setBusy(false, "Couldn't scan this page (some pages, like the Chrome Web Store, block extensions).");
  }
}

function render(report) {
  adCountEl.textContent = report.adCount;
  flagCountEl.textContent = report.flagged.length;
  summaryEl.hidden = false;
  shareStatusEl.textContent = "";

  if (report.flagged.length === 0) {
    emptyStateEl.hidden = false;
    actionRowEl.hidden = true;
    shareRowEl.hidden = true;
    return;
  }

  for (const entry of report.flagged) {
    for (const flag of entry.flags) {
      const li = document.createElement("li");
      li.className = "flag-item";
      li.innerHTML = `
        <span class="flag-type">${FLAG_LABELS[flag.type] || flag.type}</span>
        <span class="flag-reason">${escapeHtml(flag.reason)}</span>
        <span class="flag-locator">${escapeHtml(entry.ad.locator)} · ${escapeHtml(entry.ad.host || "same-origin")}</span>
      `;
      flagListEl.appendChild(li);
    }
  }
  actionRowEl.hidden = false;
  shareRowEl.hidden = false;
}

function setBusy(isBusy, message) {
  scanBtn.disabled = isBusy;
  statusText.textContent = message || "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

exportJsonBtn.addEventListener("click", () => {
  if (!lastReport) return;
  download(
    `adsentinel-report-${Date.now()}.json`,
    JSON.stringify(lastReport, null, 2),
    "application/json"
  );
});

exportCsvBtn.addEventListener("click", () => {
  if (!lastReport) return;
  const rows = [["url", "scannedAt", "flagType", "reason", "locator", "host"]];
  for (const entry of lastReport.flagged) {
    for (const flag of entry.flags) {
      rows.push([
        lastReport.url,
        lastReport.scannedAt,
        flag.type,
        flag.reason,
        entry.ad.locator,
        entry.ad.host || ""
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  download(`adsentinel-report-${Date.now()}.csv`, csv, "text/csv");
});

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Mirrors packages/schema/report.js's platformFromHostname — duplicated
// rather than imported, same reasoning as detector.js/heuristics.js not
// cross-importing: this is a five-line function, not worth setting up a
// second sync pipeline for. If it ever needs to grow past "check four
// known suffixes," that's the signal to reconsider.
const KNOWN_PLATFORMS = ["youtube.com", "facebook.com", "instagram.com", "tiktok.com"];
function platformFromHostname(hostname) {
  const host = (hostname || "").toLowerCase();
  return KNOWN_PLATFORMS.find((p) => host.endsWith(p)) || "other";
}

// Builds exactly the safe, aggregate-only shape defined by
// packages/schema/report.js — flag types and categories only. Never ad
// text, never the page URL, never anything from the DOM locator. See that
// schema's file header for the full reasoning.
function buildDashboardSubmission(report) {
  return {
    schemaVersion: 1,
    platform: platformFromHostname(new URL(report.url).hostname),
    childDirectedPage: report.childDirectedPage,
    submittedAt: new Date().toISOString(),
    flaggedAds: report.flagged.map((entry) => ({
      flags: entry.flags.map((f) =>
        f.category ? { type: f.type, category: f.category } : { type: f.type }
      )
    }))
  };
}

shareBtn.addEventListener("click", async () => {
  if (!lastReport) return;

  if (!ADDASHBOARD_URL) {
    shareStatusEl.textContent = "AdDashboard isn't deployed yet — see popup.js for how to set this up.";
    return;
  }

  shareBtn.disabled = true;
  shareStatusEl.textContent = "Sending…";

  try {
    const submission = buildDashboardSubmission(lastReport);
    const res = await fetch(ADDASHBOARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });

    if (res.ok) {
      shareStatusEl.textContent = "Shared. Thank you.";
    } else {
      shareStatusEl.textContent = `AdDashboard rejected this (${res.status}) — the schema may have changed.`;
    }
  } catch (err) {
    console.error(err);
    shareStatusEl.textContent = "Couldn't reach AdDashboard — check your connection.";
  } finally {
    shareBtn.disabled = false;
  }
});
