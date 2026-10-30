// Does the act still exist? Qloo matches taste, not careers: fans of Nirvana get Soundgarden
// (ended 2017) and fans of Joy Division get Talking Heads (ended 1991), both priced and bookable.
// Before an act enters a live plan's pool it is looked up on MusicBrainz, and one listed as
// ended never reaches the bill.
//
// Only an exact, unambiguous name match can remove an act. Several artists share a name, so
// when the exact matches disagree the act stays in the pool as unknown. A failed lookup is
// 'unavailable', never 'ended': an outage must not remove a real act. Only the artist name
// leaves the server. MusicBrainz asks for at most one request a second and an identifying
// User-Agent, so lookups run one at a time and answers are remembered.
const ENDPOINT = 'https://musicbrainz.org/ws/2/artist';
const AGENT = 'Houselights/1.2 (+https://houselights.80-225-218-239.sslip.io)';
const SPACING_MS = 1100, TIMEOUT_MS = 3500, CACHE_MAX = 2000, MIN_SCORE = 90;
export const ACT_SOURCE = 'MusicBrainz';
export const ACT_DEADLINE_MS = 9000;
const cache = new Map();
let queue = Promise.resolve(), lastAt = 0;
const low = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function exactMatches(rows, name) {
  const target = low(name);
  return rows.filter(row => (row?.score ?? 0) >= MIN_SCORE && (low(row.name) === target || (row.aliases ?? []).some(alias => low(alias?.name) === target)));
}

/** { status: 'active' | 'ended' | 'unknown', ... } from MusicBrainz rows for a name. */
export function readAct(rows, name) {
  const matches = exactMatches(Array.isArray(rows) ? rows : [], name);
  if (!matches.length) return { status: 'unknown' };
  const ended = matches.filter(row => row['life-span']?.ended === true);
  if (ended.length && ended.length < matches.length) return { status: 'unknown', ambiguous: true };
  const best = matches[0], from = best.country ?? best.area?.name ?? null;
  return ended.length
    ? { status: 'ended', endedYear: Number(String(best['life-span']?.end ?? '').slice(0, 4)) || null, from }
    : { status: 'active', from };
}

async function ask(name, fetcher) {
  const wait = lastAt + SPACING_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastAt = Date.now();
  const query = `artist:"${name.replace(/["\\]/g, ' ')}"`;
  const response = await fetcher(`${ENDPOINT}?${new URLSearchParams({ query, fmt: 'json', limit: '5' })}`,
    { headers: { 'user-agent': AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Artist lookup returned ${response.status}.`);
  const body = await response.json();
  if (!Array.isArray(body?.artists)) throw new Error('Unexpected artist response.');
  return body.artists;
}

export function checkAct(name, { fetcher = fetch } = {}) {
  const key = low(name);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const result = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    try {
      const act = readAct(await ask(name, fetcher), name);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, act);
      return act;
    } catch { return { status: 'unavailable' }; }
  });
  queue = result.catch(() => {});
  return result;
}

/** Checks names in order within the deadline; anything not reached is 'unavailable'. */
export async function checkActs(names, { fetcher = fetch, deadlineMs = ACT_DEADLINE_MS } = {}) {
  const results = new Map(), stopAt = Date.now() + deadlineMs;
  for (const name of names) {
    const known = cache.get(low(name));
    results.set(name, known ?? (Date.now() < stopAt ? await checkAct(name, { fetcher }) : { status: 'unavailable' }));
  }
  return results;
}

/** What a plan may say about its acts. */
export function summarizeActs(results, removed) {
  const statuses = [...results.values()].map(act => act.status);
  return { source: ACT_SOURCE, checked: statuses.filter(status => status !== 'unavailable').length, total: statuses.length,
    active: statuses.filter(status => status === 'active').length,
    removed: removed.map(({ name, endedYear }) => ({ name, endedYear: endedYear ?? null })) };
}
