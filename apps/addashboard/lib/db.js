/**
 * Storage adapter for flag events. Two backends behind one interface:
 *
 *  - Postgres, used whenever POSTGRES_URL or DATABASE_URL is set. This is
 *    the real path — see the deploy README for provisioning a Vercel
 *    Postgres (Neon-backed) database and linking it to this project.
 *  - In-memory, used otherwise. Purely for local development before
 *    you've set up a database — `npm run dev` works out of the box, but
 *    data doesn't survive a restart and isn't shared across serverless
 *    function instances in production. Never used unless neither env var
 *    is set, so it can't accidentally become the "real" backend.
 *
 * Schema: one row per flag INSTANCE, not per report. A report with 3
 * flagged ads each carrying 1-2 flags becomes several rows here, all
 * sharing a reportId — this trades a slightly bigger table for trivial
 * aggregation queries (no JSON unnesting needed for every chart).
 */

import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;

let sql = null;
let schemaReady = null;

function getSql() {
  if (!sql) {
    sql = postgres(connectionString, { ssl: "require" });
  }
  return sql;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getSql()`
      CREATE TABLE IF NOT EXISTS flag_events (
        id BIGSERIAL PRIMARY KEY,
        report_id UUID NOT NULL,
        platform TEXT NOT NULL,
        child_directed BOOLEAN NOT NULL,
        flag_type TEXT NOT NULL,
        category TEXT,
        submitted_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }
  await schemaReady;
}

// Dev-only fallback store, used only when neither POSTGRES_URL nor
// DATABASE_URL is set. Deliberately a JSON file on disk, NOT a
// module-level JS variable — Next.js/Turbopack dev mode can give route
// handlers (app/api/.../route.js) and server components (app/page.js)
// separate instances of the same imported module, so a plain in-memory
// array silently fails to be shared between them (confirmed by testing:
// POSTs succeeded and GET /api/reports saw them, but the dashboard page
// itself kept showing zero). A file on disk sidesteps that entirely since
// both entry points read/write the same real file regardless of how the
// module graph gets split. Gitignored; never used in production.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_DATA_FILE = join(__dirname, "..", ".data", "flag-events.dev.json");

function readDevStore() {
  if (!existsSync(DEV_DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DEV_DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeDevStore(rows) {
  mkdirSync(dirname(DEV_DATA_FILE), { recursive: true });
  writeFileSync(DEV_DATA_FILE, JSON.stringify(rows));
}

function flattenReport(report) {
  const reportId = randomUUID();
  const rows = [];
  for (const ad of report.flaggedAds) {
    for (const flag of ad.flags) {
      rows.push({
        reportId,
        platform: report.platform,
        childDirected: report.childDirectedPage,
        flagType: flag.type,
        category: flag.category ?? null,
        submittedAt: report.submittedAt
      });
    }
  }
  return rows;
}

export async function insertReport(report) {
  const rows = flattenReport(report);
  if (rows.length === 0) return;

  if (connectionString) {
    await ensureSchema();
    const db = getSql();
    await db`
      INSERT INTO flag_events ${db(
        rows.map((r) => ({
          report_id: r.reportId,
          platform: r.platform,
          child_directed: r.childDirected,
          flag_type: r.flagType,
          category: r.category,
          submitted_at: r.submittedAt
        })),
        "report_id", "platform", "child_directed", "flag_type", "category", "submitted_at"
      )}
    `;
  } else {
    const existing = readDevStore();
    writeDevStore([...existing, ...rows]);
  }
}

export async function getAggregateStats() {
  if (connectionString) {
    await ensureSchema();
    const db = getSql();
    const [totals] = await db`
      SELECT COUNT(DISTINCT report_id)::int AS report_count, COUNT(*)::int AS flag_count FROM flag_events
    `;
    const byPlatform = await db`
      SELECT platform, COUNT(*)::int AS count FROM flag_events GROUP BY platform ORDER BY count DESC
    `;
    const byFlagType = await db`
      SELECT flag_type, COUNT(*)::int AS count FROM flag_events GROUP BY flag_type ORDER BY count DESC
    `;
    const byCategory = await db`
      SELECT category, COUNT(*)::int AS count FROM flag_events WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC
    `;
    const childDirectedShare = await db`
      SELECT child_directed, COUNT(DISTINCT report_id)::int AS count FROM flag_events GROUP BY child_directed
    `;
    return shapeStats({ totals, byPlatform, byFlagType, byCategory, childDirectedShare });
  }

  return shapeStats(computeMemoryStats());
}

function computeMemoryStats() {
  const store = readDevStore();
  const reportIds = new Set(store.map((r) => r.reportId));
  const totals = { report_count: reportIds.size, flag_count: store.length };
  const count = (rows, key) => {
    const map = new Map();
    for (const r of rows) map.set(r[key], (map.get(r[key]) || 0) + 1);
    return [...map.entries()].map(([k, count]) => ({ [key]: k, count })).sort((a, b) => b.count - a.count);
  };
  const byPlatform = count(store, "platform");
  const byFlagType = count(store.map((r) => ({ flag_type: r.flagType })), "flag_type");
  const byCategory = count(store.filter((r) => r.category).map((r) => ({ category: r.category })), "category");

  const cdMap = new Map();
  for (const r of store) {
    const key = r.childDirected;
    if (!cdMap.has(key)) cdMap.set(key, new Set());
    cdMap.get(key).add(r.reportId);
  }
  const childDirectedShare = [...cdMap.entries()].map(([child_directed, ids]) => ({
    child_directed,
    count: ids.size
  }));

  return { totals, byPlatform, byFlagType, byCategory, childDirectedShare };
}

function shapeStats({ totals, byPlatform, byFlagType, byCategory, childDirectedShare }) {
  return {
    reportCount: totals.report_count,
    flagCount: totals.flag_count,
    byPlatform: byPlatform.map((r) => ({ platform: r.platform, count: r.count })),
    byFlagType: byFlagType.map((r) => ({ flagType: r.flag_type, count: r.count })),
    byCategory: byCategory.map((r) => ({ category: r.category, count: r.count })),
    childDirectedShare: childDirectedShare.map((r) => ({ childDirected: r.child_directed, count: r.count })),
    // Surfaced so the dashboard UI can be honest about which backend
    // produced these numbers, instead of presenting dev/demo data as if
    // it were the real public dataset.
    usingDatabase: Boolean(connectionString)
  };
}
