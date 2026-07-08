import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", ".data");

function freshDataDir() {
  rmSync(dataDir, { recursive: true, force: true });
}

// ---------- adminAuth ----------

test("isAuthorized rejects when ADMIN_TOKEN isn't set at all", async () => {
  const { isAuthorized } = await import("../lib/adminAuth.js");
  delete process.env.ADMIN_TOKEN;
  const req = { headers: new Headers({ Authorization: "Bearer anything" }) };
  assert.equal(isAuthorized(req), false);
});

test("isAuthorized rejects a missing Authorization header", async () => {
  const { isAuthorized } = await import("../lib/adminAuth.js");
  process.env.ADMIN_TOKEN = "correct-token";
  const req = { headers: new Headers() };
  assert.equal(isAuthorized(req), false);
});

test("isAuthorized rejects the wrong token", async () => {
  const { isAuthorized } = await import("../lib/adminAuth.js");
  process.env.ADMIN_TOKEN = "correct-token";
  const req = { headers: new Headers({ Authorization: "Bearer wrong-token" }) };
  assert.equal(isAuthorized(req), false);
});

test("isAuthorized accepts the correct token", async () => {
  const { isAuthorized } = await import("../lib/adminAuth.js");
  process.env.ADMIN_TOKEN = "correct-token";
  const req = { headers: new Headers({ Authorization: "Bearer correct-token" }) };
  assert.equal(isAuthorized(req), true);
});

test("isAuthorized doesn't throw on a token of a different length (timingSafeEqual guard)", async () => {
  const { isAuthorized } = await import("../lib/adminAuth.js");
  process.env.ADMIN_TOKEN = "a-fairly-long-token-value";
  const req = { headers: new Headers({ Authorization: "Bearer short" }) };
  assert.doesNotThrow(() => isAuthorized(req));
  assert.equal(isAuthorized(req), false);
});

// ---------- db: listReports / deleteReports (file-backed dev store) ----------

test("listReports groups rows by reportId, not by individual flag row", async () => {
  freshDataDir();
  process.env.ADMIN_TOKEN = "x";
  delete process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  const { insertReport, listReports } = await import(`../lib/db.js?t=${Date.now()}`);

  await insertReport({
    platform: "youtube.com",
    childDirectedPage: true,
    submittedAt: "2026-01-01T00:00:00.000Z",
    flaggedAds: [{ flags: [{ type: "dark_pattern" }, { type: "missing_accessible_text" }] }]
  });

  const reports = await listReports();
  assert.equal(reports.length, 1, "one report, even though it carries two flags across two rows");
  assert.equal(reports[0].flagTypes.length, 2);
  freshDataDir();
});

test("deleteReports by platform only removes matching reports and returns the row count", async () => {
  freshDataDir();
  const { insertReport, listReports, deleteReports } = await import(`../lib/db.js?t=${Date.now()}`);

  await insertReport({ platform: "youtube.com", childDirectedPage: false, submittedAt: "2026-01-01T00:00:00.000Z", flaggedAds: [{ flags: [{ type: "dark_pattern" }] }] });
  await insertReport({ platform: "other", childDirectedPage: false, submittedAt: "2026-01-01T00:05:00.000Z", flaggedAds: [{ flags: [{ type: "missing_accessible_text" }] }] });
  await insertReport({ platform: "other", childDirectedPage: false, submittedAt: "2026-01-01T00:06:00.000Z", flaggedAds: [{ flags: [{ type: "unverified_ad_network" }] }] });

  const deletedRows = await deleteReports({ platform: "other" });
  assert.equal(deletedRows, 2);

  const remaining = await listReports();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].platform, "youtube.com");
  freshDataDir();
});

test("deleteReports by reportId removes exactly that report and no others", async () => {
  freshDataDir();
  const { insertReport, listReports, deleteReports } = await import(`../lib/db.js?t=${Date.now()}`);

  await insertReport({ platform: "youtube.com", childDirectedPage: false, submittedAt: "2026-01-01T00:00:00.000Z", flaggedAds: [{ flags: [{ type: "dark_pattern" }] }] });
  await insertReport({ platform: "tiktok.com", childDirectedPage: false, submittedAt: "2026-01-01T00:05:00.000Z", flaggedAds: [{ flags: [{ type: "unverified_ad_network" }] }] });

  const before = await listReports();
  const targetId = before.find((r) => r.platform === "tiktok.com").reportId;

  const deletedRows = await deleteReports({ reportId: targetId });
  assert.equal(deletedRows, 1);

  const remaining = await listReports();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].platform, "youtube.com");
  freshDataDir();
});

test("deleteReports with all:true removes everything", async () => {
  freshDataDir();
  const { insertReport, listReports, deleteReports } = await import(`../lib/db.js?t=${Date.now()}`);

  await insertReport({ platform: "youtube.com", childDirectedPage: false, submittedAt: "2026-01-01T00:00:00.000Z", flaggedAds: [{ flags: [{ type: "dark_pattern" }] }] });
  await insertReport({ platform: "other", childDirectedPage: false, submittedAt: "2026-01-01T00:05:00.000Z", flaggedAds: [{ flags: [{ type: "missing_accessible_text" }] }] });

  const deletedRows = await deleteReports({ all: true });
  assert.equal(deletedRows, 2);

  const remaining = await listReports();
  assert.equal(remaining.length, 0);
  freshDataDir();
});

test("deleteReports with no target specified deletes nothing (route-level validation is the real guard, this is a defense-in-depth check)", async () => {
  freshDataDir();
  const { insertReport, listReports, deleteReports } = await import(`../lib/db.js?t=${Date.now()}`);

  await insertReport({ platform: "youtube.com", childDirectedPage: false, submittedAt: "2026-01-01T00:00:00.000Z", flaggedAds: [{ flags: [{ type: "dark_pattern" }] }] });

  const deletedRows = await deleteReports({});
  assert.equal(deletedRows, 0);

  const remaining = await listReports();
  assert.equal(remaining.length, 1, "nothing should have been removed");
  freshDataDir();
});
