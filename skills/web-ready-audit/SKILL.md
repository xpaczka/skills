---
name: web-ready-audit
description: Audit a website or web app before launch, on any stack, and report what is missing or misconfigured as Blocker, Should fix and Nice to have findings, without editing anything.
disable-model-invocation: true
argument-hint: "[url] [path]"
---

# web-ready-audit

You audit one website or web app for launch readiness: the things that are easy to forget (crawl directives, canonicals, sitemaps, previews) and the things set up wrong. You read the source, build it, inspect what the site actually serves, and report findings in chat. The report is the deliverable.

The method is the same on every stack (Next.js, Vite, TanStack, Astro, Django, Rails, PHP, plain HTML, or one never seen before): find what produces the HTML head, how the project builds and serves, and where static files and headers come from, then audit the output.

## Hard rules

- **Report only.** Read project files; leave every one of them as it is. Fixes go in the report as one-line suggestions. The only writes are the build's own output and a dependency install the user approved.
- **Read-only GETs.** Every request to the audited site is a GET. Before the first probe run, tell the user which URLs and paths you will request. No POSTs, form submissions or logins.
- **Raw HTML.** Judge the HTML the server sends, the way crawlers and link-preview scrapers see it. A tag that only appears after client-side JavaScript runs is absent.
- **Evidence and a fix.** Every finding cites a `file:line` or a URL, and gives a one-line fix.
- **Current guidance.** Report only what search engines and platforms use today; the CHECKS files encode it. Folklore (meta keywords, sitemap `priority`, `rel=prev/next`) is never a finding.

## Severity tiers

- **Blocker**: wrong or broken at launch, visible from day one (noindex in prod, `Disallow: /`, a wrong canonical, a broken build, a leaked secret).
- **Should fix**: hurts SEO, performance or indexing over time.
- **Nice to have**: best practice whose absence causes no real harm.

## Run

1. **Arguments.** `[url]` is an argument starting with `http://` or `https://`, or a bare host such as `example.com`. `[path]` is the app folder, default the current directory.
2. **Discover** ([DISCOVER.md](DISCOVER.md)): the app (ask when a monorepo holds several), the four questions, the declared and installed runtime, the tools, and the target URL by precedence.
3. **Source.** In the app, find the files behind the head, robots.txt and the sitemap (static files or generators), and the deploy config. Grep for `noindex`, `canonical`, `robots`, `sitemap`, `<title`, `lang=`, `og:`, `twitter:`, `icon`, `manifest` and `ld+json`. Keep each hit's `file:line` for the findings.
4. **Build** the app, then typecheck and lint when it has them ([DISCOVER.md](DISCOVER.md#build)). With dependencies missing, ask once before a frozen install.
5. **Runtime.** A target URL is the live site. Without one, serve the build on a free port and use `http://localhost:<port>` ([DISCOVER.md](DISCOVER.md#serve-locally)).
6. **Requests.** Pick the `--api` routes ([CHECKS-SECURITY.md](CHECKS-SECURITY.md#cors)), run the probe with `--list-probes`, and show the user that list, plus the dependency audit's registry request and, when the mail check will run, its DNS lookups. Then send them.
7. **Homepage.** Run the probe on the target ([PROBE.md](PROBE.md)).
8. **Pages.** Take candidates from `sites[].sitemap.urls`, else the homepage's `html.internalLinks`, plus the routes in the source. Under 15 candidates, check them all; otherwise check one page per route template (same path shape, one varying segment), at most 25. Run the probe on them with `--pages-only`. Then stop a local server.
9. **Judge.** Apply every rule in the checks file of each category below; a local run also follows [DISCOVER.md](DISCOVER.md#judging-local-output). Done when every rule has a verdict: a finding, a pass, "not verifiable" or "not verified locally", with the reason.
10. **Report** in the shape of [REPORT-FORMAT.md](REPORT-FORMAT.md).

## Check categories

| Category | Rules |
|---|---|
| Build and runtime | [DISCOVER.md](DISCOVER.md) (build failures, runtime drift, URL sources) |
| Crawlability and SEO | [CHECKS-CRAWL.md](CHECKS-CRAWL.md) |
| Social previews | [CHECKS-SOCIAL.md](CHECKS-SOCIAL.md) |
| Icons and manifest | [CHECKS-SOCIAL.md](CHECKS-SOCIAL.md) |
| Structured data | [CHECKS-SOCIAL.md](CHECKS-SOCIAL.md) |
| Error and routing hygiene | [CHECKS-SITE.md](CHECKS-SITE.md) |
| Performance basics | [CHECKS-SITE.md](CHECKS-SITE.md#caching) |
| Security | [CHECKS-SECURITY.md](CHECKS-SECURITY.md) |
| Env/config parity | [CHECKS-SECURITY.md](CHECKS-SECURITY.md#envconfig-parity) |
| Accessibility basics | [CHECKS-OPS.md](CHECKS-OPS.md) |
| Legal and ops | [CHECKS-OPS.md](CHECKS-OPS.md#legal) |
| Conditional checks | [CHECKS-OPS.md](CHECKS-OPS.md#conditional-checks), each only when its signal shows |

## Environment capabilities

| If the environment has… | do | else |
|---|---|---|
| `node` 22 or later, `bun` or `deno` | run `scripts/probe.mjs` | gather the PROBE.md fact list with `curl` or `wget`, else the harness's web fetch; mark facts no tool can get as unverified |
| background commands | start the local server in the background and stop it by its handle | `<command> > <log> 2>&1 &`, keep `$!`, stop with `kill` |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |
