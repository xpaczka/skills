#!/usr/bin/env node
// Fetches pages of a live site with read-only GETs and prints launch-readiness facts as JSON.
// Zero dependencies: web-standard fetch plus node: built-ins that Bun and Deno also support.
// Usage: probe.mjs [--pages-only] <url> [<url>...]
import { resolveTxt } from 'node:dns/promises';
import { gunzipSync } from 'node:zlib';

const USAGE = 'usage: probe.mjs [--pages-only] <url> [<url>...]';
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

// --- HTTP ---

// GETs url without following redirects automatically, so every hop is recorded.
async function fetchChain(url, headers = {}) {
  const redirects = [];
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const started = Date.now();
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: '*/*', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      redirects.push({ url: current, status: res.status, location });
      await res.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    return { res, body, redirects, finalUrl: current, ms: Date.now() - started };
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
    bodyTextLength: text.length,
    emptyMount: mount ? mount[1] : null,
    internalLinks: { count: internal.size, urls: [...internal].slice(0, MAX_LINKS) },
  };
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
  if (LOCAL_HOST.test(new URL(url).hostname)) return { skipped: 'local or private host' };
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
    const { res, body, redirects, finalUrl, ms } = await fetchChain(url);
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
    const canonical = page.html?.canonicals[0]?.resolved ?? resolve(page.canonicalHeader ?? '', finalUrl);
    if (canonical && canonical.replace(/#.*$/, '') !== finalUrl) page.canonicalTarget = await probeTarget(canonical);
    if (page.html) {
      page.socialImages = await socialImages(page.html);
      page.icons = siteFacts ? await probeIcons(page.html, page, robots) : null;
      page.manifest = siteFacts ? await probeManifest(page.html.manifest) : null;
      page.scrapers = siteFacts ? await probeScrapers(url) : null;
    }
    return page;
  } catch (error) {
    return { url, error: errorText(error) };
  }
}

async function probeTarget(url) {
  const { hostname } = new URL(url);
  if (LOCAL_HOST.test(hostname)) return { url, skipped: 'local or private host' };
  try {
    const { res, redirects, finalUrl } = await fetchChain(url);
    return { url, finalUrl, status: res.status, redirects };
  } catch (error) {
    return { url, error: errorText(error) };
  }
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
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (argv.includes('--help') || !targets.length) {
    console.error(USAGE);
    process.exit(targets.length || argv.includes('--help') ? 0 : 2);
  }
  const urls = targets.map((t) => new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).href);

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
    });
  }

  const pages = [];
  for (const url of urls) pages.push(await probePage(url, robotsByOrigin[new URL(url).origin], !pagesOnly));

  const sitemapUrls = new Set(sites.flatMap((s) => s.sitemap?.urls ?? []));
  for (const page of pages) page.inSitemap = pagesOnly ? null : sitemapUrls.has(page.url) || sitemapUrls.has(page.finalUrl);

  console.log(JSON.stringify({ probe: 'web-ready-audit', runtime: runtime(), fetchedAt: new Date().toISOString(), sites, pages }, null, 2));
}

await main(process.argv.slice(2));
