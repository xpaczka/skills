# Probe

`scripts/probe.mjs` fetches pages with read-only GETs and prints JSON facts. It judges nothing: the CHECKS files turn facts into findings. Paths are relative to this skill's folder.

## Run it

```sh
node scripts/probe.mjs <url> [<url>...]            # or: bun scripts/probe.mjs, deno run --allow-net scripts/probe.mjs
node scripts/probe.mjs --pages-only <url> [<url>...]
```

- The first run (homepage) gathers site facts and page facts. `--pages-only` still reads robots.txt, so every page gets its robots verdict, but skips sitemaps and DNS, and leaves `inSitemap` null: pages taken from the sitemap are in it by definition.
- A bare host gets `https://`. Requests go one at a time, follow at most 10 redirects, and time out after 15 s each.
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
- `dnsVerification`: TXT records starting `google-site-verification` or `yandex-verification`, for the host and for the host without `www.`. Bing verifies DNS through a CNAME, which is not read.

### Per page (`pages[]`)

- `url`, `finalUrl`, `status`, `redirects` (each hop's `url`, `status`, `location`), `ms`, `contentType`, `bytes`, `headers` (all response headers of the final hop, lowercased).
- `blocked`: set when a bot challenge answered (Cloudflare or Vercel), so the page is unreadable, not missing.
- `platform`: `vercel`, `netlify` or `cloudflare` from response headers, else null.
- `xRobotsTag`: the `X-Robots-Tag` header. `canonicalHeader`: a `rel=canonical` in the `Link` header.
- `robotsTxt`: `{ path, group, verdict, rule }` for Googlebot. The path is the final URL's on the same origin, the requested one after a cross-origin redirect.
- `inSitemap`: the requested or final URL is among `sites[].sitemap.urls`. False can mean the sitemap was truncated.
- `canonicalTarget`: when the first canonical differs from `finalUrl`, a GET of it: `status`, `finalUrl`, `redirects`. A localhost or private-network target is `skipped`, not fetched.
- `html` (HTML responses only), read from the raw response with comments, scripts and styles removed:
  - `lang` of `<html>`; `titles[]`; `descriptions[]` (`meta name=description`); `canonicals[]` (`href` and `resolved` against `<base>` or the page).
  - `metaRobots[]` (`robots`, `googlebot`, `bingbot` metas); `viewport[]`; `hreflang[]` (alternate links); `verification` (`google-site-verification`, `msvalidate.01`, `yandex-verification` metas).
  - `bodyTextLength` (visible text characters); `emptyMount` (the id of an empty `root`/`app`/`__next` mount div, a sign of a client-rendered shell); `internalLinks` (`count` and the first 100 same-origin `<a href>`s).

## Without a JS runtime

Gather the fact list with the best detected tool, under the same names:

- **curl**: `curl -sS -A '<browser UA>' --max-redirs 0 -D - -o <file> <url>` per hop, following `Location` by hand to record `redirects`. Parse robots.txt, sitemaps and the head from the saved bodies with the same rules as above. DNS TXT: `dig +short TXT <host>` or `nslookup -type=TXT <host>`.
- **wget**: `wget -S --max-redirect=0 -O <file> <url>` per hop, the same way.
- **Harness web fetch only**: it usually follows redirects and may render or summarize the page. Use it for robots.txt and sitemap bodies; mark `redirects`, `headers`, `xRobotsTag` and raw-HTML facts unverified unless it returns the raw response.

Any fact no available tool can get is "unverified" in the report header, and its checks are "not verifiable".
