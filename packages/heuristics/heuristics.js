/**
 * AdSentinel heuristics
 * ---------------------
 * A note on scope before you read the rules: this file catches things
 * text and structure can tell you — dark-pattern copy, mismatched ad
 * categories, missing accessibility text, known-bad ad networks. It does
 * NOT attempt to classify image content for sexualization or "fetishistic"
 * visual patterns. That's a real image-classification problem, not a
 * pattern-matching one, and a hand-rolled checklist for it would be both
 * unreliable (false positives that wrongly accuse advertisers, false
 * negatives that miss real harm) and a bad thing for this codebase to
 * contain in plain text. The correct engineering answer is to route
 * anything visual to (a) an established image-moderation API/model as an
 * opt-in Phase-1.5 add-on, or (b) a human — the person using the
 * extension, or later, community/AuditTool review. See FLAG_TYPES.NEEDS_REVIEW.
 *
 * Every rule below returns a *reason string* that gets shown to the user
 * verbatim — no silent auto-blocking, no hidden scoring. The user always
 * sees why something was flagged and can dismiss it.
 */

export const FLAG_TYPES = {
  DARK_PATTERN: "dark_pattern",
  AGE_MISMATCH: "age_mismatch_category",
  UNKNOWN_NETWORK: "unverified_ad_network",
  MISSING_LABEL: "missing_accessible_text",
  NEEDS_REVIEW: "needs_human_review"
};

// Known ad-serving domains. Not a blocklist of "bad" advertisers — just
// used to positively identify that an element IS an ad, so we know what
// to scan. Extend freely; PRs welcome.
export const AD_NETWORK_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adnxs.com",
  "taboola.com",
  "outbrain.com",
  "criteo.com",
  "pubmatic.com",
  "rubiconproject.com",
  "media.net",
  "adroll.com",
  "amazon-adsystem.com"
];

// Standard manipulative-marketing copy patterns. These are generic dark
// patterns used across all of adtech (not specific to any protected
// category) — fake urgency, fake scarcity, engagement bait.
export const DARK_PATTERN_PHRASES = [
  /\b(only|just)\s+\d+\s+(left|spots?|seats?)\b/i,
  /\bact\s+now\b/i,
  /\boffer\s+expires?\s+(soon|today|in)\b/i,
  /\bcongratulations?,?\s+you('ve| have)?\s+(won|been\s+selected)\b/i,
  /\bclaim\s+your\s+(free|prize|reward)\b/i,
  /\bspin\s+to\s+win\b/i,
  /\bmystery\s+box\b/i,
  /\bunlock\s+now\b/i,
  /\bdon'?t\s+miss\s+out\b/i,
  /\bverify\s+your\s+age\b/i // legitimate age gates exist; flagged so a human can check it's real
];

// Product/service categories that are age-restricted or age-inappropriate
// in most jurisdictions when served to a page built for children. This is
// a category check ("is this a gambling ad"), not a visual check.
export const AGE_RESTRICTED_CATEGORIES = {
  gambling: [/\bcasino\b/i, /\bslots?\b/i, /\bbet(ting)?\b/i, /\bjackpot\b/i, /\bpoker\b/i, /\blottery\b/i],
  dating: [/\bdating\s+app\b/i, /\bsingles?\s+near\s+you\b/i, /\bmeet\s+singles?\b/i],
  alcohol_vaping: [/\bvape\b/i, /\be-?cig(arette)?\b/i, /\b(beer|wine|liquor)\s+delivery\b/i],
  crypto_getrichquick: [/\bcrypto\b/i, /\bforex\b/i, /\bget\s+rich\b/i, /\bpassive\s+income\s+guarantee/i],
  weight_loss: [/\bweight\s+loss\s+(pill|hack|secret)/i, /\bmelt\s+fat\b/i, /\bflat\s+belly\b/i],
  cosmetic_procedures: [/\bbotox\b/i, /\blip\s+filler\b/i, /\bcosmetic\s+surgery\b/i]
};

/**
 * Signals that suggest the current page is built for or heavily visited by
 * children. Deliberately conservative — used only to decide whether an
 * age-restricted-category ad deserves a flag, never to decide anything
 * about the ad's visual content.
 */
export function pageLooksChildDirected(doc) {
  const text = (doc.title + " " + (doc.querySelector('meta[name="description"]')?.content || "")).toLowerCase();
  const kidSignals = ["kids", "children", "cartoon", "toddler", "preschool", "elementary", "youtube kids"];
  const hasKidMeta = doc.querySelector('meta[name="rating"][content="general"]') !== null;
  return hasKidMeta || kidSignals.some((s) => text.includes(s));
}

/**
 * Runs all text/structure-based rules against one extracted ad record.
 * `ad` shape: { text, altText, ariaLabel, host, hasAccessibleText }
 * Returns an array of { type, reason } — zero or more per ad.
 */
export function evaluateAd(ad, { childDirectedPage } = {}) {
  const flags = [];
  const haystack = [ad.text, ad.altText, ad.ariaLabel].filter(Boolean).join(" ");

  for (const pattern of DARK_PATTERN_PHRASES) {
    if (pattern.test(haystack)) {
      flags.push({
        type: FLAG_TYPES.DARK_PATTERN,
        reason: `Ad copy matches a known manipulative pattern (${pattern.source}).`
      });
      break; // one dark-pattern flag is enough signal; avoid noisy duplicates
    }
  }

  for (const [category, patterns] of Object.entries(AGE_RESTRICTED_CATEGORIES)) {
    if (patterns.some((p) => p.test(haystack))) {
      flags.push({
        type: FLAG_TYPES.AGE_MISMATCH,
        category, // structured, for anything downstream that aggregates by category (e.g. AdDashboard) rather than parsing prose
        reason: childDirectedPage
          ? `Ad appears to be in an age-restricted category (${category}) on a page that looks child-directed.`
          : `Ad appears to be in an age-restricted category (${category}). Flagged for visibility even though this page didn't trip child-directed signals — those signals are conservative and can miss real kid audiences.`
      });
    }
  }

  // ad.host is only ever set for iframe ads (see detector.js) — native
  // same-page elements have no meaningful "network" to check, so they
  // fall through here without triggering this flag, by design.
  if (ad.host && !AD_NETWORK_HOSTS.some((known) => ad.host.endsWith(known))) {
    flags.push({
      type: FLAG_TYPES.UNKNOWN_NETWORK,
      reason: `Served from an ad network not in the known-network list (${ad.host}). Not inherently bad — just unverified, worth a second look.`
    });
  }

  if (!ad.hasAccessibleText) {
    flags.push({
      type: FLAG_TYPES.MISSING_LABEL,
      reason: "This ad has no alt text or aria-label, so its content can't be text-analyzed at all."
    });
    // No accessible text + child-directed page is exactly the case where
    // AdSentinel is blind and should say so, not guess.
    if (childDirectedPage) {
      flags.push({
        type: FLAG_TYPES.NEEDS_REVIEW,
        reason: "Image-only ad on a page that looks child-directed. AdSentinel can't inspect image content — please look at it yourself, and use the Report button if anything seems off."
      });
    }
  }

  return flags;
}
