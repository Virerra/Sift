// Unit tests for lib/heuristics.js — pure functions, no DOM, so these run
// with nothing but Node itself: `node --test test/heuristics.test.mjs`
//
// This intentionally does NOT test detector.js. Detector logic needs a real
// DOM and real ad-network selectors, which is what test/fixtures/test-page.html
// is for — load that in a browser with AdSentinel installed and compare
// against the expected counts printed on the page. Two different failure
// modes, two different tools: this file catches "someone changed a rule and
// broke an existing case," the fixture page catches "a DOM selector stopped
// matching."
//
// Note for Phase 1.5: when heuristics.js moves to packages/heuristics, this
// file moves with it — the import path below is the only thing that changes.

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAd, pageLooksChildDirected, FLAG_TYPES } from "../lib/heuristics.js";

function flagTypes(flags) {
  return flags.map((f) => f.type);
}

test("clean ad with descriptive text triggers no flags", () => {
  const ad = {
    text: "New running shoes just launched — shop the collection",
    altText: "",
    ariaLabel: "Advertisement",
    host: "doubleclick.net",
    hasAccessibleText: true
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.deepEqual(flags, []);
});

test("fake-urgency copy triggers a dark pattern flag", () => {
  const ad = {
    text: "Only 2 left! Act now before it's gone.",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: true
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.ok(flagTypes(flags).includes(FLAG_TYPES.DARK_PATTERN));
});

test("gambling copy triggers age-mismatch category flag", () => {
  const ad = {
    text: "Best online casino jackpot slots",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: true
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.ok(flagTypes(flags).includes(FLAG_TYPES.AGE_MISMATCH));
});

test("age-mismatch reason text changes when the page looks child-directed", () => {
  const ad = {
    text: "Meet singles near you",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: true
  };
  const onKidPage = evaluateAd(ad, { childDirectedPage: true })
    .find((f) => f.type === FLAG_TYPES.AGE_MISMATCH);
  const onOtherPage = evaluateAd(ad, { childDirectedPage: false })
    .find((f) => f.type === FLAG_TYPES.AGE_MISMATCH);

  assert.ok(onKidPage.reason.includes("child-directed"));
  assert.ok(!onOtherPage.reason.includes("looks child-directed"));
});

test("unrecognized ad network host triggers unverified-network flag", () => {
  const ad = {
    text: "Advertisement",
    altText: "",
    ariaLabel: "",
    host: "fake-ads-network.example",
    hasAccessibleText: true
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.ok(flagTypes(flags).includes(FLAG_TYPES.UNKNOWN_NETWORK));
});

test("known ad network host does not trigger unverified-network flag", () => {
  const ad = {
    text: "Advertisement",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: true
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.ok(!flagTypes(flags).includes(FLAG_TYPES.UNKNOWN_NETWORK));
});

test("ad with no accessible text triggers missing-label flag", () => {
  const ad = {
    text: "",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: false
  };
  const flags = evaluateAd(ad, { childDirectedPage: false });
  assert.ok(flagTypes(flags).includes(FLAG_TYPES.MISSING_LABEL));
});

test("image-only ad on a child-directed page also gets needs-review", () => {
  const ad = {
    text: "",
    altText: "",
    ariaLabel: "",
    host: "doubleclick.net",
    hasAccessibleText: false
  };
  const onKidPage = flagTypes(evaluateAd(ad, { childDirectedPage: true }));
  const onOtherPage = flagTypes(evaluateAd(ad, { childDirectedPage: false }));

  assert.ok(onKidPage.includes(FLAG_TYPES.NEEDS_REVIEW));
  assert.ok(!onOtherPage.includes(FLAG_TYPES.NEEDS_REVIEW));
});

test("pageLooksChildDirected reads title and meta description", () => {
  // Minimal stand-in for a DOM Document — only implements what
  // pageLooksChildDirected actually calls, not a real DOM.
  const kidDoc = {
    title: "Fun Cartoon Games for Kids",
    querySelector: (sel) => (sel.includes("description") ? { content: "" } : null)
  };
  const adultDoc = {
    title: "Quarterly Earnings Report",
    querySelector: (sel) => (sel.includes("description") ? { content: "" } : null)
  };

  assert.equal(pageLooksChildDirected(kidDoc), true);
  assert.equal(pageLooksChildDirected(adultDoc), false);
});
