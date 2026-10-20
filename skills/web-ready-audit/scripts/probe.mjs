#!/usr/bin/env node
// Fetches pages of a live site with read-only GETs and prints launch-readiness facts as JSON.
// Zero dependencies: web-standard fetch plus node: built-ins that Bun and Deno also support.
// Usage: probe.mjs [--pages-only | --list-probes] [--api <path>]... <url> [<url>...]
import { lookup, resolveTxt } from 'node:dns/promises';
import { connect } from 'node:tls';
import { gunzipSync } from 'node:zlib';

const USAGE = 'usage: probe.mjs [--pages-only | --list-probes] [--api <path>]... <url> [<url>...]';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;
const MAX_HOPS = 10;
const MAX_SITEMAPS = 50;
const MAX_SITEMAP_URLS = 500;
const MAX_LINKS = 100;
const MAX_OTHER_LINES = 20;
const SITEMAP_GUESSES = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'PerplexityBot'];
const VERIFICATION_META = ['google-site-verification', 'msvalidate.01', 'yandex-verification'];
const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const SCRAPERS = {
  facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  Twitterbot: 'Twitterbot/1.0',
};
const SOCIAL_IMAGE_TAGS = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'];
const MAX_SOCIAL_IMAGES = 4;
const MAX_ICONS = 10;
const MAX_JSONLD_BYTES = 20000;
const IMAGE_RANGE = 'bytes=0-65535';
const EVIL_ORIGIN = 'https://evil.example';
const GRAPHQL_PATHS = ['/graphql', '/api/graphql'];
const INTROSPECTION_QUERY = '{__schema{queryType{name}}}';
const PROBE_RANGE = 'bytes=0-4095';
const MAX_MIXED = 20;
const NOT_FOUND_PREFIX = '/web-ready-audit-404-';
const MAX_ASSET_LIST = 50;
const MAX_SCRIPTS = 20;
const MAX_STYLESHEETS = 10;
const MAX_IMAGES = 10;
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
// Set when the audit target itself is local; only then are local and private hosts fetched.
let auditingLocal = false;
const skipHost = (url) => !auditingLocal && LOCAL_HOST.test(new URL(url).hostname);

// --- HTTP ---

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

function errorText(error) {
  const cause = error.cause?.code ?? error.cause?.message;
  return cause ? `${error.message} (${cause})` : error.message;
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

function resolve(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function canonicalFromLinkHeader(value) {
  if (!value) return null;
  const m = value.match(/<([^>]+)>\s*;[^,]*rel="?canonical"?/i);
  return m ? m[1] : null;
}

function parseHtml(html, pageUrl) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const jsonLd = [...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((m) => /^application\/ld\+json$/i.test((attrs(m[1]).type ?? '').trim()))
    .map((m) => jsonLdBlock(m[2]));
  const headEnd = clean.search(/<\/head\s*>/i);
  const head = (headEnd === -1 ? clean.slice(0, 1_000_000) : clean.slice(0, headEnd))
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const body = (headEnd === -1 ? clean : clean.slice(headEnd)).replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

  const tags = [...head.matchAll(/<(meta|link|base)\b([^>]*)>/gi)].map((m) => ({ tag: m[1].toLowerCase(), ...attrs(m[2]) }));
  const metas = tags.filter((t) => t.tag === 'meta');
  const links = tags.filter((t) => t.tag === 'link');
  const rels = (t) => (t.rel ?? '').toLowerCase().split(/\s+/);
  const metaNamed = (...names) => metas.filter((t) => names.includes((t.name ?? '').toLowerCase()));
  const base = resolve(tags.find((t) => t.tag === 'base')?.href ?? '', pageUrl) ?? pageUrl;

  // Open Graph and X tags, keyed by property, each a list because og:image may repeat.
  const openGraph = {};
  const twitter = {};
  for (const t of metas) {
    const key = (t.property ?? t.name ?? '').toLowerCase();
    const into = key.startsWith('og:') ? openGraph : key.startsWith('twitter:') ? twitter : null;
    if (into) (into[key] ??= []).push(t.content ?? '');
  }
  const icons = links
    .filter((t) => rels(t).includes('icon') || rels(t).some((r) => r.startsWith('apple-touch-icon') || r === 'mask-icon'))
    .map((t) => ({ rel: rels(t).join(' '), href: t.href ?? '', resolved: resolve(t.href ?? '', base), sizes: t.sizes ?? null, type: t.type ?? null }));
  const manifest = links.find((t) => rels(t).includes('manifest'));
  const scriptTags = [...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((m) => ({ ...attrs(m[1]), inline: m[2] }));
  const inHead = (index) => headEnd === -1 || index < headEnd;
  const scripts = [...clean.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => ({ a: attrs(m[1]), index: m.index }))
    .filter(({ a }) => a.src)
    .map(({ a, index }) => ({ src: resolve(a.src, base), type: a.type ?? null, async: 'async' in a, defer: 'defer' in a, inHead: inHead(index) }));
  const inlineScriptBytes = scriptTags.filter((t) => !t.src && !/json/i.test(t.type ?? '')).reduce((n, t) => n + t.inline.length, 0);
  const stylesheets = links.filter((t) => rels(t).includes('stylesheet')).map((t) => resolve(t.href ?? '', base));
  const resourceHints = links
    .filter((t) => rels(t).some((r) => ['preconnect', 'dns-prefetch', 'preload', 'modulepreload'].includes(r)))
    .map((t) => ({ rel: rels(t).join(' '), href: resolve(t.href ?? '', base), as: t.as ?? null }));
  const images = [...body.matchAll(/<img\b([^>]*)>/gi)].map((m) => attrs(m[1])).map((a) => ({
    src: resolve(a.src ?? '', base),
    srcset: Boolean(a.srcset),
    loading: a.loading ?? null,
    fetchpriority: a.fetchpriority ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
  }));
  const cspMeta = metas.find((t) => (t['http-equiv'] ?? '').toLowerCase() === 'content-security-policy')?.content ?? null;

  const verification = {};
  for (const t of metaNamed(...VERIFICATION_META)) verification[t.name.toLowerCase()] = t.content ?? '';

  const internal = new Set();
  const origin = new URL(pageUrl).origin;
  for (const m of body.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = resolve(decodeEntities(m[1] ?? m[2] ?? m[3]), base);
    if (!href || new URL(href).origin !== origin) continue;
    internal.add(href.replace(/#.*$/, ''));
  }

  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const mount = body.match(/<div\b[^>]*\bid\s*=\s*["']?(root|app|__next|svelte|q-app)["']?[^>]*>\s*<\/div>/i);

  return {
    base,
    lang: attrs(clean.match(/<html\b([^>]*)>/i)?.[1] ?? '').lang ?? null,
    titles: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map((m) => decodeEntities(m[1]).replace(/\s+/g, ' ').trim()),
    descriptions: metaNamed('description').map((t) => t.content ?? ''),
    canonicals: links.filter((t) => rels(t).includes('canonical')).map((t) => ({ href: t.href ?? '', resolved: resolve(t.href ?? '', base) })),
    metaRobots: metaNamed('robots', 'googlebot', 'bingbot').map((t) => ({ name: t.name.toLowerCase(), content: t.content ?? '' })),
    viewport: metaNamed('viewport').map((t) => t.content ?? ''),
    hreflang: links.filter((t) => rels(t).includes('alternate') && t.hreflang).map((t) => ({ hreflang: t.hreflang, href: resolve(t.href ?? '', base) })),
    verification,
    openGraph,
    twitter,
    icons,
    manifest: manifest ? resolve(manifest.href ?? '', base) : null,
    jsonLd,
    cspMeta,
    mixedContent: new URL(pageUrl).protocol === 'https:' ? mixedContent(clean) : null,
    scripts: scripts.slice(0, MAX_ASSET_LIST),
    scriptCount: scripts.length,
    inlineScriptBytes,
    stylesheets: stylesheets.slice(0, MAX_ASSET_LIST),
    resourceHints,
    images: images.slice(0, MAX_ASSET_LIST),
    imageCount: images.length,
    bodyTextLength: text.length,
    emptyMount: mount ? mount[1] : null,
    internalLinks: { count: internal.size, urls: [...internal].slice(0, MAX_LINKS) },
  };
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
function probeImage(url) {
  if (!imageCache.has(url)) imageCache.set(url, fetchImage(url));
  return imageCache.get(url);
}

async function fetchImage(url) {
  if (!url) return { error: 'invalid URL' };
  if (skipHost(url)) return { skipped: 'local or private host' };
  try {
    // A range request reads only the header bytes; a full GET follows when the size sits further in (large JPEG metadata).
    let { res, body, redirects, finalUrl } = await fetchChain(url, { range: IMAGE_RANGE, accept: 'image/*,*/*' });
    let size = res.status === 200 || res.status === 206 ? imageSize(body) : null;
    if (res.status === 206 && !size?.width) {
      ({ res, body, redirects, finalUrl } = await fetchChain(url, { accept: 'image/*,*/*' }));
      size = imageSize(body);
    }
    const total = res.status === 206 ? Number(res.headers.get('content-range')?.split('/')[1]) || null : body.length;
    return { finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type'), bytes: total, format: null, width: null, height: null, ...size };
  } catch (error) {
    return { error: errorText(error) };
  }
}

// --- robots.txt ---

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

async function probeRobots(origin) {
  const url = `${origin}/robots.txt`;
  try {
    const { res, body, redirects, finalUrl } = await fetchChain(url);
    const parsed = res.status === 200 ? parseRobots(body.toString('utf8')) : { groups: [], sitemaps: [], otherLines: [] };
    return {
      url,
      finalUrl,
      status: res.status,
      redirects,
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      ...parsed,
      googlebot: robotsVerdict(parsed.groups, 'Googlebot', '/'),
      aiCrawlers: Object.fromEntries(AI_CRAWLERS.map((bot) => [bot, robotsVerdict(parsed.groups, bot, '/')])),
    };
  } catch (error) {
    return { url, error: errorText(error), groups: [], sitemaps: [], otherLines: [] };
  }
}

// --- Sitemaps ---

function parseSitemap(body) {
  const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  const xml = raw.toString('utf8').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const kind = /<sitemapindex\b/i.test(xml) ? 'sitemapindex' : /<urlset\b/i.test(xml) ? 'urlset' : 'not-xml';
  const locs = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  const lastmods = [...xml.matchAll(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/gi)].map((m) => m[1]);
  return { kind, locs, lastmods };
}

async function probeSitemaps(origin, declared) {
  const queue = declared.length ? [...declared] : [];
  const guesses = declared.length ? [] : SITEMAP_GUESSES.map((p) => origin + p);
  const files = [];
  const urls = new Set();
  const hosts = {};
  const lastmods = new Set();
  let urlCount = 0;
  let lastmodCount = 0;

  while ((queue.length || guesses.length) && files.length < MAX_SITEMAPS) {
    const fromGuess = !queue.length;
    const url = queue.shift() ?? guesses.shift();
    const file = { url };
    files.push(file);
    try {
      const { res, body, redirects, finalUrl } = await fetchChain(url);
      Object.assign(file, { finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type'), bytes: body.length });
      if (res.status !== 200) continue;
      const { kind, locs, lastmods: mods } = parseSitemap(body);
      Object.assign(file, { kind, locs: locs.length, lastmods: mods.length });
      if (kind === 'sitemapindex') queue.push(...locs);
      if (kind !== 'urlset') continue;
      urlCount += locs.length;
      lastmodCount += mods.length;
      mods.forEach((m) => lastmods.add(m));
      for (const loc of locs) {
        if (urls.size < MAX_SITEMAP_URLS) urls.add(loc);
        const resolved = resolve(loc, origin);
        const host = resolved ? new URL(resolved).origin : 'invalid';
        hosts[host] = (hosts[host] ?? 0) + 1;
      }
      if (fromGuess) guesses.length = 0;
    } catch (error) {
      file.error = errorText(error);
    }
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

async function dnsVerification(hostname) {
  const out = {};
  for (const name of new Set([hostname, hostname.replace(/^www\./, '')])) {
    try {
      const records = (await resolveTxt(name)).map((r) => r.join(''));
      out[name] = records.filter((t) => /^(google-site-verification|yandex-verification)/i.test(t));
    } catch (error) {
      out[name] = { error: error.code ?? error.message };
    }
  }
  return out;
}

// --- Pages ---

async function probePage(url, robots, siteFacts) {
  try {
    const { res, body, redirects, setCookies, finalUrl, ms } = await fetchChain(url);
    const text = body.toString('utf8');
    const headers = headerObject(res);
    const contentType = headers['content-type'] ?? null;
    // robots.txt only governs its own origin, so a cross-origin redirect is judged on the requested path.
    const final = new URL(finalUrl);
    const judged = final.origin === new URL(url).origin ? final : new URL(url);
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
      robotsTxt: robots ? { path: judged.pathname + judged.search, ...robotsVerdict(robots.groups, 'Googlebot', judged.pathname + judged.search) } : null,
      html: /html/i.test(contentType ?? '') ? parseHtml(text, finalUrl) : null,
      canonicalTarget: null,
    };
    page.security = securityFacts(headers, page.html, setCookies);
    const canonical = page.html?.canonicals[0]?.resolved ?? resolve(page.canonicalHeader ?? '', finalUrl);
    if (canonical && canonical.replace(/#.*$/, '') !== finalUrl) page.canonicalTarget = await probeTarget(canonical);
    if (page.html) {
      page.socialImages = await socialImages(page.html);
      page.icons = siteFacts ? await probeIcons(page.html, page, robots) : null;
      page.manifest = siteFacts ? await probeManifest(page.html.manifest) : null;
      page.scrapers = siteFacts ? await probeScrapers(url) : null;
      page.assets = siteFacts ? await probeAssets(page) : null;
    }
    return page;
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

async function probeTarget(url) {
  if (skipHost(url)) return { url, skipped: 'local or private host' };
  try {
    const { res, redirects, finalUrl } = await fetchChain(url);
    return { url, finalUrl, status: res.status, redirects };
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

// --- Security ---

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

// The www or apex twin of a host: users type either, so both need a valid certificate.
function twinHost(host) {
  return host.startsWith('www.') ? host.slice(4) : `www.${host}`;
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

async function probeExposed(origin) {
  const out = [];
  for (const [path, looksReal] of Object.entries(EXPOSED_FILES)) {
    try {
      const { res, body, finalUrl } = await fetchChain(origin + path, { range: PROBE_RANGE });
      const ok = res.status === 200 || res.status === 206;
      out.push({ path, status: res.status, finalUrl, contentType: res.headers.get('content-type'), exposed: ok && looksReal(body) });
    } catch (error) {
      out.push({ path, error: errorText(error) });
    }
  }
  return out;
}

async function probeGraphql(origin) {
  const out = [];
  for (const path of GRAPHQL_PATHS) {
    const url = `${origin}${path}?query=${encodeURIComponent(INTROSPECTION_QUERY)}`;
    try {
      const { res, body } = await fetchChain(url, { accept: 'application/graphql-response+json,application/json' });
      const text = body.toString('utf8', 0, 20000);
      out.push({
        path,
        status: res.status,
        contentType: res.headers.get('content-type'),
        graphql: /^\s*\{\s*"(data|errors)"/.test(text),
        introspection: /"__schema"\s*:\s*\{/.test(text),
      });
    } catch (error) {
      out.push({ path, error: errorText(error) });
    }
  }
  return out;
}

async function probeCors(url) {
  try {
    const { res } = await fetchChain(url, { origin: EVIL_ORIGIN });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    return {
      url,
      status: res.status,
      allowOrigin,
      allowCredentials: res.headers.get('access-control-allow-credentials'),
      reflected: allowOrigin === EVIL_ORIGIN,
      vary: res.headers.get('vary'),
    };
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

async function probeSiteSecurity(origin, apiPaths) {
  const { protocol, hostname } = new URL(origin);
  const graphql = await probeGraphql(origin);
  const corsUrls = [origin + '/', ...graphql.filter((g) => g.graphql).map((g) => origin + g.path), ...apiPaths.map((p) => new URL(p, origin).href)];
  const cors = [];
  for (const url of corsUrls) cors.push(await probeCors(url));
  const local = LOCAL_HOST.test(hostname);
  return {
    tls: protocol === 'https:' && !local ? [await tlsFacts(hostname), await tlsFacts(twinHost(hostname))] : null,
    exposedFiles: await probeExposed(origin),
    graphql,
    cors,
  };
}

// Every request a run sends, printed before any is sent. Requests that depend on responses are described, not listed.
function plannedRequests(urls, pagesOnly, apiPaths) {
  const origins = [...new Set(urls.map((u) => new URL(u).origin))];
  const get = [];
  const add = (url, purpose, headers) => get.push({ method: 'GET', url, purpose, ...(headers ? { headers } : {}) });
  for (const origin of origins) add(`${origin}/robots.txt`, 'robots.txt');
  for (const url of urls) add(url, 'page');
  if (pagesOnly) return { get, dependent: ['each canonical target that differs from its page', 'each preview image (og:image, twitter:image)'] };
  for (const origin of origins) {
    for (const path of SITEMAP_GUESSES) add(origin + path, 'sitemap guess, only when robots.txt lists none');
    add(`${origin}/favicon.ico`, 'favicon');
    add(`${origin}/apple-touch-icon.png`, 'apple-touch-icon fallback, only when none is linked');
    for (const path of Object.keys(EXPOSED_FILES)) add(origin + path, 'exposed file check (first 4 KB)', { range: PROBE_RANGE });
    for (const path of GRAPHQL_PATHS) add(`${origin}${path}?query=${encodeURIComponent(INTROSPECTION_QUERY)}`, 'GraphQL introspection check');
    add(`${origin}/`, 'CORS check', { origin: EVIL_ORIGIN });
    add(`${origin}${NOT_FOUND_PREFIX}<random>`, 'deliberate 404');
    const { protocol, hostname } = new URL(origin);
    if (protocol === 'https:' && !LOCAL_HOST.test(hostname)) {
      add(`http://${hostname}/`, 'http to https redirect');
      add(`https://${twinHost(hostname)}/`, 'www or apex redirect');
    }
    for (const path of apiPaths) add(new URL(path, origin).href, 'CORS check', { origin: EVIL_ORIGIN });
  }
  for (const url of urls) for (const [name, ua] of Object.entries(SCRAPERS)) add(url, `re-fetch as ${name}`, { 'user-agent': ua });
  const hosts = origins.map((o) => new URL(o)).filter((u) => u.protocol === 'https:' && !LOCAL_HOST.test(u.hostname)).map((u) => u.hostname);
  return {
    get,
    tls: hosts.flatMap((h) => [h, twinHost(h)]).map((host) => `${host}:443 (handshake, certificate read)`),
    dns: origins.map((o) => new URL(o).hostname).flatMap((h) => [...new Set([h, h.replace(/^www\./, '')])].map((n) => `TXT ${n}`)),
    dependent: [
      'sitemap files named in robots.txt and in sitemap indexes (up to 50)',
      'each canonical target that differs from its page',
      'each preview image, linked icon, the manifest and its icons',
      'CORS check on each GraphQL path that answers as GraphQL',
      'the first internal link with its trailing slash toggled',
      `homepage scripts (up to ${MAX_SCRIPTS}), stylesheets (up to ${MAX_STYLESHEETS}) and images (up to ${MAX_IMAGES}), in full`,
    ],
  };
}

// --- Routing ---

function chainFacts({ res, redirects, finalUrl }) {
  return { status: res.status, finalUrl, redirects };
}

async function chainOrError(url) {
  try {
    return { url, ...chainFacts(await fetchChain(url)) };
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

// The same path with the trailing slash toggled, from the first internal link that has a path.
function trailingSlashTwin(page) {
  const link = (page.html?.internalLinks.urls ?? []).map((u) => new URL(u)).find((u) => u.pathname.length > 1 && !/\.[a-z0-9]+$/i.test(u.pathname));
  if (!link) return null;
  const twin = new URL(link);
  twin.pathname = link.pathname.endsWith('/') ? link.pathname.slice(0, -1) : `${link.pathname}/`;
  return { link: link.href, twin: twin.href };
}

async function probeRouting(origin, homepage) {
  const { protocol, hostname } = new URL(origin);
  const remote = protocol === 'https:' && !LOCAL_HOST.test(hostname);
  const notFoundUrl = `${origin}${NOT_FOUND_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
  let notFound;
  try {
    const got = await fetchChain(notFoundUrl);
    const html = /html/i.test(got.res.headers.get('content-type') ?? '') ? parseHtml(got.body.toString('utf8'), got.finalUrl) : null;
    notFound = {
      url: notFoundUrl,
      ...chainFacts(got),
      contentType: got.res.headers.get('content-type'),
      title: html?.titles[0] ?? null,
      sameTitleAsHome: Boolean(html?.titles[0]) && html.titles[0] === homepage?.html?.titles[0],
      metaRobots: html?.metaRobots ?? [],
      internalLinkCount: html?.internalLinks.count ?? 0,
    };
  } catch (error) {
    notFound = { url: notFoundUrl, error: errorText(error) };
  }
  const slash = homepage ? trailingSlashTwin(homepage) : null;
  return {
    notFound,
    httpToHttps: remote ? await chainOrError(`http://${hostname}/`) : null,
    twinHost: remote ? await chainOrError(`https://${twinHost(hostname)}/`) : null,
    trailingSlash: slash ? { link: slash.link, ...(await chainOrError(slash.twin)) } : null,
  };
}

// --- Assets ---

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

async function fetchAsset(url, pageHost) {
  const thirdParty = siteOf(new URL(url).hostname) !== siteOf(pageHost);
  if (skipHost(url)) return { url, thirdParty, skipped: 'local or private host' };
  try {
    const { res, body, finalUrl } = await fetchChain(url);
    return {
      url,
      finalUrl,
      thirdParty,
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      encodedBytes: Number(res.headers.get('content-length')) || null,
      contentEncoding: res.headers.get('content-encoding'),
      cacheControl: res.headers.get('cache-control'),
      hashed: looksHashed(finalUrl),
    };
  } catch (error) {
    return { url, thirdParty, error: errorText(error) };
  }
}

async function probeAssets(page) {
  const pageHost = new URL(page.finalUrl).hostname;
  const scripts = [];
  for (const s of page.html.scripts.slice(0, MAX_SCRIPTS)) if (/^https?:/.test(s.src ?? '')) scripts.push({ ...s, ...(await fetchAsset(s.src, pageHost)) });
  const stylesheets = [];
  for (const href of page.html.stylesheets.slice(0, MAX_STYLESHEETS)) if (/^https?:/.test(href ?? '')) stylesheets.push(await fetchAsset(href, pageHost));
  const images = [];
  for (const img of page.html.images.filter((i) => /^https?:/.test(i.src ?? '')).slice(0, MAX_IMAGES)) images.push({ ...img, ...(await probeImage(img.src)) });
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

// --- Social previews, icons, manifest ---

async function socialImages(html) {
  const seen = new Set();
  const out = [];
  for (const tag of SOCIAL_IMAGE_TAGS) {
    for (const href of [...(html.openGraph[tag] ?? []), ...(html.twitter[tag] ?? [])]) {
      const resolved = resolve(href, html.base);
      if (seen.has(resolved) || out.length >= MAX_SOCIAL_IMAGES) continue;
      seen.add(resolved);
      out.push({ tag, href, resolved, ...(await probeImage(resolved)) });
    }
  }
  return out;
}

async function probeIcons(html, page, robots) {
  const origin = new URL(page.finalUrl).origin;
  const withRobots = async (icon) => {
    const facts = { ...icon, ...(await probeImage(icon.resolved)) };
    const at = icon.resolved && new URL(icon.resolved);
    if (robots && at?.origin === origin) facts.robotsTxt = robotsVerdict(robots.groups, 'Googlebot-Image', at.pathname + at.search, 'Googlebot');
    return facts;
  };
  const linked = [];
  for (const icon of html.icons.slice(0, MAX_ICONS)) linked.push(await withRobots(icon));
  const appleLinked = html.icons.some((i) => i.rel.startsWith('apple-touch-icon'));
  return {
    linked,
    faviconIco: await withRobots({ resolved: `${origin}/favicon.ico` }),
    appleTouchFallback: appleLinked ? null : await withRobots({ resolved: `${origin}/apple-touch-icon.png` }),
  };
}

async function probeManifest(url) {
  if (!url) return null;
  try {
    const { res, body, redirects, finalUrl } = await fetchChain(url, { accept: 'application/manifest+json,application/json,*/*' });
    const out = { url, finalUrl, status: res.status, redirects, contentType: res.headers.get('content-type') };
    if (res.status !== 200) return out;
    let m;
    try {
      m = JSON.parse(body.toString('utf8'));
    } catch (error) {
      return { ...out, parseError: error.message };
    }
    const fields = ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'prefer_related_applications'];
    const icons = [];
    for (const icon of (Array.isArray(m.icons) ? m.icons : []).slice(0, MAX_ICONS)) {
      const resolved = resolve(icon.src ?? '', finalUrl);
      icons.push({ src: icon.src ?? null, sizes: icon.sizes ?? null, type: icon.type ?? null, purpose: icon.purpose ?? null, ...(await probeImage(resolved)) });
    }
    return { ...out, ...Object.fromEntries(fields.map((f) => [f, m[f] ?? null])), iconCount: Array.isArray(m.icons) ? m.icons.length : 0, icons };
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

// What link-preview scrapers get: some hosts and bot rules answer them differently from a browser.
async function probeScrapers(url) {
  const out = {};
  for (const [name, ua] of Object.entries(SCRAPERS)) {
    try {
      const { res, body, finalUrl } = await fetchChain(url, { 'user-agent': ua });
      const text = body.toString('utf8');
      const html = /html/i.test(res.headers.get('content-type') ?? '') ? parseHtml(text, finalUrl) : null;
      out[name] = {
        status: res.status,
        finalUrl,
        blocked: blockedBy(res, text),
        ogTitle: html?.openGraph['og:title']?.[0] ?? null,
        ogImage: html?.openGraph['og:image']?.[0] ?? null,
        twitterCard: html?.twitter['twitter:card']?.[0] ?? null,
      };
    } catch (error) {
      out[name] = { error: errorText(error) };
    }
  }
  return out;
}

// --- CLI ---

function runtime() {
  if (globalThis.Bun) return `bun ${globalThis.Bun.version}`;
  if (globalThis.Deno) return `deno ${globalThis.Deno.version.deno}`;
  return `node ${process.versions.node}`;
}

async function main(argv) {
  const pagesOnly = argv.includes('--pages-only');
  const apiPaths = [];
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--api') apiPaths.push(argv[++i]);
    else if (!argv[i].startsWith('--')) targets.push(argv[i]);
  }
  if (argv.includes('--help') || !targets.length || apiPaths.includes(undefined)) {
    console.error(USAGE);
    process.exit(argv.includes('--help') ? 0 : 2);
  }
  const urls = targets.map((t) => new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).href);
  auditingLocal = urls.some((u) => LOCAL_HOST.test(new URL(u).hostname));
  if (argv.includes('--list-probes')) {
    console.log(JSON.stringify({ probe: 'web-ready-audit', mode: 'list-probes', ...plannedRequests(urls, pagesOnly, apiPaths) }, null, 2));
    return;
  }

  // One site per origin robots.txt resolves to, so http://x and https://x share facts when one redirects to the other.
  const sites = [];
  const robotsByOrigin = {};
  for (const requested of new Set(urls.map((u) => new URL(u).origin))) {
    const robots = await probeRobots(requested);
    robotsByOrigin[requested] = robots;
    const origin = new URL(robots.finalUrl ?? robots.url).origin;
    if (sites.some((s) => s.origin === origin)) continue;
    sites.push({
      origin,
      robots,
      sitemap: pagesOnly ? null : await probeSitemaps(origin, robots.sitemaps),
      dnsVerification: pagesOnly ? null : await dnsVerification(new URL(origin).hostname),
      security: pagesOnly ? null : await probeSiteSecurity(origin, apiPaths),
    });
  }

  const pages = [];
  for (const url of urls) pages.push(await probePage(url, robotsByOrigin[new URL(url).origin], !pagesOnly));

  for (const site of sites) {
    const homepage = pages.find((p) => p.finalUrl && new URL(p.finalUrl).origin === site.origin);
    site.routing = pagesOnly ? null : await probeRouting(site.origin, homepage);
  }

  const sitemapUrls = new Set(sites.flatMap((s) => s.sitemap?.urls ?? []));
  for (const page of pages) page.inSitemap = pagesOnly ? null : sitemapUrls.has(page.url) || sitemapUrls.has(page.finalUrl);

  console.log(JSON.stringify({ probe: 'web-ready-audit', runtime: runtime(), fetchedAt: new Date().toISOString(), sites, pages }, null, 2));
}

await main(process.argv.slice(2));
