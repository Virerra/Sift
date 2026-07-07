# SIFT — Safe Internet For Them

*Safe internet for them!*

Open-source tools protecting children from predatory advertising and
harmful content patterns online. Browser-based detection, community
reporting, and data transparency, so parents, educators, and platforms can
see what's actually being served to young users — not what platforms claim
is being served.

## Status

| Component | What it is | Status |
|---|---|---|
| [AdSentinel](apps/adsentinel) | Browser extension, scans ads on the current page | In progress |
| AdDashboard | Web app, aggregates opt-in reports into a public dashboard | Planned |
| AuditTool | CLI/library version of the detection engine for bulk scanning | Planned |
| ParentGuide | Static site — what to look for, how to report | Planned |

Phases ship in order. AdSentinel ships completely before AdDashboard starts.

## Structure

```
sift/
├── apps/
│   └── adsentinel/     Phase 1 — browser extension (see its own README)
├── packages/
│   └── heuristics/     The detection ruleset — source of truth. AdSentinel
│                        keeps a generated, synced copy in its own lib/
│                        folder because Chrome can't load files from outside
│                        an extension's own directory; Node consumers
│                        (AuditTool, AdDashboard) import this directly.
│                        See packages/heuristics/README.md.
├── .github/
│   └── ISSUE_TEMPLATE/  Ad-report template — where Export → Report lands
├── LICENSE              MIT, applies to the whole repo
└── README.md            this file
```

## Principles

- No accounts required where avoidable
- No data leaves your browser unless you explicitly opt in to share it
- Zero infrastructure cost where possible
- MIT licensed, open source, no monetization intent

## Contributing

Issues and PRs welcome once Phase 1 is stable. If you've spotted an ad
AdSentinel should have flagged and didn't (or flagged and shouldn't have),
use the [ad report template](.github/ISSUE_TEMPLATE/ad-report.md) — that's
exactly the kind of signal the heuristics ruleset needs to improve.

Editing the ruleset itself? It lives in `packages/heuristics/`, not in
`apps/adsentinel/lib/` — that copy is generated. See
`packages/heuristics/README.md` before you start.
