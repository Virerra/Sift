// AdSentinel platform watcher
//
// Auto-injected only on the four domains listed in manifest.json's
// content_scripts.matches — that's what host_permissions being scoped
// (not <all_urls>) actually buys you: Chrome's install prompt names these
// four sites specifically, and this file has zero reach anywhere else.
//
// Scope of this first pass, stated plainly: only YouTube's video-ad state
// is actually watched right now. Facebook/Instagram/TikTok are already
// pre-authorized in the manifest so a later update can add their watchers
// without asking users to re-grant permissions — but no detection logic
// ships for them yet. Their video players have entirely different DOM
// structures and each needs its own reverse-engineered watcher; bundling
// three half-working guesses into this release would be worse than
// shipping YouTube alone and being honest about the rest.

(function () {
  const host = window.location.hostname;

  if (host.endsWith("youtube.com")) {
    initYouTubeWatcher();
  }
  // facebook.com / instagram.com / tiktok.com: no watcher yet, see note above.

  function initYouTubeWatcher() {
    let observedNode = null;
    let observer = null;
    let adCurrentlyShowing = false;

    attachToPlayer();
    // YouTube is a single-page app — navigating between videos doesn't
    // reload the page, so we re-check after each internal navigation.
    document.addEventListener("yt-navigate-finish", attachToPlayer);

    function attachToPlayer() {
      const player = document.querySelector("#movie_player");
      if (!player || player === observedNode) return;

      if (observer) observer.disconnect();
      observedNode = player;
      adCurrentlyShowing = player.classList.contains("ad-showing");

      observer = new MutationObserver(() => {
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
      showToast({
        title: "Video ad playing",
        body: "AdSentinel can't inspect video ad content — this is just a heads up, not a flag."
      });
      chrome.runtime.sendMessage({ type: "ADSENTINEL_BUMP_BADGE" });
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
