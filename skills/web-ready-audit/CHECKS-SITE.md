# Error, routing and performance checks

Judge each rule from the probe facts ([PROBE.md](PROBE.md)) and the source. Tiers: **B** Blocker, **S** Should fix, **N** Nice to have. In a local run, the http, twin-host and CDN rules come from the config files in [STACKS.md](STACKS.md#headers-and-redirects); with none, they read "not verified locally".

## Not found and errors

From `sites[].routing.notFound`, a GET of a path that cannot exist.

- `status` 200: S, a **soft 404**. Search engines index error pages as content, and broken links look fine. `sameTitleAsHome` true is the usual SPA cause: the host serves `index.html` for every path. Fix: return 404 for unknown routes (a catch-all route that sets the status, the host's 404 rule, or a prerendered `404.html`).
- A redirect to the homepage or another page: S, also a soft 404.
- `status` 5xx or an `error`: B, unknown URLs crash the server.
- A 404 with no internal links (`internalLinkCount` 0): N, visitors land on a dead end.
- No custom not-found page in the source (`not-found.*`, `pages/404.*`, `404.html`, `404.astro`, `+error.svelte`, `error.vue`, a `**` or `*` route, a Django or Rails `404` template): N.
- No error boundary or custom 500 page (`error.tsx`, `global-error.tsx`, `pages/_error.*`, a root `ErrorBoundary`, `500.html`): N, users see the framework's raw error page.
- **Deep links**: an SPA with client-side routes deployed as static files without a rewrite to `index.html` (no `_redirects`, `vercel.json` rewrite, `try_files` or host SPA setting): B, any refresh or shared link off the homepage returns the host's 404. Confirm on the live site: a probed route ends 404 while the homepage works.

## Redirects

- `httpToHttps`: `finalUrl` not `https://`: B, the site is served over plain http. First hop 302 or 307: S, use 301 or 308 so the redirect is cached and passes signals. More than two hops: N.
- `twinHost` (the www or apex form): ends 200 on its own host instead of redirecting: S, two copies of every page. Redirects with 302 or 307: S. An `error`: judged by the TLS rules in [CHECKS-SECURITY.md](CHECKS-SECURITY.md#tls-and-https).
- `trailingSlash` (the first internal link with its slash toggled): ends 200 at a URL different from `link`, while the page's canonical does not point to one form: S, duplicate URLs. Redirects with 302 or 307: N.
- Internal links or sitemap URLs that redirect (from the page facts): S, link to the final URL.

## Caching

From each page's `headers` and the homepage's `assets`.

- HTML `cache-control` with `max-age` over 600 or `immutable` (browser cache, not `s-maxage`): S. After a deploy, cached HTML keeps pointing at deleted hashed assets. Use `no-cache`, or `max-age=0, must-revalidate`.
- An asset with `hashed` true whose `cacheControl` lacks a `max-age` of at least 31536000: S, it is re-downloaded although its URL changes on every deploy. A year without `immutable`: N.
- An asset with `hashed` false and `max-age` over 86400 without revalidation: S, users get stale files after a deploy. Fix: hashed file names, or a short cache.
- A text asset (script, stylesheet, HTML) over 1 KB with no `contentEncoding`: S, serve gzip, Brotli or zstd.

## Asset weight

`bytes` is the decoded size (what the browser parses).

- `totals.scriptBytes` over 1 MB on the homepage: S. Name the largest files.
- One image over 500 KB: S. A `jpeg` or `png` over 200 KB: N, serve AVIF or WebP. `totals.imageBytes` over 2 MB: S.
- The first `<img>` in `html.images` with `loading` `lazy`: S, it is usually the largest paint and lazy loading delays it. More than three images and none `lazy`: N.
- An `<img>` without `width` and `height` (and no `srcset` with a sized container in the source): N, it shifts the layout as it loads.
- `html.scriptCount` over 30 or `inlineScriptBytes` over 100 KB: N.

## Render blocking and third parties

- A script with `inHead` true and none of `async`, `defer` or `type="module"`: S, it blocks rendering.
- `totals.thirdPartyHosts` above 5, or `thirdPartyScriptBytes` over 300 KB: S, "heavy third-party scripts"; name the hosts. In the source, find where they load (tag manager, chat widget, A/B test) and suggest deferring them or loading them on interaction.
- A third-party host serving a stylesheet, font or blocking script, with no `preconnect` in `html.resourceHints`: N. More than four `preconnect` hints: N, each costs a connection.
- Core Web Vitals (LCP, INP, CLS) need field data or a browser lab run: never a finding here; name them under "Not verifiable" only when the user asked about performance.
