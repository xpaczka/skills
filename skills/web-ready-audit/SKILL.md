---
name: web-ready-audit
description: Audit a website or web app before launch, on any stack, and report what is missing or misconfigured as Blocker, Should fix and Nice to have findings, without editing anything.
disable-model-invocation: true
argument-hint: "[url] [path]"
---

# web-ready-audit

You audit one website or web app for launch readiness: the things that are easy to forget (crawl directives, canonicals, sitemaps, previews) and the things set up wrong. You read the source, inspect what the site actually serves, and report findings in chat. The report is the deliverable.

## Hard rules

- **Report only.** Read project files; leave every one of them as it is. Fixes go in the report as one-line suggestions.
- **Read-only GETs.** Every live request is a GET. Before the first probe run, tell the user which URLs and paths you will request. No POSTs, form submissions or logins.
- **Raw HTML.** Judge the HTML the server sends, the way crawlers and link-preview scrapers see it. A tag that only appears after client-side JavaScript runs is absent.
- **Evidence and a fix.** Every finding cites a `file:line` or a URL, and gives a one-line fix.
- **Current guidance.** Report only what search engines and platforms use today; the CHECKS files encode it. Folklore (meta keywords, sitemap `priority`, `rel=prev/next`) is never a finding.

## Severity tiers

- **Blocker**: wrong or broken at launch, visible from day one (noindex in prod, `Disallow: /`, a wrong canonical, a broken build, a leaked secret).
- **Should fix**: hurts SEO, performance or indexing over time.
- **Nice to have**: best practice whose absence causes no real harm.

## Run

1. **Arguments.** `[url]` is an argument starting with `http://` or `https://`, or a bare host such as `example.com`. `[path]` is the project folder, default the current directory.
2. **Target.** A URL argument is the live site to inspect. Without one, ask the user for the production URL (the local-build layer is not written yet).
3. **Source.** In `[path]`, find what produces the HTML head (layouts, `index.html`, head or metadata APIs), robots.txt and the sitemap (static files or generators), and the deploy config. Grep for `noindex`, `canonical`, `robots`, `sitemap`, `<title` and `lang=`. Keep each hit's `file:line` for the findings.
4. **Requests.** Tell the user what the run will GET: robots.txt, the sitemaps, each page, each canonical target that differs from its page, and DNS TXT records for the host.
5. **Homepage.** Run the probe on the target ([PROBE.md](PROBE.md)).
6. **Pages.** Take candidates from `sites[].sitemap.urls`, else the homepage's `html.internalLinks`, plus the routes in the source. Under 15 candidates, check them all; otherwise check one page per route template (same path shape, one varying segment), at most 25. Run the probe on them with `--pages-only`.
7. **Judge.** Apply every rule in the checks file of each category below. Done when every rule has a verdict: a finding, a pass, or "not verifiable" with the reason.
8. **Report** in the shape of [REPORT-FORMAT.md](REPORT-FORMAT.md).

## Check categories

| Category | Rules |
|---|---|
| Crawlability and SEO | [CHECKS-CRAWL.md](CHECKS-CRAWL.md) |

## Environment capabilities

| If the environment has… | do | else |
|---|---|---|
| `node` 22 or later, `bun` or `deno` | run `scripts/probe.mjs` | gather the PROBE.md fact list with `curl` or `wget`, else the harness's web fetch; mark facts no tool can get as unverified |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |
