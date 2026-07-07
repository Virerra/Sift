# ParentGuide (SIFT — Phase 4)

Plain-language companion to AdSentinel: what to look for in ads shown to
kids, what AdSentinel's flags actually mean (and where they stop), and
where to send a report — both to the platform and to SIFT. Static HTML,
no build step, no framework.

## One-time setup to make this deployable

GitHub Pages' simple "deploy from a branch" option only supports serving
from the repo root or `/docs` — neither works for `apps/parentguide` in
this monorepo. The workflow at
`.github/workflows/deploy-parentguide.yml` handles that by deploying just
this folder via GitHub Actions instead, but Pages needs to be told to use
that method:

1. Repo **Settings → Pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions**
   (not "Deploy from a branch")

That's it — from then on, any push to `main` that touches
`apps/parentguide/**` redeploys automatically. You can also trigger it
manually from the **Actions** tab (`Deploy ParentGuide to GitHub Pages` →
**Run workflow**) the first time, rather than waiting for a push.

## Local preview

No build step — just open `index.html` directly, or for a closer match to
how it'll actually be served:
```
cd apps/parentguide
python3 -m http.server 8000
```
then visit `http://localhost:8000`.

## Updating content

Everything lives in `index.html` — sections for what SIFT does, what to
look for, how AdSentinel's flags work, and how to report. If you add a
platform-reporting link, verify it's still current before publishing —
support-page URLs on major platforms do move.
