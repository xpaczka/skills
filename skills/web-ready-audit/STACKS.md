# Stacks

A shortcut for the four questions in [DISCOVER.md](DISCOVER.md). The app's own scripts and config win over this table: a `start` or `preview` script, a `Dockerfile` `CMD` or a `Procfile` is what production runs. A stack missing here is discovered the same way, from its files.

## Known stacks

`<p>` is the port. "Static" is a build with no server: serve it with the listed command when that tool is already installed, else read the emitted HTML.

| Stack | Marker | Head | Static files | Build, output | Serve on `<p>` | Client env prefix |
|---|---|---|---|---|---|---|
| Next.js App Router | `next` dep, `app/` | `metadata`, `generateMetadata`, `metadataBase`; files `opengraph-image.*`, `twitter-image.*`, `icon.*`, `apple-icon.*`, `robots.ts`, `sitemap.ts`, `manifest.ts`, `not-found.tsx` | `public/` | `next build`, `.next/` (`out/` with `output: 'export'`, static) | `next start -p <p>` | `NEXT_PUBLIC_` |
| Next.js Pages Router | `next` dep, `pages/` | `next/head`, `pages/_document`, `pages/_app`, `pages/404` | `public/` | as above | as above | `NEXT_PUBLIC_` |
| Vite SPA (React, Vue, Solid) | `vite` dep, root `index.html` | `index.html`; Helmet, `@unhead`, React 19 tags are client-only | `public/` | `vite build`, `dist/` | `vite preview --port <p> --strictPort` | `VITE_` |
| Create React App | `react-scripts` dep | `public/index.html` | `public/` | `react-scripts build`, `build/` | static: `serve -s build -l <p>` | `REACT_APP_` |
| TanStack Start | `@tanstack/react-start` dep | route `head()`, `<HeadContent />` in the root route | `public/` | `vite build`, `.output/` or `dist/` | the `start` script, else `PORT=<p> node .output/server/index.mjs` | `VITE_` |
| TanStack Router SPA | `@tanstack/react-router`, no Start | route `head()`, client-only | `public/` | `vite build`, `dist/` | `vite preview --port <p> --strictPort` | `VITE_` |
| React Router 7 / Remix | `@react-router/dev`, `react-router.config.*` | route `meta` and `links`, `root.tsx`; robots and sitemap as resource routes | `public/` | `react-router build`, `build/client` and `build/server` | `PORT=<p> react-router-serve ./build/server/index.js`; `ssr: false` is static (`build/client`) | `VITE_` |
| Astro | `astro.config.*` | layouts, `src/pages/404.astro`, `@astrojs/sitemap` | `public/` | `astro build`, `dist/` | `astro preview --port <p>` | `PUBLIC_` |
| Nuxt | `nuxt.config.*` | `app.head`, `useHead`, `useSeoMeta`, `error.vue`, `@nuxtjs/robots`, `@nuxtjs/sitemap` | `public/` | `nuxi build`, `.output/` (`nuxi generate`: `.output/public`, static) | `PORT=<p> nuxi preview` | `NUXT_PUBLIC_` |
| SvelteKit | `@sveltejs/kit` dep | `<svelte:head>`, `src/app.html`, `+error.svelte`, `+server.ts` routes | `static/` | `vite build`, adapter output | `vite preview --port <p> --strictPort`; adapter-node: `PORT=<p> node build` | `PUBLIC_` |
| Gatsby | `gatsby-config.*` | `export const Head`, sitemap and robots plugins, `src/pages/404.js` | `static/` | `gatsby build`, `public/` | `gatsby serve -p <p>` | `GATSBY_` |
| Angular | `angular.json` | `src/index.html`, `Title` and `Meta` services, the `**` route | `public/` (v18+), else `src/assets` | `ng build`, `dist/<project>/browser` (plus `server/` with SSR) | SSR: `PORT=<p> node dist/<project>/server/server.mjs` (the `serve:ssr:<project>` script); else static | none (`NG_APP_` with `@ngx-env`) |
| Eleventy | `eleventy.config.*`, `.eleventy.js` | `_includes/` layouts | passthrough copy | `eleventy`, `_site/` | static | none |
| Hugo | `hugo.toml`, `config.toml` | `layouts/_default/baseof.html`, `partials/head.html`; built-in sitemap and robots | `static/` | `hugo`, `public/` | static | `HUGO_` |
| Django | `manage.py` | the base template (`templates/**/base.html`), `{% block title %}` | `STATIC_ROOT` | `python manage.py collectstatic --noinput` | the `Procfile` or `Dockerfile` command, e.g. `gunicorn <project>.wsgi --bind 127.0.0.1:<p>` | none |
| Rails | `config/application.rb` | `app/views/layouts/application.html.erb` | `public/` | `bin/rails assets:precompile` | `RAILS_ENV=production bin/rails server -p <p>` | none |
| Laravel | `artisan` | `resources/views/layouts/*.blade.php` | `public/` | `npm run build` (Vite) | `php artisan serve --port=<p>` | `VITE_` |
| PHP | `index.php` | the shared header include | the document root | none | `php -S 127.0.0.1:<p> -t <document root>` | none |
| Plain HTML | root `*.html`, no build | each page's `<head>` | the root | none | static | none |

## Headers and redirects

Read these when judging header and redirect rules, and always in a local run, where the platform does not apply them:

- Next.js: `headers()` and `redirects()` in `next.config.*`, `middleware.ts`.
- Vercel: `vercel.json` (`headers`, `redirects`, `rewrites`).
- Netlify and Cloudflare Pages: `_headers` and `_redirects` in the static or output folder; `netlify.toml` (`[[headers]]`, `[[redirects]]`).
- Nuxt `routeRules`; SvelteKit `hooks.server.ts`; Astro middleware; Remix and React Router `entry.server.tsx`.
- Servers: `nginx.conf`, `.htaccess`, `Caddyfile`, `firebase.json`, `staticwebapp.config.json`, the Express or Fastify app, Django `MIDDLEWARE` and `SECURE_*` settings, Rails `config/environments/production.rb`.
