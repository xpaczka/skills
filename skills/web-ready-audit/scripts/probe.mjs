#!/usr/bin/env node
// Fetches pages of a live site with read-only GETs and prints launch-readiness facts as JSON.
// Zero dependencies: web-standard fetch plus node: built-ins that Bun and Deno also support.
// Usage: probe.mjs [--pages-only] [--api <path>]... <url> [<url>...]
//        probe.mjs --list-probes [--pages-only] [--api <path>]... [--pages <url>]... <url> [<url>...]
//        probe.mjs --mail-dns <domain> [--dkim-selector <name>]...
import { lookup, resolveMx, resolveTxt } from 'node:dns/promises';
import { connect } from 'node:tls';
import { gunzipSync } from 'node:zlib';

// --- HTTP ---

// HTTP and URL helpers shared by every probe: the redirect-recording GET, the target context and the error envelope.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;
const MAX_HOPS = 10;
const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

const isLocalHost = (hostname) => LOCAL_HOST.test(hostname);

// An https origin on a public host: the only kind with TLS, host-level redirects and DNS worth checking.
function isRemoteHttps(url) {
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' && !isLocalHost(hostname);
}

// The www or apex twin of a host: users type either, so both need a valid certificate and a redirect.
function twinHost(host) {
  return host.startsWith('www.') ? host.slice(4) : `www.${host}`;
}

// Local and private hosts are fetched only when the audit target itself is local.
function targetContext(urls) {
  const local = urls.some((u) => isLocalHost(new URL(u).hostname));
  return { local, skip: (url) => !local && isLocalHost(new URL(url).hostname) };
}

// GETs url without following redirects automatically, so every hop is recorded.
async function fetchChain(url, headers = {}) {
  const redirects = [];
  const setCookies = [];
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const started = Date.now();
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: '*/*', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    for (const line of res.headers.getSetCookie?.() ?? []) setCookies.push({ url: current, line });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      redirects.push({ url: current, status: res.status, location });
      await res.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    return { res, body, redirects, setCookies, finalUrl: current, ms: Date.now() - started };
  }
  throw new Error(`more than ${MAX_HOPS} redirects`);
}

// Status, final URL and redirect hops of one GET.
async function chain(url, headers) {
  const { res, redirects, finalUrl } = await fetchChain(url, headers);
  return { finalUrl, status: res.status, redirects };
}

function errorText(error) {
  const cause = error.cause?.code ?? error.cause?.message;
  return cause ? `${error.message} (${cause})` : error.message;
}

// Runs one probe of url: `{ skipped }` for a host the target context skips, `{ error }` instead of a throw.
async function attempt(ctx, url, probe) {
  if (!url) return { error: 'invalid URL' };
  if (ctx.skip(url)) return { skipped: 'local or private host' };
  try {
    return await probe();
  } catch (error) {
    return { error: errorText(error) };
  }
}

function resolve(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function headerObject(res) {
  return Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
}

function blockedBy(res, text) {
  if (res.headers.get('cf-mitigated') === 'challenge') return 'cloudflare challenge';
  if (res.headers.get('x-vercel-mitigated') === 'challenge') return 'vercel challenge';
  if ([403, 429, 503].includes(res.status) && /cf-chl|challenge-platform|captcha|_vercel\/security/i.test(text.slice(0, 20000))) {
    return `challenge page (${res.status})`;
  }
  return null;
}

function platformOf(headers) {
  if (headers['x-vercel-id']) return 'vercel';
  if (headers['x-nf-request-id'] || /netlify/i.test(headers.server ?? '')) return 'netlify';
  if (headers['cf-ray']) return 'cloudflare';
  return null;
}

// --- HTML ---

// Facts from raw HTML, the way crawlers and link-preview scrapers read it. Each extractor reads one part of a parsed
// document, so a caller that needs only the head (scraper re-fetches, the 404 page) skips the rest.

const VERIFICATION_META = ['google-site-verification', 'msvalidate.01', 'yandex-verification'];
const LEGAL_LINK = /impressum|imprint|legal|privacy|datenschutz|terms|agb|accessibility|barrierefrei|cookie/i;
const MAX_LINKS = 100;
const MAX_ASSET_LIST = 50;
const MAX_CONTROLS = 5;
const MAX_LEGAL_LINKS = 20;
const MAX_MIXED = 20;
const MAX_JSONLD_BYTES = 20000;
const NON_CONTENT = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function attrs(source) {
  const out = {};
  for (const m of source.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

function canonicalFromLinkHeader(value) {
  if (!value) return null;
  const m = value.match(/<([^>]+)>\s*;[^,]*rel="?canonical"?/i);
  return m ? m[1] : null;
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const relsOf = (tag) => (tag.rel ?? '').toLowerCase().split(/\s+/);

// Splits a page into head and body with comments removed, and reads the head's meta, link and base tags.
function readDocument(html, pageUrl) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const headEnd = clean.search(/<\/head\s*>/i);
  const head = (headEnd === -1 ? clean.slice(0, 1_000_000) : clean.slice(0, headEnd)).replace(NON_CONTENT, '');
  const body = (headEnd === -1 ? clean : clean.slice(headEnd)).replace(NON_CONTENT, '');
  const tags = [...head.matchAll(/<(meta|link|base)\b([^>]*)>/gi)].map((m) => ({ tag: m[1].toLowerCase(), ...attrs(m[2]) }));
  const base = resolve(tags.find((t) => t.tag === 'base')?.href ?? '', pageUrl) ?? pageUrl;
  return {
    pageUrl,
    clean,
    headEnd,
    head,
    body,
    base,
    metas: tags.filter((t) => t.tag === 'meta'),
    links: tags.filter((t) => t.tag === 'link'),
  };
}

// The body's anchors, read once for the accessibility, legal and internal-link facts.
function anchorsOf(doc) {
  return [...doc.body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map((m) => ({ a: attrs(m[1]), inner: m[2], outer: m[0] }));
}

function headFacts({ clean, head, base, metas, links }) {
  const metaNamed = (...names) => metas.filter((t) => names.includes((t.name ?? '').toLowerCase()));
  // Open Graph and X tags, keyed by property, each a list because og:image may repeat.
  const openGraph = {};
  const twitter = {};
  for (const t of metas) {
    const key = (t.property ?? t.name ?? '').toLowerCase();
    const into = key.startsWith('og:') ? openGraph : key.startsWith('twitter:') ? twitter : null;
    if (into) (into[key] ??= []).push(t.content ?? '');
  }
  const verification = {};
  for (const t of metaNamed(...VERIFICATION_META)) verification[t.name.toLowerCase()] = t.content ?? '';
  const manifest = links.find((t) => relsOf(t).includes('manifest'));
  return {
    base,
    lang: attrs(clean.match(/<html\b([^>]*)>/i)?.[1] ?? '').lang ?? null,
    titles: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map((m) => decodeEntities(m[1]).replace(/\s+/g, ' ').trim()),
    descriptions: metaNamed('description').map((t) => t.content ?? ''),
    canonicals: links.filter((t) => relsOf(t).includes('canonical')).map((t) => ({ href: t.href ?? '', resolved: resolve(t.href ?? '', base) })),
    metaRobots: metaNamed('robots', 'googlebot', 'bingbot').map((t) => ({ name: t.name.toLowerCase(), content: t.content ?? '' })),
    viewport: metaNamed('viewport').map((t) => t.content ?? ''),
    hreflang: links.filter((t) => relsOf(t).includes('alternate') && t.hreflang).map((t) => ({ hreflang: t.hreflang, href: resolve(t.href ?? '', base) })),
    verification,
    openGraph,
    twitter,
    icons: links
      .filter((t) => relsOf(t).some((r) => r === 'icon' || r === 'mask-icon' || r.startsWith('apple-touch-icon')))
      .map((t) => ({ rel: relsOf(t).join(' '), href: t.href ?? '', resolved: resolve(t.href ?? '', base), sizes: t.sizes ?? null, type: t.type ?? null })),
    manifest: manifest ? resolve(manifest.href ?? '', base) : null,
    cspMeta: metas.find((t) => (t['http-equiv'] ?? '').toLowerCase() === 'content-security-policy')?.content ?? null,
    feeds: links
      .filter((t) => relsOf(t).includes('alternate') && /(rss|atom)\+xml/i.test(t.type ?? ''))
      .map((t) => ({ type: t.type, href: resolve(t.href ?? '', base) })),
  };
}

function assetFacts({ pageUrl, clean, headEnd, body, base, links }) {
  const scriptTags = [...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((m) => ({ a: attrs(m[1]), inline: m[2], index: m.index }));
  const scripts = scriptTags
    .filter(({ a }) => a.src)
    .map(({ a, index }) => ({ src: resolve(a.src, base), type: a.type ?? null, async: 'async' in a, defer: 'defer' in a, inHead: headEnd === -1 || index < headEnd }));
  const images = [...body.matchAll(/<img\b([^>]*)>/gi)].map((m) => attrs(m[1])).map((a) => ({
    src: resolve(a.src ?? '', base),
    srcset: Boolean(a.srcset),
    loading: a.loading ?? null,
    fetchpriority: a.fetchpriority ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    alt: 'alt' in a ? a.alt : null,
  }));
  return {
    jsonLd: scriptTags.filter(({ a }) => /^application\/ld\+json$/i.test((a.type ?? '').trim())).map(({ inline }) => jsonLdBlock(inline)),
    mixedContent: new URL(pageUrl).protocol === 'https:' ? mixedContent(clean) : null,
    scripts: scripts.slice(0, MAX_ASSET_LIST),
    scriptCount: scripts.length,
    inlineScriptBytes: scriptTags.filter(({ a }) => !a.src && !/json/i.test(a.type ?? '')).reduce((n, t) => n + t.inline.length, 0),
    stylesheets: links.filter((t) => relsOf(t).includes('stylesheet')).map((t) => resolve(t.href ?? '', base)).slice(0, MAX_ASSET_LIST),
    resourceHints: links
      .filter((t) => relsOf(t).some((r) => ['preconnect', 'dns-prefetch', 'preload', 'modulepreload'].includes(r)))
      .map((t) => ({ rel: relsOf(t).join(' '), href: resolve(t.href ?? '', base), as: t.as ?? null })),
    images: images.slice(0, MAX_ASSET_LIST),
    imageCount: images.length,
  };
}

function a11yFacts({ body, base }, anchors) {
  const ids = new Set([...body.matchAll(/\bid\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]));
  const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)].map((m) => ({ a: attrs(m[1]), inner: m[2], outer: m[0] }));
  const skip = anchors.slice(0, 5).find(({ a, inner }) => (a.href ?? '').startsWith('#') && /skip|zum inhalt|springen|aller au contenu/i.test(`${textOf(inner)} ${a.class ?? ''}`));
  const unnamed = [...anchors.filter(({ a }) => a.href !== undefined), ...buttons].filter(({ a, inner }) => !accessibleName(a, inner));
  const legal = anchors
    .map(({ a, inner }) => ({ href: resolve(a.href ?? '', base), text: textOf(inner) }))
    .filter((l) => l.href && (LEGAL_LINK.test(new URL(l.href).pathname) || LEGAL_LINK.test(l.text)));
  return {
    skipLink: skip ? { href: skip.a.href, text: textOf(skip.inner), targetExists: ids.has(skip.a.href.slice(1)) } : null,
    unnamedControls: { count: unnamed.length, examples: unnamed.slice(0, MAX_CONTROLS).map((c) => c.outer.replace(/\s+/g, ' ').slice(0, 160)) },
    legalLinks: [...new Map(legal.map((l) => [l.href, l])).values()].slice(0, MAX_LEGAL_LINKS),
  };
}

function linkFacts({ pageUrl, body, base }, anchors) {
  const origin = new URL(pageUrl).origin;
  const internal = new Set();
  for (const { a } of anchors) {
    const href = a.href === undefined ? null : resolve(a.href, base);
    if (href && new URL(href).origin === origin) internal.add(href.replace(/#.*$/, ''));
  }
  const mount = body.match(/<div\b[^>]*\bid\s*=\s*["']?(root|app|__next|svelte|q-app)["']?[^>]*>\s*<\/div>/i);
  return {
    bodyTextLength: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length,
    emptyMount: mount ? mount[1] : null,
    internalLinks: { count: internal.size, urls: [...internal].slice(0, MAX_LINKS) },
  };
}

// Every fact of a page's HTML.
function parseHtml(html, pageUrl) {
  const doc = readDocument(html, pageUrl);
  const anchors = anchorsOf(doc);
  return { ...headFacts(doc), ...assetFacts(doc), ...a11yFacts(doc, anchors), ...linkFacts(doc, anchors) };
}

// A link or button has a name from its text, an image alt inside it, or aria-label, aria-labelledby or title.
function accessibleName(a, inner) {
  if (a['aria-label']?.trim() || a['aria-labelledby'] || a.title?.trim()) return true;
  if (textOf(inner)) return true;
  return [...inner.matchAll(/<img\b([^>]*)>/gi)].some((m) => attrs(m[1]).alt?.trim()) || /<svg\b[^>]*\baria-label\s*=|<title\b[^>]*>\s*\S/i.test(inner);
}

// http:// subresources on an https page. Active ones (scripts, styles, frames) are blocked by browsers.
function mixedContent(html) {
  const out = [];
  for (const m of html.matchAll(/<(script|link|iframe|img|source|video|audio|object|embed|form)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[2]);
    if (tag === 'link' && !/stylesheet|preload|modulepreload|icon|manifest/i.test(a.rel ?? '')) continue;
    const attr = { link: 'href', object: 'data', form: 'action' }[tag] ?? 'src';
    const urls = [a[attr], ...(a.srcset ?? '').split(',').map((c) => c.trim().split(/\s+/)[0])].filter((u) => /^http:\/\//i.test(u ?? ''));
    const active = ['script', 'iframe', 'object', 'embed'].includes(tag) || (tag === 'link' && /stylesheet|modulepreload/i.test(a.rel ?? ''));
    for (const url of urls) if (out.length < MAX_MIXED) out.push({ tag, url, active });
  }
  return out;
}

function jsonLdBlock(text) {
  const source = text.trim();
  try {
    const data = JSON.parse(source);
    const block = { valid: true, types: [...collectTypes(data)], bytes: source.length };
    if (source.length <= MAX_JSONLD_BYTES) block.data = data;
    else block.truncated = true;
    return block;
  } catch (error) {
    return { valid: false, error: error.message, bytes: source.length, excerpt: source.slice(0, 200) };
  }
}

// Every @type in a JSON-LD value, nested ones included.
function collectTypes(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectTypes(n, out));
  else if (node && typeof node === 'object') {
    for (const t of [node['@type']].flat()) if (typeof t === 'string') out.add(t);
    Object.values(node).forEach((v) => collectTypes(v, out));
  }
  return out;
}

// --- Images ---

// Image facts (format, pixel size, bytes) for preview images, icons and manifest icons, read from the file's first bytes.

const IMAGE_RANGE = 'bytes=0-65535';
const IMAGE_ACCEPT = 'image/*,*/*';

// Format and pixel size from the first bytes of an image file, or null when the format is unknown.
function imageSize(b) {
  const ascii = (start, end) => b.toString('latin1', start, end);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 10 && ascii(0, 4) === 'GIF8') return { format: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return { format: 'jpeg', ...jpegSize(b) };
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { format: 'webp', ...webpSize(b) };
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && /^(avi[fs]|hei[cx]|mif1)/.test(ascii(8, 12))) {
    const ispe = b.indexOf('ispe', 12, 'latin1');
    const format = ascii(8, 11) === 'avi' ? 'avif' : 'heif';
    return ispe > 0 && ispe + 16 <= b.length ? { format, width: b.readUInt32BE(ispe + 8), height: b.readUInt32BE(ispe + 12) } : { format, width: null, height: null };
  }
  if (b.length >= 22 && b.readUInt32BE(0) === 0x00000100) {
    // ICO: one directory entry per embedded size; 0 means 256.
    const sizes = [];
    for (let i = 0; i < b.readUInt16LE(4) && 6 + 16 * i + 2 <= b.length; i++) sizes.push(b[6 + 16 * i] || 256);
    const largest = Math.max(...sizes);
    return { format: 'ico', width: largest, height: largest, icoSizes: sizes };
  }
  if (b.length >= 26 && ascii(0, 2) === 'BM') return { format: 'bmp', width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  const text = b.toString('utf8', 0, Math.min(b.length, 4096));
  // Only a document that starts with <svg>, so an HTML error page with an inline icon is not mistaken for one.
  const svg = text.match(/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg\b([^>]*)>/i);
  if (svg) {
    const a = attrs(svg[1]);
    const box = (a.viewbox ?? '').trim().split(/[\s,]+/).map(Number);
    const px = (v) => (/^\d+(\.\d+)?(px)?$/.test(v ?? '') ? parseFloat(v) : null);
    return { format: 'svg', width: px(a.width) ?? (box.length === 4 ? box[2] : null), height: px(a.height) ?? (box.length === 4 ? box[3] : null) };
  }
  return null;
}

function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return { width: null, height: null };
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    // SOFn frames carry the size; C4, C8 and CC are other segments in the same range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { width: null, height: null };
}

function webpSize(b) {
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  return { width: null, height: null };
}

// Pages often share one preview image or icon, so each URL is fetched once per run.
const imageCache = new Map();
function probeImage(ctx, url) {
  if (!imageCache.has(url)) imageCache.set(url, attempt(ctx, url, () => fetchImage(url)));
  return imageCache.get(url);
}

async function fetchImage(url) {
  // A range request reads only the header bytes; a full GET follows when the size sits further in (large JPEG metadata).
  let { res, body, redirects, finalUrl } = await fetchChain(url, { range: IMAGE_RANGE, accept: IMAGE_ACCEPT });
  let size = res.status === 200 || res.status === 206 ? imageSize(body) : null;
  if (res.status === 206 && !size?.width) {
    ({ res, body, redirects, finalUrl } = await fetchChain(url, { accept: IMAGE_ACCEPT }));
    size = imageSize(body);
  }
  const total = res.status === 206 ? Number(res.headers.get('content-range')?.split('/')[1]) || null : body.length;
  return { finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type'), bytes: total, format: null, width: null, height: null, ...size };
}

// --- robots.txt and sitemaps ---

// robots.txt (parsed, with Google's matching for Googlebot and AI crawlers) and the sitemap walk.

const MAX_OTHER_LINES = 20;
const MAX_SITEMAPS = 50;
const MAX_SITEMAP_URLS = 500;
const SITEMAP_GUESSES = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'PerplexityBot'];

const robotsRequest = (origin) => ({ url: `${origin}/robots.txt`, purpose: 'robots.txt' });
const sitemapGuessRequests = (origin) => SITEMAP_GUESSES.map((path) => ({ url: origin + path, purpose: 'sitemap guess, only when robots.txt lists none' }));

function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  const otherLines = [];
  let group = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    const key = m?.[1].toLowerCase();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((group = { agents: [], rules: [] }));
      group.agents.push(m[2].trim().toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(m[2].trim());
    else if ((key === 'allow' || key === 'disallow') && group) group.rules.push({ type: key, path: m[2].trim() });
    else if (otherLines.length < MAX_OTHER_LINES) otherLines.push(line);
  }
  return { groups, sitemaps, otherLines };
}

function ruleRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped.replace(/\\\$$/, '$')}`);
}

// Google's matching: the agent's own groups (or its fallback agent's), else the * groups; longest rule wins, allow wins a tie.
function robotsVerdict(groups, agent, path, fallback) {
  const groupsOf = (name) => groups.filter((g) => g.agents.includes(name.toLowerCase()));
  const owner = [agent, fallback].find((name) => name && groupsOf(name).length) ?? null;
  const own = owner ? groupsOf(owner) : [];
  const matched = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const rule of matched.flatMap((g) => g.rules)) {
    if (!rule.path || !ruleRegex(rule.path).test(path)) continue;
    const longer = !best || rule.path.length > best.path.length;
    if (longer || (rule.path.length === best.path.length && rule.type === 'allow')) best = rule;
  }
  return {
    group: owner ?? (matched.length ? '*' : null),
    verdict: best?.type === 'disallow' ? 'disallowed' : 'allowed',
    rule: best ? `${best.type}: ${best.path}` : null,
  };
}

async function probeRobots(ctx, origin) {
  const { url } = robotsRequest(origin);
  const facts = await attempt(ctx, url, async () => {
    const { res, body, redirects, finalUrl } = await fetchChain(url);
    const parsed = res.status === 200 ? parseRobots(body.toString('utf8')) : { groups: [], sitemaps: [], otherLines: [] };
    return {
      finalUrl,
      status: res.status,
      redirects,
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      ...parsed,
      googlebot: robotsVerdict(parsed.groups, 'Googlebot', '/'),
      aiCrawlers: Object.fromEntries(AI_CRAWLERS.map((bot) => [bot, robotsVerdict(parsed.groups, bot, '/')])),
    };
  });
  return { url, groups: [], sitemaps: [], otherLines: [], ...facts };
}

function parseSitemap(body) {
  const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  const xml = raw.toString('utf8').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const kind = /<sitemapindex\b/i.test(xml) ? 'sitemapindex' : /<urlset\b/i.test(xml) ? 'urlset' : 'not-xml';
  const locs = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  const lastmods = [...xml.matchAll(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/gi)].map((m) => m[1]);
  return { kind, locs, lastmods };
}

// The root is every sitemap robots.txt declares, else the first guess that answers 200 with XML. Index children are
// then walked once each, keyed by final URL, so a guess that redirects to an index already read is not counted twice.
async function probeSitemaps(origin, declared) {
  const files = [];
  const read = new Set();
  const urls = new Set();
  const hosts = {};
  const lastmods = new Set();
  let urlCount = 0;
  let lastmodCount = 0;

  // Fetches one file and records it; returns its parsed content when it answered 200 and was not read before.
  const fetchFile = async (url) => {
    const file = { url };
    files.push(file);
    try {
      const { res, body, redirects, finalUrl } = await fetchChain(url);
      Object.assign(file, { finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type'), bytes: body.length });
      if (res.status !== 200 || read.has(finalUrl)) return null;
      read.add(url).add(finalUrl);
      const parsed = parseSitemap(body);
      Object.assign(file, { kind: parsed.kind, locs: parsed.locs.length, lastmods: parsed.lastmods.length });
      return parsed;
    } catch (error) {
      file.error = errorText(error);
      return null;
    }
  };

  const queue = [...declared];
  const take = ({ kind, locs, lastmods: mods }) => {
    if (kind === 'sitemapindex') queue.push(...locs.filter((loc) => !read.has(loc)));
    if (kind !== 'urlset') return;
    urlCount += locs.length;
    lastmodCount += mods.length;
    mods.forEach((m) => lastmods.add(m));
    for (const loc of locs) {
      if (urls.size < MAX_SITEMAP_URLS) urls.add(loc);
      const resolved = resolve(loc, origin);
      const host = resolved ? new URL(resolved).origin : 'invalid';
      hosts[host] = (hosts[host] ?? 0) + 1;
    }
  };

  if (!declared.length) {
    for (const { url } of sitemapGuessRequests(origin)) {
      const parsed = await fetchFile(url);
      if (parsed && parsed.kind !== 'not-xml') {
        take(parsed);
        break;
      }
    }
  }
  while (queue.length && files.length < MAX_SITEMAPS) {
    const url = queue.shift();
    if (read.has(url)) continue;
    const parsed = await fetchFile(url);
    if (parsed) take(parsed);
  }

  return {
    declaredInRobots: declared.length > 0,
    files,
    urlCount,
    urls: [...urls],
    urlsTruncated: urlCount > urls.size,
    hosts,
    lastmodCount,
    distinctLastmods: lastmods.size,
  };
}

// --- DNS ---

// DNS facts: search engine verification tokens, and mail authentication (MX, SPF, DMARC, DKIM) for the mail check.

// Common DKIM selectors of mail providers (Google, Microsoft 365, Mailchimp/Mandrill, SendGrid, Resend, Postmark, Zoho, generic).
const DKIM_SELECTORS = ['google', 'selector1', 'selector2', 'k1', 'k2', 'k3', 's1', 's2', 'resend', 'pm', 'mandrill', 'zoho', 'mail', 'dkim', 'default', 'smtp'];

// The names whose TXT records can hold a verification token: the host and the host without www.
const verificationNames = (hostname) => [...new Set([hostname, hostname.replace(/^www\./, '')])];

// TXT records of a name, each joined from its 255-byte chunks, or { error }.
async function txtRecords(name) {
  let records;
  try {
    records = await resolveTxt(name);
  } catch (error) {
    return { error: error.code ?? error.message };
  }
  if (!globalThis.Bun) return records.map((r) => r.join(''));
  // Bun returns each chunk as its own record; a chunk that does not open with a tag (v=, k=, name=) continues the one before.
  const merged = [];
  for (const chunk of records.flat()) {
    if (merged.length && !/^[a-z][\w.-]*=/i.test(chunk)) merged[merged.length - 1] += chunk;
    else merged.push(chunk);
  }
  return merged;
}

async function dnsVerification(hostname) {
  const out = {};
  for (const name of verificationNames(hostname)) {
    const records = await txtRecords(name);
    out[name] = Array.isArray(records) ? records.filter((t) => /^(google-site-verification|yandex-verification)/i.test(t)) : records;
  }
  return out;
}

function tagValue(record, tag) {
  return record.match(new RegExp(`(?:^|;)\\s*${tag}\\s*=\\s*([^;]+)`, 'i'))?.[1].trim() ?? null;
}

async function mailDns(domain, extraSelectors) {
  const mx = await resolveMx(domain).then(
    (records) => records.sort((a, b) => a.priority - b.priority).map(({ exchange, priority }) => ({ exchange, priority })),
    (error) => ({ error: error.code ?? error.message }),
  );
  const root = await txtRecords(domain);
  const spf = Array.isArray(root) ? root.filter((t) => /^v=spf1\b/i.test(t)) : root;
  const dmarcTxt = await txtRecords(`_dmarc.${domain}`);
  const dmarc = Array.isArray(dmarcTxt) ? dmarcTxt.filter((t) => /^v=DMARC1\b/i.test(t)) : dmarcTxt;
  const selectors = [...new Set([...extraSelectors, ...DKIM_SELECTORS])];
  const dkimFound = {};
  for (const selector of selectors) {
    const records = await txtRecords(`${selector}._domainkey.${domain}`);
    const key = Array.isArray(records) ? records.find((t) => /\bp=/i.test(t)) : null;
    if (!key) continue;
    const p = tagValue(key, 'p') ?? '';
    const type = tagValue(key, 'k') ?? 'rsa';
    // An RSA public key's DER encoding is about 38 bytes plus the modulus, so this rounds to the key size.
    const bytes = Buffer.from(p, 'base64').length;
    dkimFound[selector] = { type, revoked: p === '', approxBits: type === 'rsa' && bytes ? Math.round(((bytes - 38) * 8) / 1024) * 1024 : null };
  }
  const first = Array.isArray(spf) ? spf[0] : null;
  const policy = Array.isArray(dmarc) ? dmarc[0] : null;
  return {
    domain,
    mx,
    spf: Array.isArray(spf)
      ? { records: spf, all: first?.match(/([~?+-]?)all\b/i)?.[0] ?? null, lookups: first ? first.split(/\s+/).filter((term) => /^[+~?-]?(include|a|mx|ptr|exists)([:/]|$)|^redirect=/i.test(term)).length : 0 }
      : spf,
    dmarc: Array.isArray(dmarc)
      ? { records: dmarc, p: policy && tagValue(policy, 'p'), sp: policy && tagValue(policy, 'sp'), rua: policy && tagValue(policy, 'rua'), pct: policy && tagValue(policy, 'pct') }
      : dmarc,
    dkim: { checked: selectors, found: dkimFound },
  };
}

// --- Security ---

// Security facts: response headers and cookies per page; TLS, exposed files, GraphQL introspection and CORS per site.

const EVIL_ORIGIN = 'https://evil.example';
const GRAPHQL_PATHS = ['/graphql', '/api/graphql'];
const INTROSPECTION_QUERY = '{__schema{queryType{name}}}';
const GRAPHQL_ACCEPT = 'application/graphql-response+json,application/json';
const PROBE_RANGE = 'bytes=0-4095';
// Paths that must never be public, each with a check on the body so an SPA fallback page is not mistaken for the file.
const dotenv = (b) => /^\s*(export\s+)?[A-Z_][A-Z0-9_]*\s*=/m.test(b.toString('utf8'));
const sqlDump = (b) => /\b(CREATE TABLE|INSERT INTO)\b/i.test(b.toString('utf8'));
const EXPOSED_FILES = {
  '/.env': dotenv,
  '/.env.local': dotenv,
  '/.env.production': dotenv,
  '/.git/HEAD': (b) => /^(ref: refs\/|[0-9a-f]{40}\s*$)/.test(b.toString('utf8')),
  '/.git/config': (b) => /^\s*\[core\]/m.test(b.toString('utf8')),
  '/.DS_Store': (b) => b.toString('latin1', 4, 8) === 'Bud1',
  '/.npmrc': (b) => /_authToken|^\s*registry\s*=/m.test(b.toString('utf8')),
  '/backup.zip': (b) => b.toString('latin1', 0, 4) === 'PK\x03\x04',
  '/backup.tar.gz': (b) => b[0] === 0x1f && b[1] === 0x8b,
  '/backup.sql': sqlDump,
  '/dump.sql': sqlDump,
  '/database.sql': sqlDump,
};

const exposedFileRequests = (origin) =>
  Object.entries(EXPOSED_FILES).map(([path, looksReal]) => ({ path, looksReal, url: origin + path, purpose: 'exposed file check (first 4 KB)', headers: { range: PROBE_RANGE } }));
const graphqlRequests = (origin) =>
  GRAPHQL_PATHS.map((path) => ({ path, url: `${origin}${path}?query=${encodeURIComponent(INTROSPECTION_QUERY)}`, purpose: 'GraphQL introspection check', headers: { accept: GRAPHQL_ACCEPT } }));
const corsRequest = (url) => ({ url, purpose: 'CORS check', headers: { origin: EVIL_ORIGIN } });
// The homepage and each --api path; GraphQL paths that answer as GraphQL are added at run time.
const corsRequests = (origin, apiPaths) => [`${origin}/`, ...apiPaths.map((p) => new URL(p, origin).href)].map(corsRequest);
const tlsHosts = (origin) => (isRemoteHttps(origin) ? [new URL(origin).hostname, twinHost(new URL(origin).hostname)] : []);

function parseCsp(value) {
  if (!value) return null;
  const directives = {};
  for (const part of value.split(/[;,]/)) {
    const [name, ...tokens] = part.trim().split(/\s+/);
    if (name) directives[name.toLowerCase()] ??= tokens;
  }
  return directives;
}

function parseHsts(value) {
  if (!value) return null;
  return {
    maxAge: Number(value.match(/max-age\s*=\s*"?(\d+)/i)?.[1] ?? NaN),
    includeSubDomains: /includesubdomains/i.test(value),
    preload: /preload/i.test(value),
  };
}

function parseCookie({ url, line }) {
  const [pair, ...parts] = line.split(';').map((p) => p.trim());
  const flags = Object.fromEntries(parts.map((p) => [p.split('=')[0].toLowerCase(), p.includes('=') ? p.slice(p.indexOf('=') + 1) : true]));
  return {
    name: pair.split('=')[0],
    setBy: url,
    secure: 'secure' in flags,
    httpOnly: 'httponly' in flags,
    sameSite: flags.samesite ?? null,
    domain: flags.domain ?? null,
    path: flags.path ?? null,
    persistent: 'expires' in flags || 'max-age' in flags,
  };
}

function securityFacts(headers, html, setCookies) {
  return {
    hsts: parseHsts(headers['strict-transport-security']),
    csp: parseCsp(headers['content-security-policy']),
    cspReportOnly: parseCsp(headers['content-security-policy-report-only']),
    cspMeta: parseCsp(html?.cspMeta),
    cookies: setCookies.map(parseCookie),
  };
}

function certCovers(names, host) {
  return names.some((n) => n === host || (n.startsWith('*.') && host.endsWith(n.slice(1)) && host.split('.').length === n.split('.').length));
}

async function tlsFacts(host) {
  try {
    await lookup(host);
  } catch (error) {
    return { host, resolves: false, error: error.code ?? error.message };
  }
  return new Promise((done) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      const names = (cert.subjectaltname ?? '').split(/,\s*/).filter((n) => n.startsWith('DNS:')).map((n) => n.slice(4).toLowerCase());
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      done({
        host,
        resolves: true,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        coversHost: certCovers(names, host),
        protocol: socket.getProtocol?.() ?? null,
        issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
        altNames: names.slice(0, 50),
        validTo: validTo?.toISOString() ?? null,
        daysLeft: validTo ? Math.floor((validTo - Date.now()) / 86400000) : null,
      });
      socket.end();
    });
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      done({ host, resolves: true, error: 'timeout' });
    });
    socket.on('error', (error) => done({ host, resolves: true, error: error.code ?? error.message }));
  });
}

async function probeCors(ctx, { url, headers }) {
  return {
    url,
    ...(await attempt(ctx, url, async () => {
      const { res } = await fetchChain(url, headers);
      const allowOrigin = res.headers.get('access-control-allow-origin');
      return {
        status: res.status,
        allowOrigin,
        allowCredentials: res.headers.get('access-control-allow-credentials'),
        reflected: allowOrigin === EVIL_ORIGIN,
        vary: res.headers.get('vary'),
      };
    })),
  };
}

async function probeSiteSecurity(ctx, origin, apiPaths) {
  const tls = [];
  for (const host of tlsHosts(origin)) tls.push(await tlsFacts(host));
  const exposedFiles = [];
  for (const { path, looksReal, url, headers } of exposedFileRequests(origin)) {
    exposedFiles.push({
      path,
      ...(await attempt(ctx, url, async () => {
        const { res, body, finalUrl } = await fetchChain(url, headers);
        const ok = res.status === 200 || res.status === 206;
        return { status: res.status, finalUrl, contentType: res.headers.get('content-type'), exposed: ok && looksReal(body) };
      })),
    });
  }
  const graphql = [];
  for (const { path, url, headers } of graphqlRequests(origin)) {
    graphql.push({
      path,
      ...(await attempt(ctx, url, async () => {
        const { res, body } = await fetchChain(url, headers);
        const text = body.toString('utf8', 0, 20000);
        return {
          status: res.status,
          contentType: res.headers.get('content-type'),
          graphql: /^\s*\{\s*"(data|errors)"/.test(text),
          introspection: /"__schema"\s*:\s*\{/.test(text),
        };
      })),
    });
  }
  const [home, ...api] = corsRequests(origin, apiPaths);
  const corsTargets = [home, ...graphql.filter((g) => g.graphql).map((g) => corsRequest(origin + g.path)), ...api];
  const cors = [];
  for (const request of corsTargets) cors.push(await probeCors(ctx, request));
  return { tls: tls.length ? tls : null, exposedFiles, graphql, cors };
}

// --- Routing ---

// Routing facts: a deliberate 404, http to https and www or apex redirects, and trailing-slash handling.

const NOT_FOUND_PREFIX = '/web-ready-audit-404-';

const notFoundRequest = (origin, token) => ({ url: `${origin}${NOT_FOUND_PREFIX}${token}`, purpose: 'deliberate 404' });
function redirectRequests(origin) {
  if (!isRemoteHttps(origin)) return [];
  const { hostname } = new URL(origin);
  return [
    { name: 'httpToHttps', url: `http://${hostname}/`, purpose: 'http to https redirect' },
    { name: 'twinHost', url: `https://${twinHost(hostname)}/`, purpose: 'www or apex redirect' },
  ];
}

// The same path with the trailing slash toggled, from the first internal link that has a path.
function trailingSlashTwin(page) {
  const link = (page.html?.internalLinks.urls ?? []).map((u) => new URL(u)).find((u) => u.pathname.length > 1 && !/\.[a-z0-9]+$/i.test(u.pathname));
  if (!link) return null;
  const twin = new URL(link);
  twin.pathname = link.pathname.endsWith('/') ? link.pathname.slice(0, -1) : `${link.pathname}/`;
  return { link: link.href, twin: twin.href };
}

async function probeNotFound(ctx, origin, homepage) {
  const { url } = notFoundRequest(origin, Math.random().toString(36).slice(2, 10));
  return {
    url,
    ...(await attempt(ctx, url, async () => {
      const { res, body, redirects, finalUrl } = await fetchChain(url);
      const contentType = res.headers.get('content-type');
      const doc = /html/i.test(contentType ?? '') ? readDocument(body.toString('utf8'), finalUrl) : null;
      const head = doc && headFacts(doc);
      const title = head?.titles[0] ?? null;
      return {
        status: res.status,
        finalUrl,
        redirects,
        contentType,
        title,
        sameTitleAsHome: Boolean(title) && title === homepage?.html?.titles[0],
        metaRobots: head?.metaRobots ?? [],
        internalLinkCount: doc ? linkFacts(doc, anchorsOf(doc)).internalLinks.count : 0,
      };
    })),
  };
}

async function probeRouting(ctx, origin, homepage) {
  const routing = { notFound: await probeNotFound(ctx, origin, homepage), httpToHttps: null, twinHost: null };
  for (const { name, url } of redirectRequests(origin)) routing[name] = { url, ...(await attempt(ctx, url, () => chain(url))) };
  const slash = homepage ? trailingSlashTwin(homepage) : null;
  routing.trailingSlash = slash ? { link: slash.link, url: slash.twin, ...(await attempt(ctx, slash.twin, () => chain(slash.twin))) } : null;
  return routing;
}

// --- Assets ---

// Asset facts for the homepage: size, compression, cache headers and content hashing of scripts, stylesheets and images.

const MAX_SCRIPTS = 20;
const MAX_STYLESHEETS = 10;
const MAX_IMAGES = 10;

// A content hash in the file name: a dot- or dash-separated part of 8+ characters that mixes letters with digits,
// or holds 3+ capitals among lowercase (Vite's base64 hashes, such as DKMfOyQO).
function looksHashed(url) {
  const name = new URL(url).pathname.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  const hashLike = (part) => /\d/.test(part) || ((part.match(/[A-Z]/g) ?? []).length >= 3 && /[a-z]/.test(part));
  return name.split(/[.-]/).some((part) => part.length >= 8 && /^[A-Za-z0-9_]+$/.test(part) && /[a-z]/i.test(part) && hashLike(part));
}

function siteOf(hostname) {
  return hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
}

async function fetchAsset(ctx, url, pageHost) {
  const thirdParty = siteOf(new URL(url).hostname) !== siteOf(pageHost);
  return {
    url,
    thirdParty,
    ...(await attempt(ctx, url, async () => {
      const { res, body, finalUrl } = await fetchChain(url);
      return {
        finalUrl,
        status: res.status,
        contentType: res.headers.get('content-type'),
        bytes: body.length,
        encodedBytes: Number(res.headers.get('content-length')) || null,
        contentEncoding: res.headers.get('content-encoding'),
        cacheControl: res.headers.get('cache-control'),
        hashed: looksHashed(finalUrl),
      };
    })),
  };
}

async function probeAssets(ctx, page) {
  const pageHost = new URL(page.finalUrl).hostname;
  const fetchable = (url) => /^https?:/.test(url ?? '');
  const scripts = [];
  for (const s of page.html.scripts.slice(0, MAX_SCRIPTS)) if (fetchable(s.src)) scripts.push({ ...s, ...(await fetchAsset(ctx, s.src, pageHost)) });
  const stylesheets = [];
  for (const href of page.html.stylesheets.slice(0, MAX_STYLESHEETS)) if (fetchable(href)) stylesheets.push(await fetchAsset(ctx, href, pageHost));
  const images = [];
  for (const img of page.html.images.filter((i) => fetchable(i.src)).slice(0, MAX_IMAGES)) images.push({ ...img, ...(await probeImage(ctx, img.src)) });
  const sum = (list, key) => list.reduce((n, a) => n + (a[key] ?? 0), 0);
  return {
    scripts,
    stylesheets,
    images,
    totals: {
      scriptBytes: sum(scripts, 'bytes'),
      styleBytes: sum(stylesheets, 'bytes'),
      imageBytes: sum(images, 'bytes'),
      thirdPartyScriptBytes: sum(scripts.filter((s) => s.thirdParty), 'bytes'),
      thirdPartyHosts: [...new Set([...scripts, ...stylesheets].filter((a) => a.thirdParty).map((a) => new URL(a.url).hostname))],
    },
  };
}

// --- Well-known files ---

// Well-known files: security.txt, ads.txt and the iOS and Android app-link files.

function parseSecurityTxt(text) {
  const field = (name) => [...text.matchAll(new RegExp(`^${name}:\\s*(.+)$`, 'gim'))].map((m) => m[1].trim());
  const expires = field('Expires')[0] ?? null;
  const date = expires ? new Date(expires) : null;
  return {
    contact: field('Contact'),
    expires,
    daysToExpiry: date && !Number.isNaN(date.valueOf()) ? Math.floor((date - Date.now()) / 86400000) : null,
    signed: /-----BEGIN PGP SIGNED MESSAGE-----/.test(text),
  };
}

function parseAdsTxt(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const records = lines.filter((l) => /^[^,=\s]+\s*,\s*[^,\s]+\s*,\s*(DIRECT|RESELLER)\b/i.test(l));
  const variables = lines.filter((l) => /^[a-z]+=/i.test(l));
  return { records: records.length, invalidLines: lines.length - records.length - variables.length };
}

function parseJsonFile(text) {
  try {
    const data = JSON.parse(text);
    return { validJson: true, applinks: Boolean(data?.applinks), webcredentials: Boolean(data?.webcredentials), statements: Array.isArray(data) ? data.length : null };
  } catch (error) {
    return { validJson: false, parseError: error.message };
  }
}

// Each file's paths in the order tried, and the parser for its body.
const WELL_KNOWN = {
  securityTxt: { paths: ['/.well-known/security.txt', '/security.txt'], parse: parseSecurityTxt },
  adsTxt: { paths: ['/ads.txt'], parse: parseAdsTxt },
  appleAppSiteAssociation: { paths: ['/.well-known/apple-app-site-association', '/apple-app-site-association'], parse: parseJsonFile },
  assetLinks: { paths: ['/.well-known/assetlinks.json'], parse: parseJsonFile },
};

const wellKnownRequests = (origin) =>
  Object.entries(WELL_KNOWN).flatMap(([name, { paths }]) =>
    paths.map((path, i) => ({ name, path, url: origin + path, purpose: i ? `${name} fallback, only when the first path fails` : name })));

// The first path of each file that answers 200 with a non-HTML body, else the last answer; `tried` lists every path's status.
async function probeWellKnown(ctx, origin) {
  const out = {};
  const found = new Set();
  for (const { name, path, url } of wellKnownRequests(origin)) {
    if (found.has(name)) continue;
    const tried = out[name]?.tried ?? [];
    const facts = await attempt(ctx, url, async () => {
      const { res, body, redirects, finalUrl } = await fetchChain(url);
      const contentType = res.headers.get('content-type');
      const answer = { status: res.status, finalUrl, redirects, contentType, bytes: body.length };
      if (res.status !== 200 || /html/i.test(contentType ?? '')) return answer;
      found.add(name);
      return { ...answer, ...WELL_KNOWN[name].parse(body.toString('utf8')) };
    });
    tried.push(facts.redirects ? { path, status: facts.status, redirects: facts.redirects.length } : { path, error: facts.error ?? facts.skipped });
    out[name] = { path, ...facts, tried };
  }
  return out;
}

// --- Social previews, icons, manifest ---

// Social previews, icons and the web app manifest, plus what link-preview scrapers are served.

const SOCIAL_IMAGE_TAGS = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'];
const MAX_SOCIAL_IMAGES = 4;
const MAX_ICONS = 10;
const MANIFEST_FIELDS = ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'prefer_related_applications'];
const SCRAPERS = {
  facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  Twitterbot: 'Twitterbot/1.0',
};

const iconRequests = (origin) => ({
  faviconIco: { url: `${origin}/favicon.ico`, purpose: 'favicon' },
  appleTouchFallback: { url: `${origin}/apple-touch-icon.png`, purpose: 'apple-touch-icon fallback, only when none is linked' },
});
const scraperRequests = (url) =>
  Object.entries(SCRAPERS).map(([name, ua]) => ({ name, url, purpose: `re-fetch as ${name}`, headers: { 'user-agent': ua } }));

async function socialImages(ctx, html) {
  const seen = new Set();
  const out = [];
  for (const tag of SOCIAL_IMAGE_TAGS) {
    for (const href of [...(html.openGraph[tag] ?? []), ...(html.twitter[tag] ?? [])]) {
      const resolved = resolve(href, html.base);
      if (seen.has(resolved) || out.length >= MAX_SOCIAL_IMAGES) continue;
      seen.add(resolved);
      out.push({ tag, href, resolved, ...(await probeImage(ctx, resolved)) });
    }
  }
  return out;
}

async function probeIcons(ctx, page, robots) {
  const origin = new URL(page.finalUrl).origin;
  const withRobots = async (icon) => {
    const facts = { ...icon, ...(await probeImage(ctx, icon.resolved)) };
    const at = icon.resolved && new URL(icon.resolved);
    if (robots && at?.origin === origin) facts.robotsTxt = robotsVerdict(robots.groups, 'Googlebot-Image', at.pathname + at.search, 'Googlebot');
    return facts;
  };
  const linked = [];
  for (const icon of page.html.icons.slice(0, MAX_ICONS)) linked.push(await withRobots(icon));
  const appleLinked = page.html.icons.some((i) => i.rel.startsWith('apple-touch-icon'));
  const { faviconIco, appleTouchFallback } = iconRequests(origin);
  return {
    linked,
    faviconIco: await withRobots({ resolved: faviconIco.url }),
    appleTouchFallback: appleLinked ? null : await withRobots({ resolved: appleTouchFallback.url }),
  };
}

async function probeManifest(ctx, url) {
  if (!url) return null;
  return {
    url,
    ...(await attempt(ctx, url, async () => {
      const { res, body, redirects, finalUrl } = await fetchChain(url, { accept: 'application/manifest+json,application/json,*/*' });
      const out = { finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type') };
      if (res.status !== 200) return out;
      let m;
      try {
        m = JSON.parse(body.toString('utf8'));
      } catch (error) {
        return { ...out, parseError: error.message };
      }
      const icons = [];
      for (const icon of (Array.isArray(m.icons) ? m.icons : []).slice(0, MAX_ICONS)) {
        const resolved = resolve(icon.src ?? '', finalUrl);
        icons.push({ src: icon.src ?? null, sizes: icon.sizes ?? null, type: icon.type ?? null, purpose: icon.purpose ?? null, ...(await probeImage(ctx, resolved)) });
      }
      return { ...out, ...Object.fromEntries(MANIFEST_FIELDS.map((f) => [f, m[f] ?? null])), iconCount: Array.isArray(m.icons) ? m.icons.length : 0, icons };
    })),
  };
}

// What link-preview scrapers get: some hosts and bot rules answer them differently from a browser.
async function probeScrapers(ctx, url) {
  const out = {};
  for (const { name, headers } of scraperRequests(url)) {
    out[name] = await attempt(ctx, url, async () => {
      const { res, body, finalUrl } = await fetchChain(url, headers);
      const text = body.toString('utf8');
      const head = /html/i.test(res.headers.get('content-type') ?? '') ? headFacts(readDocument(text, finalUrl)) : null;
      return {
        status: res.status,
        finalUrl,
        blocked: blockedBy(res, text),
        ogTitle: head?.openGraph['og:title']?.[0] ?? null,
        ogImage: head?.openGraph['og:image']?.[0] ?? null,
        twitterCard: head?.twitter['twitter:card']?.[0] ?? null,
      };
    });
  }
  return out;
}

// --- Pages ---

// Facts of one page: status, redirects, headers, robots verdict, raw HTML, canonical target and preview images;
// plus the homepage-only extras (icons, manifest, scrapers, assets) a full run adds.

async function probePage(ctx, url, robots) {
  let got;
  try {
    got = await fetchChain(url);
  } catch (error) {
    return { url, error: errorText(error), inSitemap: null };
  }
  const { res, body, redirects, setCookies, finalUrl, ms } = got;
  const text = body.toString('utf8');
  const headers = headerObject(res);
  const contentType = headers['content-type'] ?? null;
  // robots.txt only governs its own origin, so a cross-origin redirect is judged on the requested path.
  const final = new URL(finalUrl);
  const judged = final.origin === new URL(url).origin ? final : new URL(url);
  const robotsPath = judged.pathname + judged.search;
  const html = /html/i.test(contentType ?? '') ? parseHtml(text, finalUrl) : null;
  const page = {
    url,
    finalUrl,
    status: res.status,
    redirects,
    ms,
    blocked: blockedBy(res, text),
    platform: platformOf(headers),
    contentType,
    bytes: body.length,
    headers,
    xRobotsTag: headers['x-robots-tag'] ?? null,
    canonicalHeader: canonicalFromLinkHeader(headers.link),
    robotsTxt: robots ? { path: robotsPath, ...robotsVerdict(robots.groups, 'Googlebot', robotsPath) } : null,
    html,
    security: securityFacts(headers, html, setCookies),
    canonicalTarget: null,
    inSitemap: null,
  };
  const canonical = html?.canonicals[0]?.resolved ?? resolve(page.canonicalHeader ?? '', finalUrl);
  if (canonical && canonical.replace(/#.*$/, '') !== finalUrl) page.canonicalTarget = { url: canonical, ...(await attempt(ctx, canonical, () => chain(canonical))) };
  if (html) page.socialImages = await socialImages(ctx, html);
  return page;
}

// Null in a --pages-only run, so every page carries the same keys.
const NO_HOMEPAGE_EXTRAS = { icons: null, manifest: null, scrapers: null, assets: null };

async function probeHomepageExtras(ctx, page, robots) {
  return {
    icons: await probeIcons(ctx, page, robots),
    manifest: await probeManifest(ctx, page.html.manifest),
    scrapers: await probeScrapers(ctx, page.url),
    assets: await probeAssets(ctx, page),
  };
}

// --- Site facts and the request plan ---

// Site facts (sitemap, DNS verification, security, well-known files) and the request plan --list-probes prints.
// The plan is built from the same request builders the probes send, so the list matches what a run requests.

const originsOf = (urls) => [...new Set(urls.map((u) => new URL(u).origin))];

async function probeSite(ctx, origin, robots, apiPaths) {
  return {
    sitemap: await probeSitemaps(origin, robots.sitemaps),
    dnsVerification: await dnsVerification(new URL(origin).hostname),
    security: await probeSiteSecurity(ctx, origin, apiPaths),
    wellKnown: await probeWellKnown(ctx, origin),
  };
}

const PAGE_DEPENDENT = ['each canonical target that differs from its page', 'each preview image (og:image, twitter:image)'];
const SITE_ORIGIN_NOTE =
  "Site checks (every request below except robots.txt and the pages) go to the origin each robots.txt request finally resolves to. When robots.txt redirects to another origin (http to https, apex to www), the same checks go there instead, with that origin's TLS, DNS and redirect checks.";

const listed = ({ url, purpose, headers }) => ({ method: 'GET', url, purpose, ...(headers ? { headers } : {}) });

// Every request a run sends, printed before any is sent. Requests that depend on responses are described, not listed.
// laterPages are URLs the audit will probe in a later --pages-only run (other hosts, migration URLs).
function plannedRequests(urls, { pagesOnly, apiPaths, laterPages }) {
  const origins = originsOf(urls);
  const laterOrigins = originsOf(laterPages).filter((o) => !origins.includes(o));
  const get = [
    ...origins.map(robotsRequest),
    ...urls.map((url) => ({ url, purpose: 'page' })),
    ...laterOrigins.map((o) => ({ ...robotsRequest(o), purpose: 'robots.txt, in a later --pages-only run' })),
    ...laterPages.map((url) => ({ url, purpose: 'page, in a later --pages-only run' })),
  ];
  if (pagesOnly) return { get: get.map(listed), tls: [], dns: [], dependent: PAGE_DEPENDENT };
  for (const origin of origins) {
    get.push(
      ...sitemapGuessRequests(origin),
      ...Object.values(iconRequests(origin)),
      ...exposedFileRequests(origin),
      ...graphqlRequests(origin),
      ...corsRequests(origin, apiPaths),
      notFoundRequest(origin, '<random>'),
      ...wellKnownRequests(origin),
      ...redirectRequests(origin),
    );
  }
  for (const url of urls) get.push(...scraperRequests(url));
  return {
    siteOrigin: SITE_ORIGIN_NOTE,
    get: get.map(listed),
    tls: origins.flatMap(tlsHosts).map((host) => `${host}:443 (handshake, certificate read)`),
    dns: origins.flatMap((o) => verificationNames(new URL(o).hostname)).map((name) => `TXT ${name}`),
    dependent: [
      'sitemap files named in robots.txt and in sitemap indexes (up to 50)',
      ...PAGE_DEPENDENT.slice(0, 1),
      'each preview image, linked icon, the manifest and its icons',
      'CORS check on each GraphQL path that answers as GraphQL',
      'the first internal link with its trailing slash toggled',
      `homepage scripts (up to ${MAX_SCRIPTS}), stylesheets (up to ${MAX_STYLESHEETS}) and images (up to ${MAX_IMAGES}), in full`,
    ],
  };
}

// --- CLI ---

const USAGE = [
  'usage: probe.mjs [--pages-only] [--api <path>]... <url> [<url>...]',
  '       probe.mjs --list-probes [--pages-only] [--api <path>]... [--pages <url>]... <url> [<url>...]',
  '       probe.mjs --mail-dns <domain> [--dkim-selector <name>]...',
].join('\n');
const VALUE_FLAGS = { '--api': 'apiPaths', '--dkim-selector': 'selectors', '--pages': 'laterPages' };

function runtime() {
  if (globalThis.Bun) return `bun ${globalThis.Bun.version}`;
  if (globalThis.Deno) return `deno ${globalThis.Deno.version.deno}`;
  return `node ${process.versions.node}`;
}

const asUrl = (target) => new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`).href;

function parseArgs(argv) {
  const args = { apiPaths: [], selectors: [], laterPages: [], targets: [], flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    if (VALUE_FLAGS[argv[i]]) args[VALUE_FLAGS[argv[i]]].push(argv[++i]);
    else if (argv[i].startsWith('--')) args.flags.add(argv[i]);
    else args.targets.push(argv[i]);
  }
  return args;
}

// One site per origin robots.txt resolves to, so http://x and https://x share facts when one redirects to the other.
async function probeSites(ctx, urls) {
  const sites = [];
  const robotsByOrigin = {};
  for (const requested of originsOf(urls)) {
    const robots = await probeRobots(ctx, requested);
    robotsByOrigin[requested] = robots;
    const origin = new URL(robots.finalUrl ?? robots.url).origin;
    if (!sites.some((s) => s.origin === origin)) sites.push({ origin, robots, sitemap: null, dnsVerification: null, security: null, wellKnown: null, routing: null });
  }
  return { sites, robotsByOrigin };
}

async function main(argv) {
  const { apiPaths, selectors, laterPages, targets, flags } = parseArgs(argv);
  const pagesOnly = flags.has('--pages-only');
  if (flags.has('--help') || !targets.length || [...apiPaths, ...selectors, ...laterPages].includes(undefined)) {
    console.error(USAGE);
    process.exit(flags.has('--help') ? 0 : 2);
  }
  if (flags.has('--mail-dns')) {
    const domain = targets[0].replace(/^https?:\/\//i, '').replace(/[/:].*$/, '');
    console.log(JSON.stringify({ probe: 'web-ready-audit', mode: 'mail-dns', runtime: runtime(), ...(await mailDns(domain, selectors)) }, null, 2));
    return;
  }
  const urls = targets.map(asUrl);
  if (flags.has('--list-probes')) {
    const plan = plannedRequests(urls, { pagesOnly, apiPaths, laterPages: laterPages.map(asUrl) });
    console.log(JSON.stringify({ probe: 'web-ready-audit', mode: 'list-probes', ...plan }, null, 2));
    return;
  }

  const ctx = targetContext(urls);
  const { sites, robotsByOrigin } = await probeSites(ctx, urls);
  const pages = [];
  for (const url of urls) pages.push(await probePage(ctx, url, robotsByOrigin[new URL(url).origin]));
  for (const page of pages) if (page.html) Object.assign(page, NO_HOMEPAGE_EXTRAS);

  if (!pagesOnly) {
    for (const site of sites) Object.assign(site, await probeSite(ctx, site.origin, site.robots, apiPaths));
    for (const page of pages) if (page.html) Object.assign(page, await probeHomepageExtras(ctx, page, robotsByOrigin[new URL(page.url).origin]));
    for (const site of sites) {
      const homepage = pages.find((p) => p.finalUrl && new URL(p.finalUrl).origin === site.origin);
      site.routing = await probeRouting(ctx, site.origin, homepage);
    }
    const sitemapUrls = new Set(sites.flatMap((s) => s.sitemap.urls));
    for (const page of pages) page.inSitemap = sitemapUrls.has(page.url) || sitemapUrls.has(page.finalUrl);
  }

  console.log(JSON.stringify({ probe: 'web-ready-audit', runtime: runtime(), fetchedAt: new Date().toISOString(), sites, pages }, null, 2));
}

await main(process.argv.slice(2));
