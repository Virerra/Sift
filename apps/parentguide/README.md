# ParentGuide (SIFT — Phase 4)

Seven short, self-paced modules: internet safety, digital citizenship, how
advertising actually targets kids, current ad regulation, a real
walkthrough of SIFT's own tools, and exactly where to send a report.
Static HTML, no build step, no framework — and no backend either, which
is load-bearing, not incidental: see "About the data" below.

## Structure

```
parentguide/
├── index.html            Hub — hero, overall progress, module grid
├── certificate.html       Locked until all 7 modules hit 100%; renders
│                           and downloads a certificate via <canvas>
├── modules/
│   └── 01-welcome.html … 07-spot-and-report.html
└── assets/
    ├── style.css          Shared design system
    ├── progress.js        Progress engine — the one file every page
    │                       depends on, see below
    └── certificate.js      Canvas rendering + PNG download
```

## How progress tracking actually works

`assets/progress.js` holds a single `MODULES` registry (id, title, and
**declared section count** per module) — the one source of truth every
page reads from, rather than each page hardcoding a count that could
quietly drift.

Each module page wraps its content in `<section data-track="unique-id">`
blocks. An `IntersectionObserver` marks a section "read" once it's been
substantially on-screen for 1.5 seconds — long enough that a fast
scroll-past doesn't count, short enough that actually reading it does,
without requiring an explicit click. That gets written to
`localStorage`, and every ring on every page (module page, hub card, nav
bar) re-renders from the same state via a `sift:progress-changed` event.

**If you add or remove a section from a module**, update its `sections`
count in `MODULES` to match — `progress.js` checks this at runtime and
`console.warn`s if a page's actual `[data-track]` count doesn't match
what's declared, specifically so this can't drift silently.

## About the data on this page

Progress and the name typed into the certificate live in `localStorage`
only, under one key (`sift-parentguide-progress-v1`). There's no fetch,
no XHR, nothing that leaves the browser — not because a backend wasn't
gotten around to, but because a progress-tracking system for a child
safety tool having nothing to leak is a feature worth keeping even if it
would be easy to add later. Clearing browser data clears progress; there's
no account to recover it from.

## Local preview

```
cd apps/parentguide
python3 -m http.server 8000
```
then visit `http://localhost:8000`. Works as static files too (`file://`
each page directly) since nothing here does a `fetch()` — unlike
AdSentinel's test fixture, there's no `http://`-only requirement.

## Deploying

Same one-time GitHub Pages step as before: repo **Settings → Pages →
Source → GitHub Actions**. The existing workflow at
`.github/workflows/deploy-parentguide.yml` deploys this whole folder,
unchanged by this restructure.

## Content accuracy note

Module 05 (ad policies) cites specific, verified-current regulations
(COPPA's 2025 amendments, EU DSA Article 28) rather than generic claims —
if either changes, that module needs a real update, not just a vibe
check. It's explicitly framed as general information, not legal advice.
