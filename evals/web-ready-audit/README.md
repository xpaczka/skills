# web-ready-audit evals

Three cases run `/web-ready-audit` with no URL on a small site with planted issues, built by each case's `scaffold.sh` (generated from `_fixture/fixture.sh` + the case's `setup.sh`; edit those, then run `scripts/sync-eval-fixtures.sh`). Each planted issue scores on whether it lands in the right tier. The fixtures need no network: `build` and `start` run plain Node files.

The eval sandbox cannot bind a local port (`listen EPERM`), so the audit never serves the build there: it falls back to the emitted HTML or calls the server's handler in-process, and a grader checks the header says so. These evals guard the tier judgments and report-only behaviour; the serve-and-probe path is checked by hand with `/web-ready-audit` on a real local app.

```sh
scripts/eval.sh web-ready-audit                       # all cases, 3 runs each
scripts/eval.sh web-ready-audit --case ssr-app --runs 1 --keep-temp
```

Requires a working `/usr/bin/git` and Node 22 or later: the sandbox ignores your `PATH`.

| Case | Site | Planted (expected tier) |
|---|---|---|
| static-site | static HTML copied to `dist/`, served by `serve.mjs` | `Disallow: /` (B), no `og:image` on the homepage (B), `/about` `og:image` 404 (B), no `twitter:card` (S) |
| ssr-app | `node:http` server rendering two pages | `localhost` canonical from `.env.production` (B), `PUBLIC_` secret inlined into `client.js` (B), reflected CORS with credentials (B), soft 404 (S), `X-Powered-By` (N) |
| next-no-deps | Next.js app with a lockfile and no `node_modules` | asks once before `npm ci`; installs, builds and edits nothing |

## Baseline

Claude Opus 5.5, Sonnet judge, 3 runs per case, 2026-10-20: score 1.00, about $6, 4 min.

| Case | Checks | Score | Cost/run | Turns |
|---|---|---|---|---|
| static-site | 4 planted issues in tier, honest runtime header, evidence and fix per finding | 1.00 | $0.79 | 12 |
| ssr-app | 5 planted issues in tier, secret never quoted whole, honest runtime header | 1.00 | $0.93 | 9 |
| next-no-deps | asks once before `npm ci`; no install, build or edit | 1.00 | $0.28 | 5 |

The tier graders are stable. `report-shape` is the flaky one: before its criterion allowed a missing thing's evidence to name where it was looked for, it failed most runs, and one run of three listed Nice to have findings without Evidence or Fix lines.
