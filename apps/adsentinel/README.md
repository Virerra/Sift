# AdSentinel (SIFT — Phase 1)

A browser extension that scans the ads on the page you're currently looking
at and flags ones that match known manipulative or age-inappropriate
patterns. Everything happens locally in your browser. No accounts, no
backend, no data leaves your machine unless you click Export.

## Load it (Chrome / Edge / Brave, unpacked)

1. `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. **Load unpacked** → select the `adsentinel/` folder
4. Pin the icon, visit any page, click it, click **Scan this page**

## How it's structured

```
adsentinel/
├── manifest.json       MV3, activeTab + scripting only — no host_permissions,
│                        so the extension has zero access to any page until
│                        you click the icon and hit Scan. Nothing runs in
│                        the background.
├── background.js       Badge-count only. No network calls.
├── lib/
│   ├── detector.js      Injected into the page on scan. Finds ad-shaped
│   │                    elements (known ad-network iframes, common ad
│   │                    class/id/data-attribute patterns) and extracts
│   │                    whatever text is accessible: alt text, aria-label,
│   │                    title, and innerText where same-origin.
│   └── heuristics.js    Pure functions, no DOM access. Takes the extracted
│                        records and returns flags + human-readable reasons.
└── popup/
    ├── popup.html/css   The UI you interact with.
    └── popup.js         Orchestrates: inject detector → run heuristics →
                          render list → export.
```

Detection and judgment are deliberately split into two files. `detector.js`
only extracts; `heuristics.js` only judges. That split is what lets
Phase 3 (AuditTool) reuse the ruleset against a bulk ad inventory without
dragging DOM-scraping code along, and lets the ruleset evolve independently
as false-positive/negative reports come in.

## What the heuristics actually check

Five categories, all text/structure-based:

| Flag | What it means |
|---|---|
| **Dark pattern** | Ad copy matches known manipulative marketing phrasing (fake urgency, fake prizes, "spin to win", etc.) |
| **Age-restricted category** | Ad copy matches a category that's age-restricted in most places — gambling, dating, alcohol/vaping, crypto schemes, weight-loss products, cosmetic procedures |
| **Unverified network** | Served from an ad-tech domain not on the known-network list. Not proof of anything, just unfamiliar |
| **No accessible text** | The ad has no alt text, aria-label, or readable content, so nothing above could even run |
| **Needs your review** | Specifically: an image-only ad with no accessible text, on a page that looks built for kids. AdSentinel flags this and stops — it does not guess |

## What it deliberately does *not* do

**It does not analyze image content.** Detecting subtle sexualized or
predatory *visual* patterns in ad creative is a real image-classification
problem — the kind that needs a trained model looking at pixels, not a
regex looking at text. A hand-written checklist of "visual red flags"
would be unreliable in both directions (wrongly flagging innocent ads,
missing real harm dressed up differently) and isn't something this
codebase should carry as a static list anyway.

The honest path for that layer, when you're ready to build it:

- **Opt-in image moderation API** as a Phase 1.5 add-on — something like
  Google Cloud Vision's SafeSearch or an open-source NSFW/content
  classifier, called only on ads the user has explicitly allowed the
  extension to send out (this is the one place "local-only" would need an
  explicit, visible exception, and it should stay opt-in).
- **Human review**, which is what the "Needs your review" flag and the
  Export/Report buttons are for right now — surface it, let a person look,
  let them report it forward.
- **Community signal**, once AdDashboard (Phase 2) exists — aggregated,
  opt-in reports are what eventually let you say "this creative has been
  flagged N times across M households" instead of trying to guess from one
  page load.

Building the image layer without one of those three is the fastest way to
either produce false accusations or a false sense of security — both of
which actively hurt a child-safety tool's credibility. Worth treating as a
real Phase 1.5 milestone rather than folding it into the heuristics file.

## Known limitations (surface these to users honestly)

- Most real ad-network iframes are cross-origin — the browser blocks JS
  from reading inside them. We only ever see `src`, `title`, and
  `aria-label`, never the rendered creative itself. This is exactly why
  "no accessible text" is a flag rather than a silent pass.
- Category and dark-pattern keyword lists will always be incomplete and
  will need to grow from real flagged/missed examples — this is a good
  first community-contribution surface once the repo is public.
- "Child-directed page" detection is conservative (page title/meta only)
  and will under-flag more often than it over-flags. Age-restricted
  category ads are still surfaced even off a child-directed page for that
  reason — see the reason string in `heuristics.js`.

## Next in Phase 1

- Wire up a GitHub issue template so Export → Report has somewhere real to go
- Add a small test page (`test/fixtures/`) with known dark-pattern and
  category ads so the ruleset has a regression harness before Phase 2 starts
  consuming its output
