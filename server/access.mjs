import { createHash, timingSafeEqual } from 'node:crypto';
import { consumeQuota } from './database.mjs';
const hash = value => createHash('sha256').update(value).digest();
export const protectedMode = () => !!process.env.ORGANIZER_TOKEN || process.env.PUBLIC_DEMO === '1' || process.env.NODE_ENV === 'production';
export function canEdit(req) {
  if (!protectedMode()) return true;
  const token = process.env.ORGANIZER_TOKEN;
  if (!token || token.length < 32) return false;
  return timingSafeEqual(hash(req.get('authorization') ?? ''), hash(`Bearer ${token}`));
}
export function routeQuota(req, name, { minuteLimit, dayLimit } = {}) {
  const now = Date.now(), minute = Math.floor(now / 60000), day = Math.floor(now / 864e5);
  const address = hash(req.ip ?? 'unknown').toString('hex');
  const rules = [];
  if (minuteLimit) rules.push({ key: `route:${name}:${minute}:${address}`, limit: minuteLimit, expires: (minute + 1) * 60000 });
  if (dayLimit) rules.push({ key: `route:${name}:${day}`, limit: dayLimit, expires: (day + 1) * 864e5 });
  return consumeQuota(rules, now);
}
export function accessMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  res.set('Cache-Control', 'no-store');
  const ballot = /^\/api\/reviews\/[\w-]+\/ballot$/.test(req.path);
  const judgeExperiment = req.method === 'POST' && /^\/api\/judge\/cases\/[a-f0-9]{24}\/(experiment|autopilot)$/.test(req.path);
  const livePlan = req.method === 'POST' && req.path === '/api/plan';
  const privateRead = /^\/api\/(pipeline|campaign|studies|events)(\/|$)/.test(req.path) ||
    (req.path.startsWith('/api/experiments') && !/^\/api\/experiments\/public(?:\/|$)/.test(req.path));
  if ((req.method !== 'GET' && req.method !== 'HEAD' && !ballot && !judgeExperiment && !livePlan || privateRead) && !canEdit(req)) return res.status(401).json({ error: 'Organizer access is required. Shared reports are read-only.' });
  const now = Date.now(), minute = Math.floor(now / 60000), day = Math.floor(now / 864e5);
  const address = hash(req.ip ?? 'unknown').toString('hex');
  const paid = req.method === 'POST' && (/^\/api\/(memo$|intelligence\/|activation\/)/.test(req.path) || /^\/api\/gm\/[^/]+\/(run|benchmark|season-research)$/.test(req.path) || /^\/api\/judge\/cases\/[a-f0-9]{24}\/autopilot\/live$/.test(req.path) || /^\/api\/events\/[^/]+\/research$/.test(req.path));
  const rules = [{ key: `http:${minute}:${address}`, limit: 180, expires: (minute + 1) * 60000 }];
  // Anonymous plans have separate post-validation caps; they must not drain
  // the organizer's shared research allowance, even when rejected or invalid.
  if (paid) rules.push({ key: `research:${day}`, limit: 100, expires: (day + 1) * 864e5 }, { key: `research:${minute}:${address}`, limit: 6, expires: (minute + 1) * 60000 });
  if (!consumeQuota(rules, now)) return res.status(429).json({ error: 'Persistent request quota reached. Please try again later.' });
  next();
}
