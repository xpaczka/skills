# Discover, build and serve

Read this file to find the app, its runtime and its production URL, run the build, and serve the build locally when there is no live URL. [STACKS.md](STACKS.md) is the shortcut table for known stacks. Shell commands run from the app folder.

## The app

- `[path]` given: that folder is the app.
- Otherwise look for workspaces (`pnpm-workspace.yaml`, `package.json` `workspaces`, `turbo.json`, `nx.json`, `lerna.json`, an `apps/` folder). A web app is a package with a framework marker from STACKS.md, an `index.html`, or a server that renders HTML. One web app: audit it. Several: ask which one and audit only that.
- Read shared packages only where the app imports its layout, head or metadata from them.

## The four questions

Every stack, known or not, gets the same full audit. Answer these from the app's own files (`package.json` scripts, framework config, `Dockerfile`, `Procfile`, the deploy config, the server entry) before reaching for STACKS.md:

1. **Head**: which files or APIs produce the HTML `<head>` (layouts, templates, `index.html`, a metadata or head API, a server template).
2. **Build**: the command that makes the production artifact, and where its output goes.
3. **Serve**: the command that runs the artifact the way production does (a `start`, `preview` or `serve` script, the `Dockerfile` `CMD`, the `Procfile` `web:` line).
4. **Static and edge config**: where static files live (robots.txt, icons, manifest) and which files set headers and redirects.

Done when each question has an answer citing a file, or "none" (a static site has no serve command). An unrecognized stack is answered the same way; it gets no "best-effort" label.

## Runtime and tools

1. **Declared runtime**: read `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`, `package.json` `engines`, `packageManager` and `volta`, `bun.lock` or `bun.lockb`, `deno.json`, and for other languages `.python-version`, `pyproject.toml` `requires-python`, `.ruby-version`, `Gemfile` `ruby`, `composer.json` `require.php`.
2. **Installed runtime**: `node --version` (or `bun --version`, `python3 --version`, ...). When it does not satisfy the declared one, use a version manager the machine has (`fnm`, `nvm`, `mise`, `volta`); with none, continue and put "built on <installed>, project declares <declared>" in the header, since the build may differ from production.
3. **Package manager**: from the lockfile (`package-lock.json` npm, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn, `bun.lock(b)` bun, `deno.lock` deno, `uv.lock` uv, `poetry.lock` poetry, `Gemfile.lock` bundler, `composer.lock` composer), else `packageManager`.
4. **Tools**: check for `node` 22 or later, `bun`, `deno`, `python3`, `curl`, `wget`, and the harness's browser or web-fetch tools. The probe runs on the project's JS runtime when it qualifies, else on any detected one; the header names the tool chosen.

**Runtime drift** is a finding: the declared version disagrees with the one the deploy builds on (`Dockerfile` `FROM node:18`, `NODE_VERSION` in `netlify.toml`, the Node version in Vercel's `engines`, a CI `node-version` or `python-version`): S, production builds on a runtime that was never tested. Quote both values with their files.

## Target URL

Precedence: the `[url]` argument, then a production URL found in the repo, then the local build.

Search the repo in this order and keep every candidate with its `file:line`:

1. Framework config: Next `metadataBase`, Astro `site`, Nuxt `site.url` or `NUXT_SITE_URL`, Hugo `baseURL`, Gatsby `siteMetadata.siteUrl`, Django `ALLOWED_HOSTS` or a `SITE_URL` setting, Rails `config.action_mailer.default_url_options` host.
2. Sitemap or robots generator config: `next-sitemap.config.*` `siteUrl`, a `hostname` option.
3. `.env.production`, then `.env`: `*SITE_URL`, `APP_URL`, `BASE_URL`, `PUBLIC_URL` (skip localhost and private hosts).
4. `CNAME` at the root or in the static folder.
5. Deploy config: `vercel.json`, `netlify.toml`, `wrangler.toml` routes, `fly.toml`.
6. CI workflows: `environment.url`.
7. `package.json` `homepage`.
8. README links: the weakest source; use one only after the user confirms it.

- One distinct origin: it is the target. The header says where it came from.
- Several distinct origins: list them with their files and ask which to audit. Report the mismatch as a finding: S, "production URL sources disagree", citing each. The canonical and sitemap rules raise it to B when a wrong origin reaches the served HTML.
- A live URL replaces only the runtime layer. The build still runs, because the deploy may be older than the branch.

## Dependencies

When the app's dependencies are not installed (`node_modules` missing, no virtualenv, `bundle check` fails), ask once: "Install dependencies with `<frozen install>` to run the build and local checks?" The frozen install for each lockfile: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` (Yarn 2+) or `yarn install --frozen-lockfile` (Yarn 1), `bun install --frozen-lockfile`, `uv sync --frozen`, `poetry sync` (Poetry 2) or `poetry install --sync`, `bundle install` with `BUNDLE_FROZEN=true`, `composer install`.

On anything but a yes, install nothing: skip the build and the local runtime layer, and the header says "build and local runtime skipped: dependencies not installed". The live runtime layer still runs when there is a URL.

## Build

Run the build command (question 2), then the typecheck and lint scripts when `package.json` (or the stack's equivalent) defines them (`typecheck`, `type-check`, `check`, `lint`). Production mode: `NODE_ENV=production` unless the script sets it.

Read each typecheck and lint script before running it. One that writes files (`--fix`, `--write`, `--apply`, `prettier --write`, a formatter) would edit the project: run its read-only form when there is one (the same command without the flag, `prettier --check`), else skip it and say "skipped (writes files)" in the Layers line.

- A failing build, typecheck or lint (non-zero exit): B. Evidence is the first error lines and the command; the fix names the failing file when the output does.
- A failure caused only by environment variables that the deploy platform provides (the error names a missing variable that `.env.example` or the deploy config lists) is still B: name the variables in the evidence, and add "verify yourself": the platform sets them for production builds.
- Note the output folder; the local runtime layer and the "emitted HTML" fallback read from it.

## Serve locally

Runs only when there is no live URL and the build passed.

1. **Port**: pick a free one (`node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"`, or `python3 -c` with `socket`).
2. **Start** the serve command (question 3) on that port: the stack's port flag from STACKS.md, else `PORT=<port>`. Run it in the background and keep its PID and output.
3. **Wait** until `http://localhost:<port>/` answers (any HTTP status), polling for at most 60 s. A server that exits or never answers: report its last output lines, and fall back to the emitted HTML.
4. **Probe** `http://localhost:<port>` as the target ([PROBE.md](PROBE.md)). Map sitemap URLs onto the local origin by path before probing them as pages.
5. **Stop** the server once the last probe run ends, and also when a step fails. Done when the port no longer answers.

**No serve command** (a static build): read the emitted HTML in the output folder for the homepage and each page, and gather the `html` facts from the files by the PROBE.md rules. Status, redirects and headers are then "not verified locally".

## Judging local output

- **Production host**: host checks (sitemap hosts, canonical, `og:url`, preview images) compare against the production URL candidate, not `localhost`. With no candidate, a `localhost` origin that production emits too (hard-coded, or set in `.env.production` or the deploy config) keeps the tier its CHECKS rule gives, so a `localhost` canonical or sitemap host is B. A `localhost` origin that is only the dev fallback of an unset variable is S, "no production URL configured", unless a deploy-platform variable sets it (then "verify yourself").
- **Environment-dependent values**: a `localhost` value in the local output is a finding only when the source emits it in production too. When a production-only variable overrides it (`VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL`, `URL` on Netlify, `CF_PAGES_URL`), name the variable under "Verify yourself".
- **Deploy-only checks** read "not verified locally": HTTPS and TLS, HSTS, host-level redirects (http to https, www), CDN and platform headers, `platform`, preview hosts, DNS verification. Where the source sets headers or redirects (STACKS.md lists the files), judge those rules from the config instead and cite it.
