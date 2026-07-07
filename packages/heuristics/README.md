# @sift/heuristics

The detection ruleset — dark-pattern phrases, age-restricted categories,
network-reputation checks, accessible-text checks. Pure functions, no DOM,
no browser APIs. This is the one thing every SIFT tool needs to agree on;
everything else (how you find an ad, how you display a flag) is specific to
each app.

```
npm test
```
runs the full rule-by-rule test suite with nothing but Node itself.

## Two different ways consumers use this

**Node consumers (AuditTool, AdDashboard, once they exist)** just import it
directly:
```js
import { evaluateAd } from "@sift/heuristics";
```
No special handling needed — Node can reach across folders fine.

**AdSentinel (browser extension) can't do that.** Chrome only loads files
that live inside the extension's own folder — it has no way to reach out to
`packages/heuristics` at runtime, regardless of what your file system looks
like. So `apps/adsentinel/lib/heuristics.js` is a **generated copy** of this
file, kept in sync by `npm run sync` inside `apps/adsentinel` (see that
app's `scripts/sync-heuristics.js`). That copy has a warning header — if
you ever see it, the fix is to edit **this** file and re-run the sync, not
to edit the copy directly. `apps/adsentinel`'s test suite includes a drift
check that fails loudly if the copy and the source ever disagree, in case
someone forgets.

This split — edit here, sync there — is the real cost of not having a
bundler yet. It's a fair trade for zero build tooling at this project size;
worth revisiting if a second browser-extension consumer ever shows up.
