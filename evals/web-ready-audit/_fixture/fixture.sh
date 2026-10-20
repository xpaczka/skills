# Shared fixture for every eval case. scripts/sync-eval-fixtures.sh prepends it to
# each case's setup.sh to build scaffold.sh (scaffolds cannot read files outside their case).
set -euo pipefail

# Commits the case's files, so any edit the audit makes shows up as a change.
commit_site() {
  printf 'dist/\nnode_modules/\n' > .gitignore
  git init -q -b main
  git config user.email eval@example.com
  git config user.name eval
  git add -A
  git commit -qm "Initial site"
}

# A 16x16 PNG favicon, so icon findings do not crowd the planted ones.
write_favicon() {
  mkdir -p "$1"
  printf 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGOQizpBEmIY1TCqYfhqAAB1t0AQ8w5IqQAAAABJRU5ErkJggg==' | base64 -d > "$1/favicon.png"
}

# serve.mjs: a dependency-free static server for dist/ on $PORT (default 3000), with a real 404.
write_static_server() {
  cat > serve.mjs << 'JS'
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const root = join(import.meta.dirname, "dist")
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css" }

createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
    if (path.endsWith("/")) path += "index.html"
    if (!extname(path)) path += ".html"
    const body = await readFile(join(root, path))
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404, { "content-type": types[".html"] })
    res.end(await readFile(join(root, "404.html")))
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${process.env.PORT ?? 3000}`))
JS
}
