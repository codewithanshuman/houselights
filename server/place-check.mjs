// Is the typed place real, and does Qloo's location data land near it? Qloo resolves a location
// string on its own and always answers, even for a place it cannot have data for: "Tiny Village
// Nowhere" returned ten tiles, and Akole, Maharashtra returned tiles 94–320 km away. So the place
// is confirmed on OpenStreetMap first, and each tile Qloo returns is measured against it. A tile
// that is not near the place cannot support a claim about local fans there.
//
// Only the typed place name leaves the server. Nominatim asks for at most one request a second
// and an identifying User-Agent, so lookups run one at a time and results are remembered.
export const NEAR_KM = 75;
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const AGENT = 'Houselights/1.2 (+https://houselights.80-225-218-239.sslip.io)';
const SPACING_MS = 1100, TIMEOUT_MS = 6000, CACHE_MAX = 500;
const cache = new Map();
let queue = Promise.resolve(), lastAt = 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function ask(query, fetcher) {
  const wait = lastAt + SPACING_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastAt = Date.now();
  const response = await fetcher(`${ENDPOINT}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '0' })}`,
    { headers: { 'user-agent': AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Map lookup returned ${response.status}.`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected map response.');
  return rows;
}

/** { status: 'found', name, lat, lon } | { status: 'not-found' } | { status: 'unavailable' }.
 * A failed lookup is 'unavailable', never 'not-found': a map outage must not reject a real place. */
export function locatePlace(query, { fetcher = fetch } = {}) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const result = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    try {
      const row = (await ask(query, fetcher))[0];
      const lat = Number(row?.lat), lon = Number(row?.lon);
      const place = row && finite(lat) && finite(lon)
        ? { status: 'found', name: String(row.display_name ?? query).split(',').slice(0, 3).map(part => part.trim()).join(', ').slice(0, 120), lat, lon }
        : { status: 'not-found' };
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, place);
      return place;
    } catch { return { status: 'unavailable' }; }
  });
  queue = result.catch(() => {});
  return result;
}

const tilesOf = rows => (Array.isArray(rows) ? rows : []).filter(row => finite(row?.lat) && finite(row?.lon));
/** True when at least one Qloo tile lies within NEAR_KM of the place. */
export const nearPlace = (place, rows) => tilesOf(rows).some(row => distanceKm(place.lat, place.lon, row.lat, row.lon) <= NEAR_KM);

/** What a plan may say about its location, from every where_popular receipt in the run. */
export function summarizePlace(place, receipts) {
  if (place.status !== 'found') return { status: place.status, source: 'OpenStreetMap' };
  const distances = receipts.filter(receipt => receipt.tool === 'where_popular')
    .flatMap(receipt => tilesOf(receipt.evidence?.rows)).map(row => distanceKm(place.lat, place.lon, row.lat, row.lon)).sort((a, b) => a - b);
  const base = { name: place.name, source: 'OpenStreetMap', nearKm: NEAR_KM };
  if (!distances.length) return { ...base, status: 'unmeasured' };
  const within = distances.filter(km => km <= NEAR_KM).length;
  return { ...base, status: within / distances.length >= 0.5 ? 'this-place' : within ? 'partly' : 'elsewhere',
    tiles: distances.length, within, nearestKm: Math.round(distances[0]), medianKm: Math.round(distances[Math.floor(distances.length / 2)]) };
}
