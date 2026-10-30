// Who the booked bill reaches beyond music. Once the optimizer has picked the acts, three
// Qloo calls use those acts as the taste signal and ask what the same fans like in other
// domains: brands (sponsor leads), places in the city (venue, poster and aftershow leads) and
// podcasts (where to advertise). Qloo's explainability says how much each booked act drives
// each result, so every lead names the act behind it.
//
// This runs after the decision and never feeds back into it: the bill, its score and its
// digests are unchanged. Leads are cultural affinities, not partnerships, availability or
// audience size.
import { nameOf, idOf } from './shape.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 160) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const usable = env => ['ok', 'partial', 'degraded'].includes(env.status);
// Qloo's place categories for rooms that host live music.
const ROOM_TAGS = ['live_music_venue', 'concert_hall', 'auditorium', 'performing_arts_theater'].map(tag => `urn:tag:category:place:${tag}`);
const NOT_A_ROOM = /banquet|lawns?\b|karyalaya|wedding|marriage|dance|nritya|yoga|restaurant|hotel/i;
// Qloo's place results name their city but carry no coordinates, so a room counts as nearby when
// its city, metro or district appears in the name OpenStreetMap confirmed for the place.
const fold = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function roomIsNear(row, place, city) {
  const geocode = row?.properties?.geocode, known = fold(`${place?.name ?? ''} ${city}`);
  const primary = fold(String(place?.name ?? city).split(',')[0]).trim();
  if (primary && fold(row?.properties?.address).includes(primary)) return true;
  return [geocode?.city, geocode?.metro, geocode?.admin2_region].some(name => typeof name === 'string' && name.trim() && known.includes(fold(name).trim()));
}
export const REACH_DOMAINS = [
  { key: 'venue', type: 'place', label: 'Rooms to book', hint: 'Live music rooms these fans favour', args: city => ({ filter_location: city, include_tags: ROOM_TAGS, include_tags_operator: 'union' }), keep: row => !NOT_A_ROOM.test(nameOf(row) ?? ''), near: true, extra: 7 },
  { type: 'brand', label: 'Sponsor leads', hint: 'Brands these fans favour', args: city => ({ signal_location: city }) },
  { type: 'place', label: 'Places in the city', hint: 'Where these fans go', args: city => ({ filter_location: city }) },
  { type: 'podcast', label: 'Podcasts to advertise on', hint: 'What these fans listen to', args: city => ({ signal_location: city }) },
];
export const REACH_CALLS = REACH_DOMAINS.length;
export const REACH_LEADS = 5;
export const REACH_NOTE = 'Qloo cultural affinities of fans of the booked acts, fetched after the decision. They do not change the bill. Leads, not partnerships, availability or audience size.';

/** Each booked act's share of Qloo's explainability score for one result, or [] when Qloo
 * did not return one for every booked act. Shares sum to 1. */
export function driversOf(row, selectedIds) {
  const entries = Array.isArray(row?.explainability?.['signal.interests.entities']) ? row.explainability['signal.interests.entities'] : [];
  const scores = selectedIds.map(id => entries.find(entry => entry?.entity_id === id)?.score);
  if (!scores.length || scores.some(score => !finite(score) || score < 0)) return [];
  const total = scores.reduce((sum, score) => sum + score, 0);
  return total > 0 ? selectedIds.map((id, index) => ({ id, share: scores[index] / total })) : [];
}

/** Runs the three calls for the case's baseline bill. `run` is a bounded Qloo Run. */
export async function buildReach(snapshot, run, { place = null } = {}) {
  const slate = snapshot.memo.slate, city = snapshot.memo.input.city;
  if (!slate?.feasible || !slate.selectedIds.length) throw Object.assign(new Error('Only a plan with a bookable bill has an audience to map.'), { status: 409 });
  const selectedIds = [...slate.selectedIds], names = selectedIds.map(id => snapshot.memo.items.find(item => item.id === id)?.name ?? id);
  const groups = [];
  for (const domain of REACH_DOMAINS) {
    const { env, receipt } = await run.call('recommend', { target_type: domain.type, signals: selectedIds, limit: REACH_LEADS + (domain.extra ?? 3), ...domain.args(city) },
      `${domain.hint}: fans of ${names.join(' + ')} in ${city}`);
    const seen = new Set(), leads = [];
    let farAway = 0;
    if (usable(env)) for (const row of env.results) {
      const name = text(nameOf(row)), id = text(idOf(row), 80);
      if (!name || seen.has(name.toLowerCase()) || leads.length >= REACH_LEADS) continue;
      if (domain.keep && !domain.keep(row)) continue;
      // Qloo answers for any place name, so a room only counts when it is really nearby.
      if (domain.near && place?.status === 'found' && !roomIsNear(row, place, city)) { farAway++; continue; }
      seen.add(name.toLowerCase());
      const address = text(row?.properties?.address, 120), website = text(row?.properties?.website, 200);
      leads.push({ name, ...(id ? { id } : {}), ...(finite(row.affinity) ? { affinity: row.affinity } : {}),
        ...(finite(row.popularity) ? { popularity: row.popularity } : {}), ...(address ? { address } : {}), ...(domain.near && website.startsWith('http') ? { website } : {}), drivers: driversOf(row, selectedIds) });
    }
    groups.push({ type: domain.key ?? domain.type, label: domain.label, hint: domain.hint, receiptId: receipt.id, status: env.status, leads, ...(farAway ? { farAway } : {}) });
  }
  return { version: '1.0', rooms: 2, city, selectedIds, groups, note: REACH_NOTE, createdAt: new Date().toISOString(),
    mock: run.mode === 'mock', providerCalls: run.receipts.filter(r => r.source === 'qloo' && !r.cached).length,
    receipts: run.receipts.map(r => ({ id: r.id, tool: r.tool, args: r.args, status: r.status, count: r.count, cached: r.cached, source: r.source,
      fetchedAt: r.fetchedAt, digest: r.digest, evidence: r.evidence })) };
}
