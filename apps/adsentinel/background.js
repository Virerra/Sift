// AdSentinel background service worker
//
// This file intentionally does almost nothing. AdSentinel does not scan
// pages in the background and does not phone home. The only job here is
// to update the little number on the toolbar icon after a scan finishes,
// so the badge survives even if the popup gets closed.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ADSENTINEL_SET_BADGE") {
    const tabId = sender.tab?.id ?? message.tabId;
    const count = message.count ?? 0;

    chrome.action.setBadgeText({
      tabId,
      text: count > 0 ? String(count) : ""
    });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: "#111111"
    });
  }

  if (message?.type === "ADSENTINEL_BUMP_BADGE") {
    const tabId = sender.tab?.id;
    if (!tabId) return false;

    chrome.action.getBadgeText({ tabId }).then((current) => {
      const next = (parseInt(current, 10) || 0) + 1;
      chrome.action.setBadgeText({ tabId, text: String(next) });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#0b1f3a" });
    });
  }

  return false;
});

// Clear the badge whenever a tab navigates, so stale flag counts from a
// previous page never linger.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});
