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
| [AdDashboard](apps/addashboard) | Next.js app on Vercel, aggregates opt-in reports into public stats | [Live](https://sift-addashboard.vercel.app) |
| [AuditTool](apps/audit-tool) | CLI/library version of the detection engine for bulk scanning | Built |
| [ParentGuide](apps/parentguide) | Static site on GitHub Pages — 7-module self-paced guide with progress tracking and a certificate | Built, not yet deployed |

All four original phases are now built. AdDashboard and ParentGuide still
need their one-time deploy steps (Vercel + Postgres, and GitHub Pages
source set to Actions, respectively) — see each app's own README.

## Structure

```
sift/
├── apps/
│   ├── adsentinel/      Phase 1 — browser extension (see its own README)
│   ├── addashboard/     Phase 2 — Next.js app, deploys to Vercel
│   ├── audit-tool/      Phase 3 — CLI/library, no deployment target;
│   │                     `npm run` or `npx` it directly, or wire into CI
│   └── parentguide/     Phase 4 — static site, deploys to GitHub Pages
├── packages/
│   ├── heuristics/      The detection ruleset — source of truth. AdSentinel
│   │                     keeps a generated, synced copy in its own lib/
│   │                     folder because Chrome can't load files from outside
│   │                     an extension's own directory; Node consumers
│   │                     (AuditTool, AdDashboard) import this directly via
│   │                     npm workspaces. See packages/heuristics/README.md.
│   └── schema/          The versioned report contract between anything
│                         that produces a report (AdSentinel) and anything
│                         that consumes one (AdDashboard). Deliberately
│                         narrow — see packages/schema/report.js.
├── .github/
│   ├── ISSUE_TEMPLATE/   Ad-report template — where Export → Report lands
│   └── workflows/        ci.yml runs every workspace's test suite plus
│                          the addashboard build on every push/PR — the
│                          ongoing proof things stay working, not just a
│                          one-time check. deploy-parentguide.yml handles
│                          GitHub Pages since it can't natively serve a
│                          monorepo subfolder.
├── package.json          Root npm workspaces config (apps/*, packages/*)
├── LICENSE                MIT, applies to the whole repo
└── README.md              this file
```

This is an npm workspaces monorepo — `npm install` from the root sets up
every app and package at once, with `@sift/heuristics` and `@sift/schema`
resolving as real local packages rather than relative-path imports.

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
