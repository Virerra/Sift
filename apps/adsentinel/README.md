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
├── manifest.json       MV3. activeTab + scripting for the manual scan flow
│                        (works on any page). host_permissions + a
│                        content_scripts entry scoped to exactly four
│                        domains — youtube.com, facebook.com, instagram.com,
│                        tiktok.com — for the auto-watch flow. Chrome's
│                        install prompt names those four domains
│                        specifically; nothing broader is requested.
│                        web_accessible_resources exposes lib/heuristics.js
│                        so platform-watcher.js can dynamically import it.
├── background.js       Badge count only. No network calls.
├── scripts/
│   └── sync-heuristics.js  Copies packages/heuristics/heuristics.js into
│                            lib/ (see below for why this copy has to exist).
│                            Run via `npm run sync`.
├── lib/
│   ├── detector.js         Manual scan: injected on click, any page.
│   ├── heuristics.js        GENERATED — do not edit. Source of truth is
│   │                         ../../../packages/heuristics/heuristics.js.
│   │                         Chrome can only load files inside the
│   │                         extension's own folder, so a synced copy has
│   │                         to live here regardless of where the ruleset
│   │                         is actually maintained.
│   └── platform-watcher.js  Auto-injected only on the four curated
│                             domains. Watches YouTube's `.ytp-ad-module`
│                             for ad state, dynamically imports the real
│                             heuristics module, and shows an in-page toast
│                             with the actual evaluation — not just "an ad
│                             is playing." Facebook/Instagram/TikTok are
│                             pre-authorized but have no watcher logic yet.
└── popup/
    ├── popup.html/css   The UI you interact with.
    └── popup.js         Orchestrates: inject detector → run heuristics →
                          render list → export.
```

Detection and judgment are deliberately split into two files. `detector.js`
only extracts; `heuristics.js` only judges. That split is what lets
AuditTool reuse the ruleset against a bulk ad inventory without dragging
DOM-scraping code along, and lets the ruleset evolve independently as
false-positive/negative reports come in — which is also exactly why it now
lives in `packages/heuristics/` as its own package rather than buried in
this app. See that package's README for the copy/sync mechanics.

## Two ways ads get surfaced

**Manual scan** — works on any page. You click the icon, hit Scan, get a
full flagged list. This is the original Phase 1 flow and still has zero
standing access to anything.

**Auto-watch** — only on YouTube, Facebook, Instagram, and TikTok, and only
because those four domains are explicitly listed in the manifest (see
above). Right now this only does one thing: when a YouTube video ad starts
playing, a small in-page toast tells you, using a `MutationObserver`
watching the single `#movie_player` element for its `ad-showing` class —
not the whole page, which would fire constantly for unrelated DOM churn.
The toast is rendered in a Shadow DOM so the host page's CSS can't bleed
into it (and vice versa). It can't inspect what the ad actually shows, same
limitation as everywhere else in this codebase — it's a heads-up, not a
flag.

## Sharing to AdDashboard

Once you've scanned a page and gotten flags, a **Share to AdDashboard**
button appears alongside Export. Opt-in, one click at a time — nothing
gets sent automatically. It sends only flag types, categories, and which
platform (not the page URL, never ad text) to the aggregate public
dashboard. See `packages/schema/report.js` for exactly what that shape is
and why it's that narrow.

**To enable it:** deploy `apps/addashboard` (see that app's README), then
open `popup/popup.js` and set `ADDASHBOARD_URL` to your deployed URL plus
`/api/reports`. Until that's set, the button explains clearly that
AdDashboard isn't configured yet rather than failing silently.

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

## Testing

Three layers now, each catching a different kind of breakage:

```
cd packages/heuristics
npm test                          # the ruleset itself, in isolation
```

```
cd apps/adsentinel
npm test                          # confirms lib/heuristics.js matches
                                   # packages/heuristics — fails if you
                                   # edited the ruleset and forgot to sync
```

If you changed anything in `packages/heuristics/heuristics.js`, run this
before committing:
```
cd apps/adsentinel
npm run sync
```

Then for the DOM/detection side, which genuinely needs a browser:

```
cd test/fixtures
python3 -m http.server 8000
```

Visit `http://localhost:8000/test-page.html`, scan it with AdSentinel, and
compare the popup's output against the expected-flags table printed on the
page itself.

The ruleset tests catch "someone changed a rule and broke an existing
case." The sync test catches "someone changed the rule but forgot to
propagate it to the file Chrome actually loads." The fixture page catches
"a DOM selector stopped matching." All three are needed; none substitutes
for the others.

## Next in Phase 1

- Facebook, Instagram, and TikTok watchers — `platform-watcher.js` is
  structured to add these as additional `if (host.endsWith(...))` branches;
  each needs its own DOM investigation first, YouTube's approach won't
  transfer directly
