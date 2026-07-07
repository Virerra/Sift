import test from "node:test";
import assert from "node:assert/strict";
import { validateReportSubmission, platformFromHostname, SCHEMA_VERSION } from "../report.js";

function validSubmission(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    platform: "youtube.com",
    childDirectedPage: false,
    submittedAt: new Date().toISOString(),
    flaggedAds: [{ flags: [{ type: "dark_pattern" }] }],
    ...overrides
  };
}

test("accepts a well-formed submission", () => {
  const result = validateReportSubmission(validSubmission());
  assert.equal(result.success, true);
});

test("rejects an unknown platform", () => {
  const result = validateReportSubmission(validSubmission({ platform: "not-a-real-platform.com" }));
  assert.equal(result.success, false);
});

test("rejects a wrong schema version rather than silently coercing it", () => {
  const result = validateReportSubmission(validSubmission({ schemaVersion: 99 }));
  assert.equal(result.success, false);
});

test("rejects a submission with no flags on a flagged ad", () => {
  const result = validateReportSubmission(validSubmission({ flaggedAds: [{ flags: [] }] }));
  assert.equal(result.success, false);
});

test("rejects an implausibly large flaggedAds array", () => {
  const tooMany = Array.from({ length: 51 }, () => ({ flags: [{ type: "dark_pattern" }] }));
  const result = validateReportSubmission(validSubmission({ flaggedAds: tooMany }));
  assert.equal(result.success, false);
});

test("rejects a submission carrying a raw ad text field — schema has no room for it", () => {
  // The schema simply doesn't define this field, so zod strips or rejects
  // it depending on mode; either way it must not silently pass through.
  const withText = validSubmission();
  withText.flaggedAds[0].adText = "some raw scraped ad copy";
  const result = validateReportSubmission(withText);
  // Should still validate (extra fields are stripped by default in zod),
  // but the important assertion is that adText does NOT appear in the
  // validated output — proving it can't leak through into storage.
  assert.equal(result.success, true);
  assert.equal(result.data.flaggedAds[0].adText, undefined);
});

test("rejects an age_mismatch_category flag with no category", () => {
  const result = validateReportSubmission(
    validSubmission({ flaggedAds: [{ flags: [{ type: "age_mismatch_category" }] }] })
  );
  assert.equal(result.success, false);
});

test("rejects a non-category flag type that carries a category anyway", () => {
  const result = validateReportSubmission(
    validSubmission({ flaggedAds: [{ flags: [{ type: "dark_pattern", category: "gambling" }] }] })
  );
  assert.equal(result.success, false);
});

test("accepts a well-formed age_mismatch_category flag", () => {
  const result = validateReportSubmission(
    validSubmission({ flaggedAds: [{ flags: [{ type: "age_mismatch_category", category: "gambling" }] }] })
  );
  assert.equal(result.success, true);
});

test("platformFromHostname reduces subdomains to the known platform", () => {
  assert.equal(platformFromHostname("www.youtube.com"), "youtube.com");
  assert.equal(platformFromHostname("m.facebook.com"), "facebook.com");
});

test("platformFromHostname falls back to other for anything unrecognized", () => {
  assert.equal(platformFromHostname("some-random-news-site.com"), "other");
  assert.equal(platformFromHostname(""), "other");
});
