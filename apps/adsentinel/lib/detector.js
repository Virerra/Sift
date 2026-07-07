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
    '[aria-label*="advertisement" i]'
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

    return [...found];
  }

  function extractRecord(el) {
    const isIframe = el.tagName === "IFRAME";
    const host = isIframe ? hostFromSrc(el.src) : window.location.host;

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

  function scan() {
    const candidates = collectCandidates();
    return {
      url: window.location.href,
      scannedAt: new Date().toISOString(),
      childDirectedPage: pageLooksChildDirected(),
      adCount: candidates.length,
      ads: candidates.map(extractRecord)
    };
  }

  window.__adSentinelScan = scan;
})();
