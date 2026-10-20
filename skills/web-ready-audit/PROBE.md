# Probe

`scripts/probe.mjs` fetches pages with read-only GETs and prints JSON facts. It judges nothing: the CHECKS files turn facts into findings. Paths are relative to this skill's folder.

## Run it

```sh
node scripts/probe.mjs <url> [<url>...]            # or: bun scripts/probe.mjs, deno run --allow-net scripts/probe.mjs
node scripts/probe.mjs --pages-only <url> [<url>...]
node scripts/probe.mjs --list-probes [--pages-only] [--api <path>]... <url>   # prints the planned requests, sends none
node scripts/probe.mjs --mail-dns <domain> [--dkim-selector <name>]...         # DNS only, for the mail check
```

- `--list-probes` prints `get[]` (each GET with its purpose and any special header), `tls[]`, `dns[]`, and `dependent[]` (requests whose URLs come from responses). Show it to the user before the first real run.
- `--api <path>` (repeatable) adds same-origin API routes to the CORS check.
- The first run (homepage) gathers site facts and page facts. `--pages-only` still reads robots.txt, so every page gets its robots verdict, but skips sitemaps, DNS and the homepage facts, and leaves `inSitemap` null: pages taken from the sitemap are in it by definition.
- A bare host gets `https://`; pass a local server as `http://localhost:<port>`. Localhost and private-network URLs (canonical targets, images) are fetched only when the target itself is local; otherwise they are `skipped`. Requests go one at a time, follow at most 10 redirects, and time out after 15 s each.
- A failed request becomes an `error` field on that fact, not a crash. Exit code 2 means no URL was given.

## Fact list

The single list of what an audit knows about a live site. A fallback tool gathers the same facts under the same names.

### Per site (`sites[]`)

One entry per origin that robots.txt resolves to.

- `robots`: GET `/robots.txt`. `status`, `finalUrl`, `redirects`, `contentType`, `bytes`; parsed `groups` (`agents`, lowercased, and `rules` of `allow`/`disallow` paths), `sitemaps` (its `Sitemap:` lines), `otherLines` (any other directive, such as `noindex:` or `crawl-delay:`, at most 20). Only a 200 response is parsed.
- `robots.googlebot`, `robots.aiCrawlers.<bot>`: the verdict for `/`, as `{ group, verdict, rule }`. `group` is the bot's own group, `*` when it falls back to the wildcard group, or null with no matching group. Matching follows Google: the bot's own groups else `*`, the longest matching rule wins, `allow` wins a tie, `*` and `$` wildcards apply. Bots: GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, CCBot, PerplexityBot.
- `sitemap`: the robots.txt `Sitemap:` URLs, else the first of `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml` that answers 200. Sitemap indexes are followed, up to 50 files; gzip is decoded.
  - `declaredInRobots`; `files[]` with `status`, `contentType`, `kind` (`urlset`, `sitemapindex` or `not-xml`), `locs`, `lastmods`.
  - `urlCount` (all `<loc>`s in url sets), `urls` (the first 500), `urlsTruncated`, `hosts` (`<loc>` count per scheme and host), `lastmodCount`, `distinctLastmods`.
- `security` (null with `--pages-only`):
  - `tls`: for an https, non-local origin, the host and its www or apex twin: `host`, `resolves`, `authorized`, `authorizationError`, `coversHost` (a SAN matches the host), `protocol`, `issuer`, `altNames`, `validTo`, `daysLeft`. Bun's `fetch` accepts a certificate for the wrong host, so certificate verdicts come from these facts, not from page errors.
  - `exposedFiles[]`: GETs of the first 4 KB of `/.env`, `/.env.local`, `/.env.production`, `/.git/HEAD`, `/.git/config`, `/.DS_Store`, `/.npmrc`, `/backup.zip`, `/backup.tar.gz`, `/backup.sql`, `/dump.sql`, `/database.sql`: `path`, `status`, `finalUrl`, `contentType`, `exposed` (true only when the body matches that file's format, so a fallback page is not counted).
  - `graphql[]`: GET `/graphql` and `/api/graphql` with a minimal introspection query: `path`, `status`, `contentType`, `graphql` (the body is a GraphQL response), `introspection` (it returned `__schema`).
  - `cors[]`: GET of `/`, each GraphQL path that answered, and each `--api` path with `Origin: https://evil.example`: `url`, `status`, `allowOrigin`, `allowCredentials`, `reflected`, `vary`.
- `routing` (null with `--pages-only`):
  - `notFound`: GET of `/web-ready-audit-404-<random>`: `status`, `finalUrl`, `redirects`, `contentType`, `title`, `sameTitleAsHome`, `metaRobots`, `internalLinkCount`.
  - `httpToHttps` (`http://<host>/`) and `twinHost` (`https://<www or apex twin>/`): `status`, `finalUrl`, `redirects`, or `error`. Null for an http or local origin.
  - `trailingSlash`: the first internal link with a path and no file extension (`link`), requested with its trailing slash toggled: `status`, `finalUrl`, `redirects`. Null with no such link.
- `wellKnown` (null with `--pages-only`): `securityTxt` (`/.well-known/security.txt`, else `/security.txt`), `adsTxt` (`/ads.txt`), `appleAppSiteAssociation` (`/.well-known/apple-app-site-association`, else the root path), `assetLinks` (`/.well-known/assetlinks.json`). Each: the first path answering 200 with a non-HTML body, else the last answer: `path`, `status`, `finalUrl`, `redirects`, `contentType`, `bytes`, `tried` (every path's `status` and redirect count). Parsed on success: security.txt `contact[]`, `expires`, `daysToExpiry`, `signed`; ads.txt `records`, `invalidLines`; the JSON files `validJson` (or `parseError`), `applinks`, `webcredentials`, `statements`.
- `dnsVerification`: TXT records starting `google-site-verification` or `yandex-verification`, for the host and for the host without `www.`. Bing verifies DNS through a CNAME, which is not read.

### Per page (`pages[]`)

- `url`, `finalUrl`, `status`, `redirects` (each hop's `url`, `status`, `location`), `ms`, `contentType`, `bytes`, `headers` (all response headers of the final hop, lowercased).
- `security`: `hsts` (`maxAge`, `includeSubDomains`, `preload`); `csp`, `cspReportOnly`, `cspMeta` (directive name to source list, from the header, the report-only header and a `<meta http-equiv>`); `cookies[]` from every hop's `Set-Cookie` (`name`, `setBy`, `secure`, `httpOnly`, `sameSite`, `domain`, `path`, `persistent`).
- `blocked`: set when a bot challenge answered (Cloudflare or Vercel), so the page is unreadable, not missing.
- `platform`: `vercel`, `netlify` or `cloudflare` from response headers, else null.
- `xRobotsTag`: the `X-Robots-Tag` header. `canonicalHeader`: a `rel=canonical` in the `Link` header.
- `robotsTxt`: `{ path, group, verdict, rule }` for Googlebot. The path is the final URL's on the same origin, the requested one after a cross-origin redirect.
- `inSitemap`: the requested or final URL is among `sites[].sitemap.urls`. False can mean the sitemap was truncated.
- `canonicalTarget`: when the first canonical differs from `finalUrl`, a GET of it: `status`, `finalUrl`, `redirects`. A localhost or private-network target is `skipped`.
- `html` (HTML responses only), read from the raw response with comments, scripts and styles removed:
  - `lang` of `<html>`; `titles[]`; `descriptions[]` (`meta name=description`); `canonicals[]` (`href` and `resolved` against `<base>` or the page).
  - `metaRobots[]` (`robots`, `googlebot`, `bingbot` metas); `viewport[]`; `hreflang[]` (alternate links); `verification` (`google-site-verification`, `msvalidate.01`, `yandex-verification` metas).
  - `openGraph` and `twitter`: every `og:*` and `twitter:*` meta (by `property` or `name`), as a list of contents per key, since `og:image` may repeat.
  - `icons[]` (`icon`, `shortcut icon`, `apple-touch-icon*` and `mask-icon` links: `rel`, `href`, `resolved`, `sizes`, `type`); `manifest` (the resolved `rel=manifest` URL); `base` (the URL relative links resolve against).
  - `jsonLd[]`, one per `application/ld+json` script in head or body: `valid`, `types` (every `@type`, nested ones included), `bytes`, and `data` (the parsed value, when at most 20 KB; else `truncated`). An invalid block has `error` and an `excerpt` instead.
  - `mixedContent` (https pages only, else null): up to 20 `http://` subresources in `src`, `srcset`, `href`, `data` or a form `action`: `tag`, `url`, `active` (script, stylesheet, iframe, object or embed, which browsers block).
  - `scripts[]` (`src`, `type`, `async`, `defer`, `inHead`) and `scriptCount`; `inlineScriptBytes` (non-JSON inline scripts); `stylesheets[]`; `resourceHints[]` (`preconnect`, `dns-prefetch`, `preload`, `modulepreload`: `rel`, `href`, `as`); `images[]` (`src`, `srcset`, `loading`, `fetchpriority`, `width`, `height` attributes) and `imageCount`. Lists hold at most 50.
  - `images[].alt` is null when the attribute is missing (an empty string is a decorative image). `feeds[]` (RSS or Atom alternate links: `type`, `href`). `skipLink` (one of the first five links pointing to `#...` with skip wording: `href`, `text`, `targetExists`). `unnamedControls` (links and buttons with no text, image alt, `aria-label`, `aria-labelledby` or `title`: `count`, up to 5 `examples`). `legalLinks[]` (links whose path or text names an imprint, privacy, terms, cookies or accessibility page: `href`, `text`, at most 20).
  - `bodyTextLength` (visible text characters); `emptyMount` (the id of an empty `root`/`app`/`__next` mount div, a sign of a client-rendered shell); `internalLinks` (`count` and the first 100 same-origin `<a href>`s).

- `socialImages[]`: each distinct URL in `og:image`, `og:image:url`, `og:image:secure_url`, `twitter:image` and `twitter:image:src`, at most 4: `tag`, `href`, `resolved`, plus the image facts.

### Homepage facts (`pages[]`, null with `--pages-only`)

- `icons`: `linked[]` (each of `html.icons`, at most 10), `faviconIco` (`/favicon.ico`), `appleTouchFallback` (`/apple-touch-icon.png`, only when no apple-touch-icon is linked; iOS requests it anyway). Each carries the image facts, and a same-origin one also `robotsTxt` for Googlebot-Image, which falls back to the Googlebot group, then `*`.
- `manifest`: GET of `html.manifest`: `status`, `finalUrl`, `redirects`, `contentType`, `parseError`; the fields `id`, `name`, `short_name`, `start_url`, `scope`, `display`, `theme_color`, `background_color`, `prefer_related_applications`; `iconCount` and `icons[]` (the first 10: `src`, `sizes`, `type`, `purpose`, plus the image facts).
- `assets`: full GETs of the first 20 `html.scripts`, 10 `html.stylesheets` and 10 `html.images`. Scripts and stylesheets: `url`, `finalUrl`, `status`, `contentType`, `bytes` (decoded), `encodedBytes` (`Content-Length`, null when the response is chunked), `contentEncoding`, `cacheControl`, `hashed` (the file name holds a content hash: a dot- or dash-separated part of 8+ characters mixing letters with digits, or 3+ capitals among lowercase), `thirdParty` (last two host labels differ from the page's, `www.` ignored). Images: the `html.images` fields plus the image facts. `totals`: `scriptBytes`, `styleBytes`, `imageBytes`, `thirdPartyScriptBytes`, `thirdPartyHosts`.
- `scrapers.facebookexternalhit`, `scrapers.Twitterbot`: the page re-fetched with that scraper's user agent: `status`, `finalUrl`, `blocked`, `ogTitle`, `ogImage`, `twitterCard`.

### Image facts

Shared by preview images, icons and manifest icons. Each URL is fetched once per run, with a 64 KB range request, then a full GET when the size sits further into the file.

- `finalUrl`, `status` (206 when the range was honored), `redirects`, `contentType`, `bytes` (the whole file's size).
- `format` from the file's first bytes, not its content type: `png`, `jpeg`, `gif`, `webp`, `avif`, `heif`, `ico` (plus `icoSizes`), `bmp` or `svg`; null for anything else, such as an HTML error page.
- `width`, `height` in pixels (an SVG's `width`/`height`, else its `viewBox`); null when unreadable.

### Mail DNS (`--mail-dns`)

Run only for the mail check. `domain`; `mx[]` (`exchange`, `priority`); `spf` (`records` starting `v=spf1`, `all` qualifier, `lookups`: top-level `include`, `a`, `mx`, `ptr`, `exists` and `redirect` terms); `dmarc` (`records` at `_dmarc.<domain>`, `p`, `sp`, `rua`, `pct`); `dkim` (`checked` selectors, the common ones plus each `--dkim-selector`, and `found`: per selector `type`, `revoked` for an empty key, `approxBits` for RSA). Bun returns each 255-byte chunk of a TXT record as its own record; the probe joins them back.

## Without a JS runtime

Gather the fact list with the best detected tool, under the same names:

- **curl**: `curl -sS -A '<browser UA>' --max-redirs 0 -D - -o <file> <url>` per hop, following `Location` by hand to record `redirects`. Parse robots.txt, sitemaps and the head from the saved bodies with the same rules as above. DNS TXT: `dig +short TXT <host>` or `nslookup -type=TXT <host>`.
- **wget**: `wget -S --max-redirect=0 -O <file> <url>` per hop, the same way.
- **Mail DNS**: `dig +short TXT <domain>`, `dig +short TXT _dmarc.<domain>`, `dig +short TXT <selector>._domainkey.<domain>`, `dig +short MX <domain>`.
- **TLS**: `openssl s_client -connect <host>:443 -servername <host> </dev/null | openssl x509 -noout -enddate -ext subjectAltName`.
- **Image facts**: save each image (`curl -sS -r 0-65535 -D - -o <file> <url>`, a full GET when the size is missing) and read `format`, `width` and `height` with `file <file>` (PNG, JPEG, GIF, WebP), or `sips -g pixelWidth -g pixelHeight <file>` on macOS. `bytes` comes from the `Content-Range` total.
- **Harness web fetch only**: it usually follows redirects and may render or summarize the page. Use it for robots.txt and sitemap bodies; mark `redirects`, `headers`, `xRobotsTag` and raw-HTML facts unverified unless it returns the raw response.

Any fact no available tool can get is "unverified" in the report header, and its checks are "not verifiable".
