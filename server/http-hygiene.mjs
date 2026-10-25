// Request IDs, one JSON error shape, Retry-After on rate limits, structured access logs,
// and a short server-side cache for public judge reads. The cache saves CPU on the
// 0.5-CPU host; responses still carry Cache-Control: no-store, so browsers and proxies
// always revalidate and updated cases appear at once.
import { randomUUID } from 'node:crypto';

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
