import { distanceKm } from './intelligence.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const boundedList = (value, max) => [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))].slice(0, max);
const fold = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function selectedArtists(snapshot) {
  const ids = new Set(snapshot?.memo?.slate?.selectedIds || []);
  return (snapshot?.memo?.items || []).filter(item => ids.has(item.id));
}

export function normalizeActivationInput(snapshot, raw = {}) {
  if (!snapshot?.intelligence?.route?.feasible) throw new Error('A saved feasible intelligence route is required before local activation.');
  const artists = selectedArtists(snapshot);
  if (!artists.length) throw new Error('A selected slate is required before local activation.');
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const headlinerId = String(value.headlinerId || artists[0].id);
  if (!artists.some(item => item.id === headlinerId)) throw new Error('headlinerId must reference a selected artist.');
  const stopNames = snapshot.intelligence.route.stops.map(stop => stop.name);
  const marketNames = boundedList(value.marketNames ?? stopNames, 5);
  if (!marketNames.length || marketNames.some(name => !stopNames.includes(name))) throw new Error('marketNames must contain routed markets only.');
  const maxOpeners = Number(value.maxOpeners ?? 3);
  if (!Number.isInteger(maxOpeners) || maxOpeners < 1 || maxOpeners > 5) throw new Error('maxOpeners must be an integer from 1 to 5.');
  return {
    headlinerId, marketNames, maxOpeners,
    posterTags: boundedList(value.posterTags ?? ['record store', 'bookshop', 'cafe'], 6),
    aftershowTags: boundedList(value.aftershowTags ?? ['bar'], 4),
    rules: { hotspotRadiusKm: 2.5, rejectNameOverlap: true, requireSmallerPopularity: true }
  };
}

export function activationWorkflowCount(snapshot, raw) {
  const input = normalizeActivationInput(snapshot, raw);
  return 1 + input.marketNames.length * (4 + input.maxOpeners);
}

function strongestTile(rows) {
  const tiles = rows.filter(row => finite(row.lat) && finite(row.lon));
  return tiles.sort((a, b) => ((b.affinity ?? 0) * (b.popularity ?? 1)) - ((a.affinity ?? 0) * (a.popularity ?? 1)) ||
    (b.affinityRank ?? 0) - (a.affinityRank ?? 0))[0] || null;
}

function sharedNames(receipt) {
  return [...new Set(receipt?.evidence?.sharedNames || [])].slice(0, 12);
}

function pointOf(row) {
  return finite(row?.lat) && finite(row?.lon) ? { lat: row.lat, lon: row.lon } : null;
}

function placePlan(rows, hotspot, radiusKm) {
  return rows.map(row => {
    const point = pointOf(row);
    const fromHotspotKm = point && hotspot ? distanceKm(point, hotspot) : null;
    return {
      ...row, fromHotspotKm,
      proximityStatus: finite(fromHotspotKm) ? fromHotspotKm <= radiusKm ? 'within_hotspot_radius' : 'outside_hotspot_radius' : 'coordinates_unavailable'
    };
  }).sort((a, b) => {
    const ad = finite(a.fromHotspotKm) ? a.fromHotspotKm : Infinity;
    const bd = finite(b.fromHotspotKm) ? b.fromHotspotKm : Infinity;
    return ad - bd || String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function venueDistance(snapshot, market, hotspot) {
  const venue = snapshot.venuePlan?.stops?.find(stop => stop.market === market)?.selectedVenue;
  const point = pointOf(venue);
  return {
    venue: venue ? { id: venue.venueId, name: venue.venueName } : null,
    fromHotspotKm: point && hotspot ? distanceKm(point, hotspot) : null,
    status: !venue ? 'venue_not_qualified' : point && hotspot ? 'measured' : 'coordinates_unavailable'
  };
}

export async function buildLocalActivation(snapshot, raw, run) {
  const input = normalizeActivationInput(snapshot, raw);
  const artists = selectedArtists(snapshot), headliner = artists.find(item => item.id === input.headlinerId);
  const describe = await run.call('describe', { entity: headliner.id, type: 'artist' }, `Read public Qloo context for headliner ${headliner.name}`);
  const headlinerPopularity = describe.receipt.evidence?.rows?.find(row => row.id === headliner.id)?.popularity ??
    describe.receipt.evidence?.rows?.[0]?.popularity ?? null;
  const markets = [];
  for (const marketName of input.marketNames) {
    const routeStop = snapshot.intelligence.route.stops.find(stop => stop.name === marketName);
    const heat = await run.call('where_popular', { entity: headliner.id, entity_type: 'artist', within: marketName, limit: 20 },
      `Locate comparatively strong ${headliner.name} audience tiles inside ${marketName}`);
    const hotspot = strongestTile(heat.receipt.evidence?.rows || []);
    const openerDiscovery = await run.call('recommend', { target_type: 'artist', signals: [headliner.id], signal_location: marketName, limit: 10 },
      `Discover possible local-support artists around ${marketName}`);
    const candidates = [];
    for (const row of (openerDiscovery.receipt.evidence?.rows || []).slice(0, input.maxOpeners)) {
      const overlap = fold(row.name).includes(fold(headliner.name)) || fold(headliner.name).includes(fold(row.name));
      const sameEntity = row.id === headliner.id;
      const popularityComparable = finite(row.popularity) && finite(headlinerPopularity);
      const smallerPopularity = popularityComparable ? row.popularity < headlinerPopularity : null;
      const comparison = row.id && !sameEntity && !overlap
        ? await run.call('compare_audiences', { group_a: [headliner.id], group_b: [row.id], target_type: 'artist', limit: 10 },
          `Compare aggregate audience themes for ${headliner.name} and possible opener ${row.name}`)
        : null;
      const exclusions = [sameEntity ? 'same_entity' : null, overlap ? 'name_overlap' : null,
        popularityComparable && !smallerPopularity ? 'not_smaller_on_returned_popularity' : null].filter(Boolean);
      candidates.push({
        id: row.id || null, name: row.name || 'Unnamed result', popularity: finite(row.popularity) ? row.popularity : null,
        headlinerPopularity: finite(headlinerPopularity) ? headlinerPopularity : null,
        smallerPopularity, status: exclusions.length ? 'excluded' : smallerPopularity === true ? 'eligible_for_human_review' : 'size_evidence_required',
        exclusions, sharedThemes: comparison ? sharedNames(comparison.receipt) : [],
        receipts: [openerDiscovery.receipt.id, ...(comparison ? [comparison.receipt.id] : [])]
      });
    }
    const posterCall = await run.call('recommend', {
      target_type: 'place', signals: [headliner.id], filter_location: marketName,
      ...(input.posterTags.length ? { include_tags: input.posterTags, include_tags_operator: 'union' } : {}), limit: 10
    }, `Find poster-distribution place leads in ${marketName}`);
    const aftershowCall = await run.call('recommend', {
      target_type: 'place', signals: [headliner.id], filter_location: marketName,
      ...(input.aftershowTags.length ? { include_tags: input.aftershowTags, include_tags_operator: 'union' } : {}), limit: 10
    }, `Find aftershow place leads in ${marketName}`);
    const posterStops = placePlan(posterCall.receipt.evidence?.rows || [], hotspot, input.rules.hotspotRadiusKm);
    const aftershowLeads = placePlan(aftershowCall.receipt.evidence?.rows || [], hotspot, input.rules.hotspotRadiusKm);
    markets.push({
      market: marketName, showDate: routeStop.showDate,
      hotspot: hotspot ? { lat: hotspot.lat, lon: hotspot.lon, affinity: hotspot.affinity ?? null, popularity: hotspot.popularity ?? null,
        basis: 'Strongest returned tile by affinity × popularity within this single market response.' } : null,
      heatmapReceiptId: heat.receipt.id, headlinerToVenue: venueDistance(snapshot, marketName, hotspot),
      openerDiscovery: { candidates, receiptId: openerDiscovery.receipt.id,
        eligibleCount: candidates.filter(candidate => candidate.status === 'eligible_for_human_review').length,
        evidenceRequiredCount: candidates.filter(candidate => candidate.status === 'size_evidence_required').length },
      posterRun: { tags: input.posterTags, leads: posterStops, receiptId: posterCall.receipt.id,
        confirmedWithinRadius: posterStops.filter(place => place.proximityStatus === 'within_hotspot_radius').length },
      aftershow: { tags: input.aftershowTags, leads: aftershowLeads, receiptId: aftershowCall.receipt.id,
        confirmedWithinRadius: aftershowLeads.filter(place => place.proximityStatus === 'within_hotspot_radius').length }
    });
  }
  return {
    version: '1.0', generatedAt: new Date().toISOString(), sourceId: snapshot.id, input,
    headliner: { id: headliner.id, name: headliner.name, popularity: finite(headlinerPopularity) ? headlinerPopularity : null, receiptId: describe.receipt.id },
    markets, receipts: run.receipts,
    summary: {
      marketCount: markets.length,
      openerCandidates: markets.reduce((sum, market) => sum + market.openerDiscovery.candidates.length, 0),
      openerCandidatesPassingSizeRule: markets.reduce((sum, market) => sum + market.openerDiscovery.eligibleCount, 0),
      posterLeadsWithinRadius: markets.reduce((sum, market) => sum + market.posterRun.confirmedWithinRadius, 0),
      aftershowLeadsWithinRadius: markets.reduce((sum, market) => sum + market.aftershow.confirmedWithinRadius, 0)
    },
    limitations: [
      'Heatmap values are interpreted only inside the response that returned them; values from separate market responses are never ranked against one another.',
      'An opener passes the size rule only when both returned popularity values exist and the candidate value is lower. Missing popularity remains a required human check.',
      'Place recommendations are cultural leads, not proof of permission to poster, business hours, capacity, availability or an event agreement.',
      'The 2.5 km rule is applied only when both Qloo result coordinates and the hotspot coordinates are present; missing coordinates are never treated as nearby.'
    ]
  };
}
