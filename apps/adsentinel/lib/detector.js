// AdSentinel detector
//
// Injected into the page as a classic script (see popup.js), so it does
// NOT use import/export — it just attaches one function to `window`.
// This file only *finds and extracts* ad-shaped elements. It doesn't judge
// anything; that happens back in the popup with lib/heuristics.js. Keeping
// extraction and evaluation apart means the extraction logic can be reused
// later by AuditTool without dragging the ruleset along, and vice versa.
//
// Known limitation, stated plainly: most third-party ad iframes are
// cross-origin, so the browser's same-origin policy blocks us from reading
// their inner content. We can only see what the page itself exposes:
// iframe src, title, aria-label, and any sponsored-label text sitting next
// to it in the DOM. That's a real ceiling on what text-based detection can
// catch — it's why "no accessible text" is itself a flag, not a pass.

(function () {
  const AD_HOST_HINTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "adnxs.com", "taboola.com", "outbrain.com", "criteo.com",
    "pubmatic.com", "rubiconproject.com", "media.net", "adroll.com",
    "amazon-adsystem.com"
  ];

  const AD_SELECTOR_HINTS = [
    'iframe[id*="ad" i]', 'iframe[class*="ad" i]', 'iframe[title*="advertisement" i]',
    'ins.adsbygoogle',
    '[id*="sponsor" i]', '[class*="sponsor" i]',
    '[data-ad]', '[data-testid*="ad" i]',
    '[aria-label*="advertisement" i]',
    // YouTube's video-ad companion/overlay wrapper — confirmed via live
    // DOM inspection, not a guess. Narrow and specific enough not to risk
    // false positives from ordinary words containing "ad".
    ".ytp-ad-module"
  ];

  function hostFromSrc(src) {
    try {
      return new URL(src, window.location.href).host;
    } catch {
      return "";
    }
  }

  function looksLikeAdHost(host) {
    return AD_HOST_HINTS.some((h) => host.endsWith(h));
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function collectCandidates() {
    const found = new Set();

    // Structural/attribute hints
    for (const selector of AD_SELECTOR_HINTS) {
      document.querySelectorAll(selector).forEach((el) => found.add(el));
    }

    // Any iframe whose src resolves to a known ad-network host, even
    // without a telling id/class
    document.querySelectorAll("iframe[src]").forEach((el) => {
      if (looksLikeAdHost(hostFromSrc(el.src))) found.add(el);
    });

    // Pages sometimes carry a hidden template/clone alongside the visible
    // element it was cloned from — same id, same content, zero size or
    // display:none. That's not a second ad, it's DOM plumbing, so it's
    // filtered here rather than shown to the user as a duplicate flag.
    return [...found].filter(isVisible);
  }

  function extractRecord(el) {
    const isIframe = el.tagName === "IFRAME";
    // Network-reputation only means something for third-party iframe ads.
    // A native/same-page element's "host" would just be this page's own
    // domain — not a meaningful signal, and it would flag literally every
    // native ad regardless of content. Leave it null for non-iframes so
    // evaluateAd's unverified-network check only fires where it's actually
    // informative.
    const host = isIframe ? hostFromSrc(el.src) : null;

    let text = "";
    try {
      // Same-origin iframes (rare for real ad networks, common for a
      // publisher's own house ads) — readable. Cross-origin throws.
      text = isIframe ? (el.contentDocument?.body?.innerText || "") : (el.innerText || "");
    } catch {
      text = "";
    }

    const altText = isIframe ? "" : [...el.querySelectorAll("img[alt]")].map((img) => img.alt).join(" ");
    const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    const hasAccessibleText = Boolean((text && text.trim()) || altText.trim() || ariaLabel.trim());

    return {
      text: text.slice(0, 500), // cap payload size, this is a summary not a scrape
      altText,
      ariaLabel,
      host,
      hasAccessibleText,
      tag: el.tagName.toLowerCase(),
      // a lightweight, human-readable locator instead of serializing the element
      locator: describeLocation(el)
    };
  }

  function describeLocation(el) {
    const rect = el.getBoundingClientRect();
    const label = el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(" ")[0]}` : el.tagName.toLowerCase();
    return `${label} near y=${Math.round(rect.top + window.scrollY)}px`;
  }

  function pageLooksChildDirected() {
    const desc = document.querySelector('meta[name="description"]')?.content || "";
    const text = (document.title + " " + desc).toLowerCase();
    const kidSignals = ["kids", "children", "cartoon", "toddler", "preschool", "elementary", "youtube kids"];
    const hasKidRatingMeta = document.querySelector('meta[name="rating"][content="general"]') !== null;
    return hasKidRatingMeta || kidSignals.some((s) => text.includes(s));
  }

  function dedupeBySignature(records) {
    const seen = new Set();
    return records.filter((r) => {
      // locator includes a y-coordinate, which is expected to differ for
      // genuinely distinct ads even with the same tag/id — strip it here
      // so the signature only catches true look-alikes.
      const locatorLabel = r.locator.split(" near ")[0];
      const signature = `${r.tag}|${r.host}|${locatorLabel}|${r.text}|${r.ariaLabel}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function scan() {
    const candidates = collectCandidates();
    const ads = dedupeBySignature(candidates.map(extractRecord));
    return {
      url: window.location.href,
      scannedAt: new Date().toISOString(),
      childDirectedPage: pageLooksChildDirected(),
      adCount: ads.length,
      ads
    };
  }

  window.__adSentinelScan = scan;
})();
