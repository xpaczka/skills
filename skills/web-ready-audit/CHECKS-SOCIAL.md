# Social previews, icons and structured data checks

Judge each rule from the probe facts ([PROBE.md](PROBE.md)) and the source. Tiers: **B** Blocker, **S** Should fix, **N** Nice to have. A page "meant to be shared" is the homepage or any content template (article, product, landing page); account, cart and search pages are not.

Platform limits below were checked against Google Search Central, the Facebook sharing docs and web.dev on 2026-10-20.

## Preview image

An image is **broken** when its `socialImages` entry has an `error`, is `skipped` (a localhost or private-network URL), ends with a `status` other than 200 or 206, has `format` null (usually an HTML error page), or `format` `svg` (no preview platform renders SVG). In the source, find what builds the URL: an `og:image` tag, a metadata API, an image-route file convention (`opengraph-image.*`), or a base URL that is localhost in production.

- No `og:image` on a page meant to be shared: B. Every share renders as a bare link.
- An `og:image` or `twitter:image` that is broken: B.
- `width` or `height` under 200: B, Facebook drops it. Under 600x315: S, platforms show a small thumbnail instead of a large card. Aim for 1200x630.
- Aspect ratio outside about 1.7 to 2.1 (1.91:1 is the target): N, the image is cropped.
- `bytes` over 5 MB: B, X rejects it (Facebook's limit is 8 MB).
- `href` relative or protocol-relative: S. Open Graph requires absolute URLs and some scrapers do not resolve them.
- No `og:image:width` and `og:image:height`: N. Facebook renders no image on the first share of a URL until it has processed it.
- No `og:image:alt`: N.

## Open Graph text

- `og:title` missing: S. Scrapers fall back to `<title>`, inconsistently across platforms.
- The same `og:title` or `og:image` on pages of different templates (usually a root-layout default): S, every share looks like the homepage.
- `og:url` differs from the page's canonical: S, shares are attributed to the other URL. Missing: N.
- `og:description` missing while a meta description exists: N. Both missing: S.
- `og:type` or `og:site_name` missing: N.

## X cards

- `twitter:card` missing: S. X takes title, description and image from Open Graph but needs the card type to render a card. Suggest `summary_large_image` when there is an image.
- `twitter:card` is not one of `summary`, `summary_large_image`, `app`, `player`: S.
- `twitter:title`, `twitter:description` and `twitter:image` are never required when the Open Graph tags exist.

## Scraper view

Compare `scrapers.facebookexternalhit` and `scrapers.Twitterbot` with the browser fetch of the same page.

- `status` other than 200, an `error`, or `blocked` set: B. Previews fail on that platform, usually a bot rule in the WAF or CDN. Fix: allow the scraper user agents.
- `ogImage` or `ogTitle` null for a scraper while the browser fetch has them: B. The server varies HTML by user agent.
- A different `ogImage` or `ogTitle` for a scraper: S, confirm it is intended.

## Favicon and touch icons

The favicon is what `icons.linked` entries with rel `icon` or `shortcut icon` point to, else `icons.faviconIco`. Google Search shows it beside every result.

- No favicon (no linked icon works and `faviconIco` is not a working image): S. Tabs, bookmarks and search results show a generic icon.
- A linked icon that is broken: S.
- **Google Search** accepts rel `icon`, `shortcut icon`, `apple-touch-icon` and `apple-touch-icon-precomposed`, on the domain or subdomain home page, in BMP, GIF, ICO, PNG, JPEG, PPM or TIFF, square, at least 8x8. No such icon: S, "Google Search shows a generic icon"; the common cause is an SVG-only favicon, fixed by adding a PNG or ICO. Every accepted icon at 48x48 or smaller: N, Google recommends larger.
- A favicon whose `robotsTxt.verdict` is `disallowed`: S. Googlebot-Image must be able to fetch it.
- No working apple-touch-icon (none linked, and `appleTouchFallback` not a working image): N. iOS uses a page screenshot on the home screen. Under 180x180: N.
- `mask-icon` is legacy Safari: never a finding.

## Web manifest

The app "means to be installable" when the source registers a service worker or handles `beforeinstallprompt`.

- No manifest: N, or S when the app means to be installable.
- A linked manifest with `status` other than 200, an `error` or a `parseError`: S.
- `contentType` neither `application/manifest+json` nor `application/json`: N.
- **Install criteria** (Chrome): `name` or `short_name`; `icons` with a 192px and a 512px icon; `start_url`; `display` one of `fullscreen`, `standalone`, `minimal-ui`, `window-controls-overlay`; `prefer_related_applications` absent or false. A gap: S when the app means to be installable, else N.
- A manifest icon that is broken: S. Its `width`x`height` differs from its declared `sizes`: N.

## Structured data

Google's search gallery (updated 2026-10-16) lists these features: Article, Breadcrumb, Carousel, Course list, Dataset, Discussion forum, Education Q&A, Employer aggregate rating, Event, Image metadata, Job posting, Local business, Math solver, Movie, Organization, Product, Profile page, Q&A, Recipe, Review snippet, Software app, Speakable, Subscription and paywalled content, Vacation rental, Video. Markup of other schema.org types is harmless: never a finding.

- A block with `valid` false: S. Google ignores the whole block; quote its `error`.
- FAQPage (rich result retired 2026-05-07) or HowTo (retired 2023) markup on a page: N, "no longer produces a rich result in Google". It does no harm.
- **Required properties** of a gallery type found in `data`. Product: `name`, plus one of `offers`, `review`, `aggregateRating`; an Offer needs `price` or `priceSpecification.price`. BreadcrumbList: `itemListElement` with at least two ListItems, each with `item` (the last may omit it). Event: `name`, `startDate`, `location` with `location.address`. Any other gallery type: read its Google Search Central page's "Required properties" when web fetch is available, else name it as "check in the Rich Results Test". A missing required property: S, the page is not eligible for that rich result.
- A block with `truncated` set: judge its `types` only; its required properties are not verifiable.
- No `WebSite` block with `name` and `url` on the homepage: N. Google uses it to pick the site name in results, and reads it only on the domain or subdomain root.
- A product page with no `Product` markup: S. An article page with no `Article` markup: N.
- JSON-LD that the source injects from client JavaScript only (absent from the raw HTML): N. Google reads it after rendering, other consumers do not. For Product: S, Google warns that JavaScript-generated product markup makes Shopping crawls less frequent and less reliable.
