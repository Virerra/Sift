# AdDashboard (SIFT — Phase 2)

Public, aggregate-only statistics from AdSentinel's opt-in submissions —
which platforms, which flag types, which age-restricted categories, how
often. Next.js (App Router), deployed on Vercel.

## What this is not

Not a feed of the ads themselves. See `packages/schema/report.js` for the
full reasoning, but the short version: an unauthenticated public endpoint
that redisplays arbitrary text submitted by anonymous users is a real abuse
surface, especially for a project like this one. This dashboard only ever
stores and shows counts — platform, flag type, category, child-directed or
not. No ad text, no page URLs, no accounts.

## Local development

```
cd apps/addashboard
npm run dev
```

Works immediately with no setup — no `POSTGRES_URL` set means it falls
back to a local JSON file (`.data/flag-events.dev.json`, gitignored) so you
can build and test the UI before provisioning a real database. The
dashboard shows a visible banner whenever it's running on this fallback,
so dev data is never mistaken for the real public dataset.

Test the API directly:
```
curl -X POST http://localhost:3000/api/reports -H "Content-Type: application/json" -d '{
  "schemaVersion": 1,
  "platform": "youtube.com",
  "childDirectedPage": true,
  "submittedAt": "2026-01-01T00:00:00.000Z",
  "flaggedAds": [{ "flags": [{ "type": "dark_pattern" }] }]
}'
```

## Deploying for real: Vercel + Postgres

1. **Push this repo to GitHub** (already done if you're reading this from
   the repo). In Vercel, **Add New Project** → import the repo → set
   **Root Directory** to `apps/addashboard`. Vercel auto-detects Next.js;
   no build config needed.

2. **Provision a Postgres database.** In the Vercel project → **Storage**
   tab → **Create Database** → Postgres (this provisions via Neon under
   the hood). Vercel automatically injects `POSTGRES_URL` into your
   project's environment variables once you link it — you don't need to
   copy/paste a connection string by hand.

3. **Deploy.** The `flag_events` table is created automatically on first
   request (see `lib/db.js` — `CREATE TABLE IF NOT EXISTS`), no manual
   migration step needed for this simple a schema.

4. **Verify:** visit your deployed URL. The local-dev-store banner should
   be gone — if it's still showing, the database isn't linked yet (check
   the Storage tab shows it connected to this specific project, not just
   created).

## Architecture

```
addashboard/
├── app/
│   ├── page.js              Server component — fetches stats directly
│   │                         (no HTTP round-trip to its own API) and
│   │                         renders the dashboard shell.
│   ├── dashboard-charts.js  "use client" — Recharts needs the DOM to
│   │                         measure itself, can't render meaningfully
│   │                         server-side.
│   └── api/reports/route.js POST to ingest a submission, GET for the
│                             aggregate stats the page and any external
│                             consumer can read.
└── lib/
    └── db.js                 Storage adapter — real Postgres when
                                POSTGRES_URL/DATABASE_URL is set, a
                                file-backed local store otherwise.
```

`page.js` has `export const dynamic = "force-dynamic"` — without it,
Next.js would prerender the dashboard once at build time and serve frozen
numbers forever after, since a direct function call to `getAggregateStats()`
gives Next no signal that the data changes over time.

## Known gaps, stated plainly

- **No rate limiting.** This is an unauthenticated public POST endpoint by
  design ("no accounts" is a project principle), which means there's no
  per-submitter identity to throttle against. Schema validation (known flag
  types only, max 50 flagged ads per submission) is the current abuse
  boundary. Worth adding Upstash Redis (free tier) or a Vercel Firewall
  rule before wide public launch — not solved here speculatively without a
  concrete abuse pattern to design against.
- **No content re-verification.** Because raw ad content never leaves the
  submitter's browser, this can't re-run the heuristics server-side to
  confirm a submission is genuine — it can only check the submission is
  *structurally* well-formed. See `packages/schema/report.js` for the full
  reasoning.
- **AdSentinel now submits here** — `ADDASHBOARD_URL` in its `popup.js`
  points at this project's live URL. Worth knowing operationally: that
  makes this specific Vercel project + Postgres database the de facto
  shared instance for anyone running AdSentinel unmodified, not just a
  personal test deployment — keep an eye on Vercel/Postgres usage as
  real traffic shows up, not just at setup time.
