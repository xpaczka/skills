# A Next.js app whose dependencies are not installed. The audit asks once before `npm ci`;
# with no answer it installs nothing, builds nothing and edits nothing.
cat > package.json << 'JSON'
{
  "name": "launchpad",
  "version": "0.1.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "next lint" },
  "dependencies": { "next": "15.5.4", "react": "19.1.1", "react-dom": "19.1.1" }
}
JSON
cat > package-lock.json << 'JSON'
{
  "name": "launchpad",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "launchpad",
      "version": "0.1.0",
      "dependencies": { "next": "15.5.4", "react": "19.1.1", "react-dom": "19.1.1" }
    },
    "node_modules/next": { "version": "15.5.4", "resolved": "https://registry.npmjs.org/next/-/next-15.5.4.tgz", "license": "MIT" },
    "node_modules/react": { "version": "19.1.1", "resolved": "https://registry.npmjs.org/react/-/react-19.1.1.tgz", "license": "MIT" },
    "node_modules/react-dom": { "version": "19.1.1", "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.1.1.tgz", "license": "MIT" }
  }
}
JSON
echo 22 > .nvmrc
cat > next.config.mjs << 'JS'
/** @type {import('next').NextConfig} */
export default { reactStrictMode: true }
JS
mkdir -p app public
write_favicon public
cat > app/layout.jsx << 'JSX'
export const metadata = {
  title: "Launchpad",
  description: "Plan, schedule and ship product launches with your whole team in one place.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
JSX
cat > app/page.jsx << 'JSX'
export default function Home() {
  return <main><h1>Launchpad</h1></main>
}
JSX
commit_site
