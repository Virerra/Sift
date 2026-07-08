# AuditTool (SIFT — Phase 3)

The shared detection ruleset, packaged as a CLI and a library, for scanning
a bulk ad inventory instead of a single live page. Built for platforms or
third-party auditors doing self-serve compliance checking — point it at an
export of your ad inventory and get back exactly the same flags AdSentinel
would produce scanning those ads in a browser, at whatever scale your
inventory actually is.

This was the cheap phase, on purpose: it's almost entirely
`packages/heuristics` imported directly. Node has none of the "extension
can only load files from its own folder" constraint that makes AdSentinel
keep a synced copy — see that package's README if you're curious why this
one didn't need that.

## Quick start

```
cd apps/audit-tool
node bin/audit.js fixtures/sample-inventory.json
```

That fixture mirrors the same six test cases AdSentinel's browser fixture
uses — same 6 scanned / 4 flagged result, on purpose, so both entry points
are checked against one shared expectation.

## Input format

A `.json` file containing an array of ad records, or `.jsonl` (one JSON
object per line) for larger exports:

```json
[
  {
    "id": "optional, defaults to array index",
    "platform": "optional, defaults to \"unknown\"",
    "text": "the ad's visible copy",
    "altText": "alt text on any images in the ad",
    "ariaLabel": "aria-label or title attribute, if any",
    "host": "the ad network's domain, or null for a native/first-party ad",
    "hasAccessibleText": "optional — auto-computed from text/altText/ariaLabel if omitted",
    "childDirected": "optional boolean — was this ad shown on a page aimed at kids?"
  }
]
```

Only `text` is realistically required. Everything else has a sane
default — `hasAccessibleText` gets computed for you, `host` defaults to
`null` (meaning: don't guess at network reputation for something that
didn't come from a third-party iframe), `platform` defaults to
`"unknown"`.

CSV input isn't supported yet. Ad copy legitimately contains commas and
quotes, and a hand-rolled CSV parser for that is exactly the kind of thing
that looks fine in a demo and breaks on real data — worth adding properly
if a real inventory export actually needs it, not simulated here without
one to test against.

## CLI reference

```
audit-tool <input-file> [options]

--format <text|json|csv>   Output format (default: text)
--output <file>            Write the full report to a file
--child-directed           Default childDirected=true for any record that
                            doesn't specify its own value
--fail-on-flags <n>        Exit 1 if more than n ads are flagged — omit
                            to always exit 0, useful once wired into CI
--max-examples <n>         Cap flagged examples in text output (default 20)
--help                     Show usage
```

A record's own `childDirected` field always wins over `--child-directed`,
even when it's explicitly `false` — the flag only fills in a default for
records that didn't say either way.

## Using it in CI

`--fail-on-flags` is what makes this a compliance *gate*, not just a
report:

```
audit-tool inventory.jsonl --fail-on-flags 0
```

Exits non-zero the moment any ad is flagged, which is exactly the
behavior a CI pipeline needs to actually block on. Start with a higher
threshold if you're retrofitting this onto an existing inventory with
known issues, and ratchet it down over time rather than trying to hit
zero on day one.

### A concrete example, if you're a platform wiring this into your own CI

This assumes your CI job checks out this repo (or a fork) alongside your
own inventory export — there's no published npm package yet, so
`npx @sift/audit-tool` doesn't work until that happens. Until then, this
is the real path:

```yaml
# .github/workflows/ad-compliance.yml, in YOUR repo
name: Ad compliance check
on: [push]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: Virerra/Sift
          path: sift

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm install
        working-directory: sift

      # Point this at wherever your own CI produces an inventory export —
      # a build artifact, a checkout of your own repo alongside this one,
      # a step earlier in the same job. audit-tool doesn't care how the
      # file got there, only that it's valid JSON/JSONL matching the
      # schema in this README.
      - run: node bin/audit.js /path/to/your-inventory.json --fail-on-flags 0
        working-directory: sift/apps/audit-tool
```

This repo's own CI (`.github/workflows/ci.yml` at the root) runs this
exact tool's test suite — including a fresh-inventory smoke test, not
just the bundled fixture — on every push, which is the actual ongoing
proof this stays usable rather than a one-time claim.

## Library usage

```js
import { auditInventory } from "@sift/audit-tool/lib/auditInventory.js";

const report = auditInventory(records);
// report.totalScanned, report.totalFlagged
// report.results — per-ad flags
// report.summary — byPlatform / byFlagType / byCategory breakdowns
```

## Testing

```
npm test
```

18 tests: library-level unit tests for `auditInventory` and
`parseInputFile`, plus integration tests that spawn the actual CLI binary
via `child_process` and check real exit codes and output — not mocks.
