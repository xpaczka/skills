# Security and env/config parity checks

Judge each rule from the probe facts ([PROBE.md](PROBE.md)) and the source. Tiers: **B** Blocker, **S** Should fix, **N** Nice to have. In a local run, header, TLS and redirect rules come from the config files in [STACKS.md](STACKS.md#headers-and-redirects); with none, they read "not verified locally".

## Leaked secrets

Search the tracked files (`git ls-files`, lockfiles excluded) and the client build output (the static or client folder the build wrote) for:

- Key shapes: `AKIA[0-9A-Z]{16}` (AWS), `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `sk_live_` and `rk_live_` (Stripe), `ghp_`, `github_pat_`, `glpat-`, `xox[baprs]-` (Slack), `sk-ant-` (Anthropic), `sk-proj-` (OpenAI), `SG\.[A-Za-z0-9_-]{22}\.` (SendGrid), a JWT whose payload holds `"role":"service_role"` (Supabase; base64 `c2VydmljZV9yb2xl`).
- Secret-looking names under a client prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `NUXT_PUBLIC_`, `REACT_APP_`, `GATSBY_`, `EXPO_PUBLIC_`): `*SECRET*`, `*PRIVATE*`, `*SERVICE_ROLE*`, `*PASSWORD*`, a `DATABASE_URL`. The build inlines these into public JavaScript.

Rules:

- A secret in the client build output, or in a tracked file: B. Quote the file and the first characters only, never the whole value. Fix: rotate it, then move it to a server-only variable; a committed secret stays in git history.
- A tracked `.env*` file other than `.env.example` (or `.sample`, `.template`) holding real values: B.
- A Google `AIza` key in the client: not a finding by itself (Maps and Firebase keys are public by design). Add "verify yourself": the key is restricted by HTTP referrer and API.

## Env/config parity

Production must point at production. Read `.env.production`, the deploy config, the production settings file, and grep the client build output.

- A test or preview value reaching production: a Stripe `pk_test_` key, an API or auth base URL on `localhost`, a staging host, a preview host (`*.vercel.app`, `*.netlify.app`, `*.pages.dev`) or a raw IP; an analytics, tag or pixel ID that is a placeholder (`G-XXXXXXX`, `your-`, `changeme`, `TODO`) or empty: B.
- Debug mode on in production config: Django `DEBUG = True` without an environment gate, Rails `config.consider_all_requests_local = true` in `production.rb`, Laravel `APP_DEBUG=true` in a production env file: B, error pages leak code and settings.
- A value read from a variable that is set only in the platform dashboard (invisible in the repo) and that decides test or live mode: add "verify yourself", naming the variable and the value production needs.
- Public source maps (`productionBrowserSourceMaps: true`, Vite `build.sourcemap: true`, `.map` files in the output): N, the client source is readable.

## TLS and HTTPS

- The target is `http://` and HTTPS does not work for its host: B.
- `sites[].security.tls[0]`: `authorized` false, `coversHost` false, an `error`, or `daysLeft` below 0: B. `daysLeft` under 14: S, confirm auto-renewal. `protocol` TLSv1 or TLSv1.1: S.
- `tls[1]` (the www or apex twin) `resolves` but its certificate fails the same way: B, users who type that form get a certificate error. It does not resolve while the target is the apex or `www` host: S. The target is another subdomain: no finding.

## Headers

From each page's `headers` and `security` facts.

- HSTS (`security.hsts`) missing on an https page: S. `maxAge` under 31536000: N. `includeSubDomains` and `preload`: N, never required.
- Clickjacking: neither a `frame-ancestors` directive in `security.csp` nor an `x-frame-options` header: S. `frame-ancestors` in `cspMeta` only does not count; browsers ignore it in a meta tag.
- No CSP at all (`csp` and `cspMeta` null): N. A CSP only in `cspReportOnly`: N, it is not enforced. `script-src` (else `default-src`) allows `'unsafe-inline'` without a nonce, hash or `'strict-dynamic'`: N.
- `x-content-type-options` missing or not `nosniff`: N.
- `permissions-policy` missing: N. `x-powered-by` present, or a `server` header with a version number: N, it advertises the stack.
- `x-xss-protection` set to anything but `0`: N, remove it. Its absence, `Referrer-Policy` absence (browsers default to `strict-origin-when-cross-origin`), and missing `Expect-CT` or `Public-Key-Pins` are never findings.

## Cookies

An **auth cookie** has a session-like name (`sess`, `sid`, `auth`, `token`, `jwt`, `login`) or comes from the app's session or auth config. Anonymous page loads rarely receive one, so also read that config in the source (`cookie: { secure, httpOnly, sameSite }`, `cookies().set(`, `res.cookie(`, `SESSION_COOKIE_SECURE`, Rails `secure:`).

- An auth cookie without `secure` on an https site, or without `httpOnly`: B.
- Any cookie with `sameSite` `None` and no `secure`: B, browsers reject it.
- A non-auth cookie without `secure` on an https site: N. The `__Host-` prefix: N, never required.

## Mixed content

- An `html.mixedContent` entry with `active` true (script, stylesheet, iframe, object): B, browsers block it and the page breaks.
- A passive entry (image, media) or a `form` posting to `http://`: S.
- In the source, find the hard-coded `http://` URL and cite it.

## Exposed files and endpoints

- A `sites[].security.exposedFiles` entry with `exposed` true: B. Quote the path and status, never the content. Fix: remove it from the deployed folder and deny dotfiles at the server. A 200 with `exposed` false is the app's fallback page: no finding.
- The static folder in the source holds `.env*`, `.git`, a database dump or a backup archive: B, the build will publish it.
- A `graphql` entry with `introspection` true: B, "confirm it is intended for a public API". In a local run, judge from the server config (`introspection:` options often depend on `NODE_ENV`).

## CORS

Before the homepage run, pass up to 5 same-origin GET API routes from the source that return user data (`/api/me`, `/api/user`, `/api/session`, `/api/auth/session`) with `--api <path>`.

- A `cors` entry with `reflected` true and `allowCredentials` `true`: B, any site can read the user's data with their cookies.
- `reflected` true without credentials, or `allowOrigin` `*` on an API route that returns user data: S.
- `allowOrigin` `*` on pages and static files: no finding.

## Dependencies

Run the package manager's audit for production dependencies: `npm audit --omit=dev --audit-level=high`, `pnpm audit --prod --audit-level high`, `yarn npm audit --environment production --severity high` (Yarn 2+), `bun audit` (no production filter; keep only production packages), `pip-audit`, `bundle audit`. It sends the dependency list to the registry, so name it in the request list.

- A high or critical advisory in a production dependency: S. List the package, the severity and the fixed version.
- No network or no audit tool: not verifiable.

## Rate limiting and spam protection

Find the auth flows (login, signup, password reset, magic link, OTP), the contact and newsletter forms, and endpoints that send mail or cost money (SMS, AI calls).

- None of them shows a limiter or bot protection (`express-rate-limit`, `rate-limiter-flexible`, `@upstash/ratelimit`, `@arcjet/*`, `django-ratelimit`, `rack-attack`, Laravel `throttle`, Turnstile, hCaptcha, reCAPTCHA, a honeypot field, a firewall rule in the deploy config): S. Word it as "none found in the source; ignore if set in the platform's firewall or WAF".
