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
    lang: attrs(clean.match(/<html\b([^>]*)>/i)?.[1] ?? '').lang ?? null,
    titles: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map((m) => decodeEntities(m[1]).replace(/\s+/g, ' ').trim()),
    descriptions: metaNamed('description').map((t) => t.content ?? ''),
    canonicals: links.filter((t) => rels(t).includes('canonical')).map((t) => ({ href: t.href ?? '', resolved: resolve(t.href ?? '', base) })),
    metaRobots: metaNamed('robots', 'googlebot', 'bingbot').map((t) => ({ name: t.name.toLowerCase(), content: t.content ?? '' })),
    viewport: metaNamed('viewport').map((t) => t.content ?? ''),
    hreflang: links.filter((t) => rels(t).includes('alternate') && t.hreflang).map((t) => ({ hreflang: t.hreflang, href: resolve(t.href ?? '', base) })),
    verification,
    bodyTextLength: text.length,
    emptyMount: mount ? mount[1] : null,
    internalLinks: { count: internal.size, urls: [...internal].slice(0, MAX_LINKS) },
  };
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

// Google's matching: the agent's own groups, else the * groups; longest rule wins, allow wins a tie.
function robotsVerdict(groups, agent, path) {
  const token = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(token));
  const matched = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const rule of matched.flatMap((g) => g.rules)) {
    if (!rule.path || !ruleRegex(rule.path).test(path)) continue;
    const longer = !best || rule.path.length > best.path.length;
    if (longer || (rule.path.length === best.path.length && rule.type === 'allow')) best = rule;
  }
  return {
    group: own.length ? agent : matched.length ? '*' : null,
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

async function probePage(url, robots) {
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
  for (const url of urls) pages.push(await probePage(url, robotsByOrigin[new URL(url).origin]));

  const sitemapUrls = new Set(sites.flatMap((s) => s.sitemap?.urls ?? []));
  for (const page of pages) page.inSitemap = pagesOnly ? null : sitemapUrls.has(page.url) || sitemapUrls.has(page.finalUrl);

  console.log(JSON.stringify({ probe: 'web-ready-audit', runtime: runtime(), fetchedAt: new Date().toISOString(), sites, pages }, null, 2));
}

await main(process.argv.slice(2));
