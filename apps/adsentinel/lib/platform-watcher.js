// AdSentinel platform watcher
//
// Auto-injected only on the four domains listed in manifest.json's
// content_scripts.matches — that's what host_permissions being scoped
// (not <all_urls>) actually buys you: Chrome's install prompt names these
// four sites specifically, and this file has zero reach anywhere else.
//
// Scope of this first pass, stated plainly: only YouTube's video-ad state
// is actually watched right now, and only the .ytp-ad-module companion/
// overlay format — confirmed by live DOM inspection, not assumed. YouTube
// has multiple distinct ad rendering formats (a separate #sponsor-button
// style unit exists too) and this doesn't cover all of them yet.
// Facebook/Instagram/TikTok are already pre-authorized in the manifest so
// a later update can add their watchers without asking users to re-grant
// permissions — but no detection logic ships for them yet. Their video
// players have entirely different DOM structures and each needs its own
// reverse-engineered watcher; bundling three half-working guesses into
// this release would be worse than shipping YouTube alone and being
// honest about the rest.

(function () {
  const host = window.location.hostname;

  if (host.endsWith("youtube.com")) {
    initYouTubeWatcher();
  }
  // facebook.com / instagram.com / tiktok.com: no watcher yet, see note above.

  // Reloading the extension while a matching tab is already open leaves
  // that tab's content script running with a severed connection back to
  // the extension — chrome.runtime goes undefined mid-session. This is
  // expected and common (it happens on every dev reload), not a bug to
  // chase — the fix for the tab itself is just a page refresh. What we
  // control is not throwing an uncaught error every time it happens.
  function isExtensionContextValid() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function initYouTubeWatcher() {
    let observedNode = null;
    let observer = null;
    let adCurrentlyShowing = false;

    attachToPlayer();
    // YouTube is a single-page app — navigating between videos doesn't
    // reload the page, so we re-check after each internal navigation.
    document.addEventListener("yt-navigate-finish", attachToPlayer);

    function attachToPlayer() {
      if (!isExtensionContextValid()) return;

      const player = document.querySelector("#movie_player");
      if (!player || player === observedNode) return;

      if (observer) observer.disconnect();
      observedNode = player;
      adCurrentlyShowing = player.classList.contains("ad-showing");

      observer = new MutationObserver(() => {
        if (!isExtensionContextValid()) {
          // Stale tab, dead connection — stop watching entirely rather
          // than erroring on every ad from here until the page refreshes.
          observer.disconnect();
          return;
        }
        const isAdShowing = player.classList.contains("ad-showing");
        if (isAdShowing && !adCurrentlyShowing) {
          adCurrentlyShowing = true;
          notifyAdStarted();
        } else if (!isAdShowing && adCurrentlyShowing) {
          adCurrentlyShowing = false;
        }
      });

      // Watching class changes on one specific element, not subtree:all —
      // YouTube's DOM churns constantly for unrelated reasons (hover
      // states, live chat, recommendations loading). A broad observer
      // here would fire constantly and do real work for nothing.
      observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    }

    function notifyAdStarted() {
      // .ytp-ad-module is YouTube's own top-level wrapper for the video-ad
      // overlay/companion card — confirmed by live inspection, not a guess.
      // It's populated a beat after the ad-showing class appears, so give
      // it a moment before reading its content.
      setTimeout(() => runAdCheck(0), 400);
    }

    function runAdCheck(attempt) {
      if (!isExtensionContextValid()) return;

      const adModule = document.querySelector(".ytp-ad-module");
      const record = adModule ? extractYouTubeAdRecord(adModule) : null;

      if ((!record || !record.hasAccessibleText) && attempt < 1) {
        // Still empty — YouTube hadn't finished populating it. One retry.
        setTimeout(() => runAdCheck(attempt + 1), 500);
        return;
      }

      evaluateAndToast(record);
    }

    async function evaluateAndToast(record) {
      let flags = [];
      try {
        const heuristicsUrl = chrome.runtime.getURL("lib/heuristics.js");
        const { evaluateAd } = await import(heuristicsUrl);
        if (record) flags = evaluateAd(record, { childDirectedPage: false });
      } catch (err) {
        // Heuristics module failed to load — could be a stale context, or
        // a real error. Either way, still show a heads-up rather than
        // silently doing nothing.
      }

      if (flags.length > 0) {
        showToast({
          title: `Video ad flagged — ${flags.length} issue${flags.length > 1 ? "s" : ""}`,
          body: flags[0].reason
        });
      } else if (record && record.hasAccessibleText) {
        showToast({
          title: "Video ad playing",
          body: "No text-based flags on this one. AdSentinel can't inspect video/image content, so this isn't a clean bill of health."
        });
      } else {
        showToast({
          title: "Video ad playing",
          body: "Couldn't read any text from this ad card — AdSentinel can't inspect video/image content, so this is just a heads up."
        });
      }

      // Badge update is a nice-to-have, not core to the toast the user
      // already saw — never let a dead connection surface as an error.
      if (isExtensionContextValid()) {
        try {
          chrome.runtime.sendMessage({ type: "ADSENTINEL_BUMP_BADGE" });
        } catch {
          // Context died between the check and the call — nothing to do.
        }
      }
    }

    function extractYouTubeAdRecord(el) {
      const text = (el.innerText || "").slice(0, 500);
      const altText = [...el.querySelectorAll("img[alt]")].map((img) => img.alt).join(" ");
      const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("title") || "";
      return {
        text,
        altText,
        ariaLabel,
        // Native YouTube ad module, not a third-party iframe — host stays
        // null on purpose, same reasoning as detector.js.
        host: null,
        hasAccessibleText: Boolean(text.trim() || altText.trim() || ariaLabel.trim())
      };
    }
  }

  // Shadow DOM keeps the toast's own styles from being overridden by the
  // host page's CSS (and vice versa) — YouTube's stylesheets are broad
  // enough that a plain injected <div> reliably picks up unwanted rules.
  function showToast({ title, body }) {
    const existing = document.getElementById("__adsentinel_toast_host");
    if (existing) existing.remove();

    const hostEl = document.createElement("div");
    hostEl.id = "__adsentinel_toast_host";
    hostEl.style.cssText = "position:fixed;bottom:0;right:0;z-index:2147483647;";
    document.documentElement.appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .toast {
          all: initial;
          font-family: Arial, Helvetica, sans-serif;
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 280px;
          background: #ffffff;
          border: 2px solid #111111;
          border-left: 6px solid #0b1f3a;
          padding: 12px 14px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.18);
          animation: slidein 0.2s ease-out;
        }
        @keyframes slidein {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .word { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 13px; color: #111111; letter-spacing: 0.3px; }
        .title { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 12.5px; color: #111111; margin: 6px 0 3px; }
        .body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: #6b6b6b; line-height: 1.4; margin: 0; }
        .close { all: initial; font-family: Arial, sans-serif; cursor: pointer; font-size: 14px; color: #6b6b6b; line-height: 1; }
        .close:hover { color: #111111; }
      </style>
      <div class="toast" role="status">
        <div class="row">
          <span class="word">SIFT</span>
          <span class="close" id="close-btn">×</span>
        </div>
        <p class="title">${escapeHtml(title)}</p>
        <p class="body">${escapeHtml(body)}</p>
      </div>
    `;

    shadow.getElementById("close-btn").addEventListener("click", () => hostEl.remove());
    setTimeout(() => hostEl.remove(), 6000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
