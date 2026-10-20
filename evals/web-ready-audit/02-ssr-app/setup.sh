# A node:http server-rendered shop. Planted: SITE_URL in .env.production is localhost, so canonicals
# point there (B); a secret under the PUBLIC_ prefix is inlined into client.js (B); unknown paths answer
# 200 with the homepage (S); CORS reflects any Origin with credentials (B); X-Powered-By is sent (N).
cat > package.json << 'JSON'
{
  "name": "teashop",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": { "build": "node build.mjs", "start": "node server.mjs" }
}
JSON
cat > .env.production << 'ENV'
SITE_URL=http://localhost:3000
SESSION_SECRET=eval-fixture-session-secret
PUBLIC_PAYMENTS_SECRET=evalfixture-payments-secret-0000
PUBLIC_SHOP_NAME=Teashop
ENV
cat > env.mjs << 'JS'
// Loads .env.production into process.env without overriding variables already set.
import { readFileSync } from "node:fs"

for (const line of readFileSync(new URL(".env.production", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match && !(match[1] in process.env)) process.env[match[1]] = match[2]
}
JS
cat > build.mjs << 'JS'
// Bundles the client script, inlining every PUBLIC_ variable the way framework bundlers do.
import "./env.mjs"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"

const publicEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("PUBLIC_")))
rmSync("dist", { recursive: true, force: true })
mkdirSync("dist")
writeFileSync("dist/client.js", `window.ENV = ${JSON.stringify(publicEnv)};\n${readFileSync("client/main.js", "utf8")}`)
console.log("built dist/client.js")
JS
mkdir -p client
cat > client/main.js << 'JS'
document.querySelector("[data-shop]").textContent = window.ENV.PUBLIC_SHOP_NAME
JS
cat > server.mjs << 'JS'
import "./env.mjs"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"

const site = process.env.SITE_URL
const favicon = readFileSync(new URL("favicon.png", import.meta.url))
const pages = {
  "/": { title: "Teashop: loose-leaf tea from small farms", h1: "Loose-leaf tea", description: "Green, black and oolong teas bought directly from small farms in Japan, Taiwan and Darjeeling." },
  "/teas": { title: "All teas | Teashop", h1: "All teas", description: "Browse every tea we stock, with tasting notes, brewing times and the farm each one comes from." },
}

const render = (path, page) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">
  <link rel="canonical" href="${site}${path}">
  <meta property="og:title" content="${page.h1}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:url" content="${site}${path}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="/favicon.png" type="image/png">
</head>
<body>
  <nav><a href="/">Home</a> <a href="/teas">Teas</a></nav>
  <main><h1>${page.h1}</h1><p data-shop></p></main>
  <script src="/client.js" defer></script>
</body>
</html>`

createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://x")
  res.setHeader("X-Powered-By", "teashop-ssr/1.4.2")
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  }
  if (pathname === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nAllow: /\n")
  if (pathname === "/favicon.png") return res.writeHead(200, { "content-type": "image/png" }).end(favicon)
  if (pathname === "/client.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(readFileSync("dist/client.js"))
  if (pathname === "/api/me") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ user: null }))
  // Every other path renders the homepage.
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(render(pathname, pages[pathname] ?? pages["/"]))
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${process.env.PORT ?? 3000}`))
JS
write_favicon .
commit_site
