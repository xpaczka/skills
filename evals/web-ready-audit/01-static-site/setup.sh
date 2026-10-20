# A static brochure site built by a plain Node script. Planted: robots.txt `Disallow: /` (B),
# no Open Graph tags on the homepage (B), an og:image on /about that 404s (B), no twitter:card (S).
cat > package.json << 'JSON'
{
  "name": "brochure",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": { "build": "node build.mjs", "start": "node serve.mjs" }
}
JSON
cat > build.mjs << 'JS'
import { cpSync, rmSync } from "node:fs"

rmSync("dist", { recursive: true, force: true })
cpSync("public", "dist", { recursive: true })
cpSync("src", "dist", { recursive: true })
console.log("built dist/")
JS
write_static_server
mkdir -p src public
write_favicon public
cat > public/robots.txt << 'TXT'
User-agent: *
Disallow: /
TXT
cat > src/index.html << 'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brochure: handmade ceramics from Lisbon</title>
  <meta name="description" content="Handmade cups, bowls and plates, thrown and glazed in our Lisbon studio and shipped across Europe.">
  <link rel="icon" href="/favicon.png" type="image/png">
</head>
<body>
  <a href="#main">Skip to content</a>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <main id="main"><h1>Handmade ceramics</h1><p>Cups, bowls and plates from our studio.</p></main>
</body>
</html>
HTML
cat > src/about.html << 'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>About the studio | Brochure</title>
  <meta name="description" content="Two potters, one kiln and a small shop in Lisbon: how Brochure started and how we make every piece.">
  <meta property="og:title" content="About the studio">
  <meta property="og:description" content="Two potters, one kiln and a small shop in Lisbon.">
  <meta property="og:type" content="website">
  <meta property="og:image" content="/og/about.png">
  <link rel="icon" href="/favicon.png" type="image/png">
</head>
<body>
  <a href="#main">Skip to content</a>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <main id="main"><h1>About the studio</h1><p>Two potters, one kiln.</p></main>
</body>
</html>
HTML
cat > src/404.html << 'HTML'
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Not found | Brochure</title><meta name="robots" content="noindex"></head>
<body><h1>Page not found</h1><p><a href="/">Back to the homepage</a></p></body>
</html>
HTML
commit_site
