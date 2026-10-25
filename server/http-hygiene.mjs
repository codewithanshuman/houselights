// Request IDs, one JSON error shape, Retry-After on rate limits, structured access logs,
// and a short server-side cache for public judge reads. The cache saves CPU on the
// 0.5-CPU host; responses still carry Cache-Control: no-store, so browsers and proxies
// always revalidate and updated cases appear at once.
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, statfsSync } from 'node:fs';
import { join as joinPath, normalize, sep } from 'node:path';
import { withSiteNav } from './site-chrome.mjs';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;
export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  const started = process.hrtime.bigint(), json = res.json.bind(res);
  res.json = body => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
      if (typeof body.error !== 'string') body = { error: 'The request could not be completed.', ...body };
      if (!body.requestId) body = { ...body, requestId: req.id };
    }
    // Every rate limit says when to retry: quotas here reset at the next UTC minute.
    if (res.statusCode === 429 && !res.get('Retry-After')) res.set('Retry-After', String(Math.max(1, 60 - new Date().getUTCSeconds())));
    return json(body);
  };
  res.on('finish', () => {
    if (!req.path.startsWith('/api/') || process.env.ACCESS_LOG === 'off') return;
    // One structured line per API request: no query strings, bodies or credentials.
    console.log(JSON.stringify({ t: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', requestId: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Number((process.hrtime.bigint() - started) / 1000000n) }));
  });
  next();
}

// Short-lived cache of public judge reads, cleared by any write under /api/judge.
const PUBLIC_READ = /^\/api\/(judge\/cases(\/[a-f0-9]{24})?|experiments\/public(\/[a-f0-9]{24})?|evidence\/reviews)$/;
const cache = new Map(), TTL_MS = 30000, MAX_ENTRIES = 200;
export function clearPublicReadCache() { cache.clear(); }
export function publicReadCache(req, res, next) {
  if (req.method !== 'GET') {
    if (req.path.startsWith('/api/judge') || req.path.startsWith('/api/experiments') || req.path.startsWith('/api/reviews') || req.path.startsWith('/api/studies')) res.on('finish', () => { if (res.statusCode < 400) cache.clear(); });
    return next();
  }
  if (!PUBLIC_READ.test(req.path) || req.get('authorization')) return next();
  const hit = cache.get(req.path);
  if (hit && hit.expires > Date.now()) { res.set('X-Cache', 'hit'); return res.status(200).json(hit.body); }
  const json = res.json.bind(res);
  res.json = body => {
    if (res.statusCode === 200) {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(req.path, { body, expires: Date.now() + TTL_MS });
      res.set('X-Cache', 'miss');
    }
    return json(body);
  };
  next();
}

// Unknown API routes answer in the same JSON shape instead of falling through to HTML.
export function unknownApiRoute(req, res) {
  res.status(404).json({ error: `Unknown API route: ${req.method} ${req.path}` });
}

// Static assets with safe long-term caching. HTML pages are served with every local
// script and stylesheet URL stamped ?v=<release>, so those assets can be immutable:
// a new release changes the URL. The shared navigation is rendered in at the same time.
// HTML and unstamped CSS/JS always revalidate (ETag);
// fonts and images, whose names change when their content does, are cached for a week.
const htmlCache = new Map();
export function staticAssets(root, express) {
  const release = (process.env.RELEASE_COMMIT || `dev-${Date.now().toString(36)}`).slice(0, 12);
  const stamp = html => html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\/[\w./-]+\.(?:js|css))(")/g, `$1$2?v=${release}$3`);
  const pages = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const path = req.path === '/' ? '/index.html' : req.path;
    if (!path.endsWith('.html')) return next();
    const file = normalize(joinPath(root, path));
    if (!file.startsWith(normalize(root) + sep)) return next();
    const body = render(file);
    if (body === null) return next();
    res.set('Cache-Control', 'no-cache').type('html').send(body);
  };
  // Stamped asset URLs and the server-rendered navigation, cached until the file changes.
  function render(file) {
    let mtime; try { mtime = statSync(file).mtimeMs; } catch { return null; }
    let entry = htmlCache.get(file);
    if (!entry || entry.mtime !== mtime) { entry = { mtime, body: withSiteNav(stamp(readFileSync(file, 'utf8'))) }; htmlCache.set(file, entry); }
    return entry.body;
  }
  pages.render = name => render(joinPath(root, name));
  const files = express.static(root, { cacheControl: false, setHeaders(res, path) {
    const versioned = res.req?.query?.v === release;
    if (/\.(js|css)$/.test(path)) res.set('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
    else if (/\.(woff2|webp|png|jpg|svg|ico|gif)$/.test(path)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'no-cache');
  } });
  return [pages, files];
}

// Disk headroom for the uptime monitor: false when the data volume has under 10% or 1 GB
// free (a full disk stops SQLite writes and backups). Only the boolean is published.
export function diskOk(path) {
  try {
    const { bavail, blocks, bsize } = statfsSync(path);
    return bavail / blocks >= 0.10 && bavail * bsize >= 1024 ** 3;
  } catch { return null; }
}
