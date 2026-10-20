# Accessibility, legal, ops and conditional checks

Judge each rule from the probe facts ([PROBE.md](PROBE.md)) and the source. Tiers: **B** Blocker, **S** Should fix, **N** Nice to have. These are quick, high-signal checks; contrast and full WCAG audits need a browser with axe and stay out of scope. Legal facts below were checked against gesetze-im-internet.de (DDG, BFSG), Google's sender guidelines, RFC 9116 and the Apple and Android docs on 2026-10-20.

## Accessibility basics

`lang` and zoom are judged in [CHECKS-CRAWL.md](CHECKS-CRAWL.md#document-basics).

- An `html.images` entry with `alt` null (the attribute is missing) on a content image: S (WCAG 1.1.1). Decorative images take `alt=""`. Give the count across checked pages.
- `html.unnamedControls.count` above 0: S (WCAG 4.1.2), screen readers announce "button" or "link" with no name. Quote two examples, then find the icon component in the source and suggest an `aria-label`.
- **Focus**: in the source and the built CSS, `outline: none` or `outline: 0` on `:focus` or a broad selector (`*`, `a`, `button`), or Tailwind `outline-none` / `focus:outline-none`, with no `:focus-visible` style or `focus-visible:` ring replacing it: S (WCAG 2.4.7). Cite the line.
- `html.skipLink` null on pages with navigation before the main content: N (WCAG 2.4.1). `targetExists` false: S, the skip link goes nowhere.
- **Reduced motion**: animation in the source (`@keyframes`, `animation:`, Framer Motion, GSAP, Lottie, autoplaying video) with no `prefers-reduced-motion` handling (the media query, `useReducedMotion`, `MotionConfig reducedMotion="user"`, Tailwind `motion-safe:` or `motion-reduce:`): N.

## Legal

- **Privacy policy**: the site sets cookies (`security.cookies`), loads analytics, tag or pixel scripts (`assets.totals.thirdPartyHosts`, `html.scripts`), or has forms that collect personal data, and no `html.legalLinks` entry leads to a privacy policy: S.
- **Consent**: an EU signal (an EU-language `lang` or locale, an EU country domain, the DE/AT signal below) and analytics or ad scripts in the raw HTML, or non-essential cookies on the first response, with no consent manager in the source (OneTrust, Cookiebot, Usercentrics, Klaro, CookieYes, Didomi, iubenda, or a custom banner that gates the scripts): S. When a consent manager exists, add "verify yourself": trackers load only after consent.

## security.txt

- `wellKnown.securityTxt` not a 200 text file: N, researchers have no contact for reporting vulnerabilities. RFC 9116 places it at `/.well-known/security.txt`.
- Present but with no `contact`, no `expires`, or `daysToExpiry` below 0: N, invalid. `daysToExpiry` above 365: N, the RFC recommends under a year. Found only at `/security.txt` (see `tried`): N.

## Conditional checks

Each runs only when its signal shows in the source or the probe facts. The report header lists every one with "ran" and the signal, or "skipped" and the missing signal.

### Mail authentication

- **Signal**: a mail SDK or setting (`nodemailer`, `resend`, `@sendgrid/mail`, `postmark`, `mailgun.js`, `@aws-sdk/client-ses`, `@react-email/*`, SMTP env vars, Django `EMAIL_BACKEND`, Rails `action_mailer`, Laravel `MAIL_MAILER`).
- **Domain**: the sending address (`from:` in code, `MAIL_FROM`, `EMAIL_FROM`, `DEFAULT_FROM_EMAIL`), else the site's apex. Run `probe.mjs --mail-dns <domain>`, adding `--dkim-selector <name>` for a selector the provider config names.
- No SPF record and no DKIM key found: B. Gmail requires SPF or DKIM of every sender.
- More than one `spf.records`, `all` `+all`, or `lookups` above 10: B, SPF fails. `lookups` counts the top level only and nested includes add more, so 8 to 10: S. `all` `?all` or null: S.
- No `dmarc.records`: B. Gmail requires DMARC of bulk senders, and without it anyone can spoof the domain. `p` `none`: N, monitoring only, which Gmail accepts.
- No DKIM key at the provider's selector: B. No key at any common selector while the provider's is unknown: "verify yourself", DKIM is enabled in the provider's dashboard. `approxBits` under 1024: B, Gmail's minimum. 1024: N, 2048 is the norm.
- No `mx`, or a null MX (`exchange` empty): S, replies and bounces to the sending domain fail.
- Newsletter or marketing mail in the source without `List-Unsubscribe` and `List-Unsubscribe-Post` headers: S, Gmail requires one-click unsubscribe from bulk senders.

### Germany and Austria

- **Signal**: `lang` or a locale `de`, `de-DE` or `de-AT`, a `.de` or `.at` domain, or a `de` hreflang.
- **Imprint** (§5 DDG for commercial digital services): no `html.legalLinks` entry to an imprint (`impressum`, `imprint`, `legal-notice`) on every checked page: S. The law requires the provider information to be easy to recognize, directly reachable and always available, which in practice means a footer link. Probe the imprint page with `--pages-only`; one missing a name, a postal address or an email address: S.
- **Accessibility statement** (European Accessibility Act, in Germany the BFSG, in force for services from 28 June 2025): the site sells to consumers (cart, checkout, booking, paid signup) and no `legalLinks` entry leads to an accessibility statement (`barrierefreiheit`, `accessibility`): S. Add "verify yourself": micro-enterprises (fewer than 10 people and at most EUR 2 million turnover or balance sheet) are exempt for services.

### Migration redirects

- **Signal**: a redirect map (many entries in `redirects()`, `_redirects`, `vercel.json`, an nginx or `.htaccess` rule list, a CSV or JSON of old URLs) or an old domain named in the source.
- Pick up to 10 old URLs from the map and probe them with `--pages-only`. One that ends 404 or 5xx: B, inbound links and rankings are lost. Many old URLs landing on the homepage: B, search engines treat that as a soft 404. A 302 or 307 hop: S. More than one hop: N.

### Ads

- **Signal**: an ad script in the source or `html.scripts` (`adsbygoogle`, `googlesyndication`, `securepubads`, Prebid, `amazon-adsystem`, Mediavine, Ezoic, Taboola, Outbrain).
- `wellKnown.adsTxt` not a 200 text file, or `records` 0: S, many buyers skip inventory without it. `invalidLines` above 0: N.

### App links

- **Signal**: iOS `applinks:` entitlements, Expo `associatedDomains` or `intentFilters` with `autoVerify`, an `apple-itunes-app` meta tag, the files in the static folder, or the probe finding them.
- `appleAppSiteAssociation`: no 200 at either path, `redirects` above 0, `validJson` false, or neither `applinks` nor `webcredentials`: B. Apple requires HTTPS, a valid certificate and no redirects. Found only at the root path: N, Apple documents `/.well-known/`.
- `assetLinks`: not 200, `redirects` above 0, `validJson` false or `statements` 0: B. A `contentType` other than `application/json`: S, Android requires it.

### Blog feed

- **Signal**: blog or news routes, `Article` or `BlogPosting` JSON-LD, a Markdown or MDX content folder.
- No `html.feeds` entry on the homepage or the blog index: N, feed readers and aggregators find nothing.

## Verify yourself

Add an item only for something this scan found:

- An error-tracking SDK (`@sentry/*`, Bugsnag, Rollbar, Datadog RUM, LogRocket, PostHog): confirm events arrive from production, with the DSN or key set in the production environment.
- An analytics or tag ID: confirm production traffic appears under it.
