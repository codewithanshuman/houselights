import { compareMarkets, DNA_KINDS, DNA_DEPTH } from './theme-night/market-dna.mjs';
import { computeScore, SCORE_WEIGHTS } from './theme-night/scoring.mjs';
import { optimizeSlate } from './optimizer.mjs';
import { distanceKm } from './intelligence.mjs';
import { idOf, nameOf, compactEvidence, comparisonThemes } from './shape.mjs';

const usable = receipt => ['ok', 'partial', 'degraded'].includes(receipt.status);
const finite = Number.isFinite;
const round = n => Math.round(n * 1000) / 1000;
const uniq = list => [...new Set(list)];
const demographicQuery = { '24_and_younger': '0-24', '25_to_29': '25-29', '30_to_34': '30-34', '35_to_44': '35-44', '45_to_54': '45-54', '55_and_older': 'over 55' };
export function normalizeFestivalResearch(snapshot, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Research options must be an object.');
  const items = snapshot.memo?.items;
  if (!items?.length || items.length > 10) throw new Error('Research needs a saved pool of 1–10 artists.');
  const markets = raw.markets ?? [snapshot.memo.input?.city ?? snapshot.input?.city];
  if (!Array.isArray(markets) || markets.length < 1 || markets.length > 4 || markets.some(city => typeof city !== 'string' || !city.trim() || city.length > 100)) throw new Error('Provide 1–4 city names.');
  if (new Set(markets.map(city => city.trim().toLowerCase())).size !== markets.length) throw new Error('City names must be unique.');
  const cities = markets.map(city => city.trim());
  const city = raw.city ?? cities[0];
  if (!cities.includes(city)) throw new Error('The decision city must be one of the researched markets.');
  const demographic = raw.demographic ?? null;
  if (demographic !== null && !['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older'].includes(demographic)) throw new Error('Choose a supported Qloo age bucket or omit demographic.');
  const existingFanIds = raw.existingFanIds ?? [];
  if (!Array.isArray(existingFanIds) || existingFanIds.length > 3 || existingFanIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 180)) throw new Error('Existing fan proxies must be 0–3 entity IDs.');
  const venue = raw.venue ?? null;
  if (venue && (!finite(venue.lat) || Math.abs(venue.lat) > 90 || !finite(venue.lon) || Math.abs(venue.lon) > 180)) throw new Error('Venue requires valid numeric lat/lon.');
  const constraints = { ...snapshot.memo.constraints, festivalPolicy: true };
  const validation = optimizeSlate(items, constraints);
  if (validation.status === 'invalid') throw new Error(validation.reasons.join(' '));
  return { markets: cities, city, demographic, existingFanIds: uniq(existingFanIds), venue,
    includeExperience: raw.includeExperience !== false, constraints: validation.constraints };
}

export function festivalWorkflowCount(snapshot, input) {
  const count = snapshot.memo.items.filter(item => item.terms?.available === true && Number.isFinite(item.terms?.fee) && !input.constraints.excludedIds.includes(item.id)).length;
  return input.markets.length * (DNA_KINDS.length + 2) + snapshot.memo.items.length * 2 + Math.ceil(snapshot.memo.items.length / 5)
    + (input.existingFanIds.length ? 1 : 0) + count * (count - 1) / 2 + (input.includeExperience ? 4 : 0) + 3;
}

// Every city ranks the exact same pool. A partial list is inspectable but is not
// comparable to a full-pool list: never inflate its first result to perfect fit.
export function rankPool(call, items) {
  const byId = new Map(items.map(item => [item.id, item]));
  const order = usable(call.receipt) ? uniq(call.env.results.map(idOf).filter(id => byId.has(id))) : [];
  const complete = order.length === items.length;
  return { complete, returned: order.length, requested: items.length, receiptId: call.receipt.id, status: call.receipt.status,
    rows: items.map(item => { const position = order.indexOf(item.id); return {
      id: item.id, name: item.name, rank: position < 0 ? null : position + 1,
      utility: complete && position >= 0 ? items.length > 1 ? round(1 - position / (items.length - 1)) : .5 : null,
      receiptId: call.receipt.id,
    }; }) };
}

export function scoreWithUncertainty(measurements = {}) {
  const valid = Object.fromEntries(Object.keys(SCORE_WEIGHTS).filter(key => finite(measurements[key]) && measurements[key] >= 0 && measurements[key] <= 1).map(key => [key, measurements[key]]));
  const score = computeScore({ entity: {}, segment: 'audience', localAffinity: valid.localAffinity,
    segmentFit: { audience: valid.segmentFit }, profile: { heat: { nearVenueIndex: valid.nearVenue } } });
  // Preserve the source's exact five weights and neutral imputation while allowing
  // independently measured components through a single validated interface.
  let observed = 0, missingWeight = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    score[key] = valid[key] ?? .5;
    if (valid[key] === undefined) missingWeight += weight; else observed += valid[key] * weight;
  }
  score.estimated = Object.keys(SCORE_WEIGHTS).filter(key => valid[key] === undefined);
  score.total = Math.round(100 * (observed + .5 * missingWeight));
  return { ...score, weights: SCORE_WEIGHTS, measuredWeight: round(1 - missingWeight),
    uncertaintyBounds: { lower: round(100 * observed), upper: round(100 * (observed + missingWeight)) },
    interpretation: 'Policy score with neutral 0.5 for missing components. Bounds vary missing inputs from 0 to 1; they are not statistical confidence intervals or ticket-demand predictions.' };
}

function trendMeasurement(env, id) {
  const points = env.results.find(row => idOf(row) === id)?.points;
  if (!Array.isArray(points)) return null;
  const clean = points.filter(point => typeof point.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && finite(point.population_percentile))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length < 3 || new Set(clean.map(point => point.date)).size !== clean.length) return null;
  const n = Math.max(1, Math.floor(clean.length / 3));
  const mean = rows => rows.reduce((sum, row) => sum + row.population_percentile, 0) / rows.length;
  const early = mean(clean.slice(0, n)), late = mean(clean.slice(-n));
  if (early <= 0) return null;
  const changePct = round(Math.max(-100, Math.min(300, (late - early) / early * 100)));
  return { changePct, utility: Math.max(0, Math.min(1, .5 + changePct / 40)),
    direction: changePct > 6 ? 'rising' : changePct < -6 ? 'cooling' : 'flat',
    points: clean.map(({ date, population_percentile }) => ({ date, population_percentile })) };
}

function catchmentMeasurement(call, venue) {
  if (!venue || !usable(call.receipt)) return null;
  const points = compactEvidence('where_popular', call.env).rows.filter(row => finite(row.lat) && finite(row.lon) && finite(row.affinity));
  // Harness results are capped; don't present a top-cell sample as all metro cells.
  if (points.length < 10 || points.length >= 20 || points.length !== call.env.result_count) return null;
  const near = point => distanceKm(point, venue) <= 16;
  const nearCount = points.filter(near).length;
  const hot = [...points].sort((a, b) => b.affinity - a.affinity).slice(0, Math.max(1, Math.round(points.length * .2)));
  const ratio = nearCount ? hot.filter(near).length / hot.length / (nearCount / points.length) : 0;
  return { utility: round(ratio / (1 + ratio)), catchmentKm: 16, cellCount: points.length,
    basis: 'Relative hotspot concentration among returned cells; provider completeness is unverified.' };
}

export async function buildFestivalResearch(snapshot, input, run) {
  const items = snapshot.memo.items, ids = items.map(item => item.id);
  const anchors = snapshot.memo.input?.anchorIds ?? snapshot.memo.input?.anchors ?? snapshot.input?.anchors ?? [];
  if (!anchors.length) throw new Error('Saved festival brief has no audience anchors.');
  const markets = [];
  for (const city of input.markets) {
    run.emit({ type: 'stage', text: `Market DNA · ${city}` });
    const domains = [], unavailable = [];
    for (const kind of DNA_KINDS) {
      const call = await run.call('recommend', { target_type: kind, signal_location: city, limit: Math.min(20, DNA_DEPTH) }, `Scan ${kind} taste in ${city}; compare membership and rank only`);
      const entities = usable(call.receipt) ? call.receipt.evidence.rows.filter(row => row.id && row.name).map((row, i) => ({ ...row, kind, localRank: i + 1 })) : [];
      if (entities.length) domains.push({ kind, entities, evidence: call.receipt.id, status: call.receipt.status });
      else unavailable.push({ kind, status: call.receipt.status, receiptId: call.receipt.id });
    }
    const local = rankPool(await run.call('rank', { options: ids, option_type: 'artist', signal_location: city }, `Rank the identical ${ids.length}-artist pool by ${city} taste`), items);
    const audience = rankPool(await run.call('rank', { options: ids, option_type: 'artist', signals: anchors, signal_location: city,
      ...(input.demographic ? { demographic: demographicQuery[input.demographic] } : {}) }, `Rank the identical artist pool for the festival audience in ${city}`), items);
    markets.push({ city, domains, unavailable, local, audience });
  }
  const overlap = [];
  for (let i = 0; i < markets.length; i++) for (let j = i + 1; j < markets.length; j++) {
    overlap.push({ a: markets[i].city, b: markets[j].city, domains: compareMarkets(markets[i], markets[j]) });
  }
  const primary = markets.find(market => market.city === input.city);
  const adaptiveResearch = [];
  for (const kind of ['audience', 'local']) {
    if (primary[kind].complete || !['partial', 'empty', 'degraded'].includes(primary[kind].status) || run.used >= run.budget) continue;
    const previous = primary[kind];
    const retry = await run.call('rank', { options: ids, option_type: 'artist', signal_location: input.city,
      ...(kind === 'audience' ? { signals: anchors, ...(input.demographic ? { demographic: demographicQuery[input.demographic] } : {}) } : {}) },
    `Adaptive evidence repair: ${kind} ranked ${previous.returned}/${previous.requested} artists; retry the same pool without cached partial data`, { refresh: true });
    const repaired = rankPool(retry, items);
    primary[kind] = repaired.complete || repaired.returned >= previous.returned ? repaired : previous;
    adaptiveResearch.push({ question: `Incomplete ${kind} rank`, previousReceiptId: previous.receiptId, receiptId: retry.receipt.id, resolved: repaired.complete,
      decision: repaired.complete ? 'Use refreshed full-pool evidence' : 'Retain uncertainty; do not invent ranks' });
  }
  const fanRank = input.existingFanIds.length ? rankPool(await run.call('rank', { options: ids, option_type: 'artist', signals: input.existingFanIds, signal_location: input.city }, 'Existing-fan proxy taste; inverse rank is a novelty heuristic, not new ticket buyers'), items) : null;
  const end = new Date(), start = new Date(end.getTime() - 16 * 7 * 864e5);
  const trendCalls = new Map();
  for (let offset = 0; offset < ids.length; offset += 5) {
    const batch = ids.slice(offset, offset + 5);
    const call = await run.call('trends', { entities: batch, entity_type: 'artist', start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }, 'Inspect 16-week percentile trends in a supported batch; unsupported point shapes remain missing');
    batch.forEach(id => trendCalls.set(id, call));
  }
  const profiles = [], researched = [];
  for (const item of items) {
    const trendCall = trendCalls.get(item.id);
    const demo = await run.call('audience_demographics', { entity: item.id, entity_type: 'artist', limit: 12 }, `Available aggregate demographic evidence for ${item.name}`);
    const heat = await run.call('where_popular', { entity: item.id, entity_type: 'artist', within: input.city, limit: 20 }, `Geographic context for ${item.name} in ${input.city}`);
    const trend = usable(trendCall.receipt) ? trendMeasurement(trendCall.env, item.id) : null;
    const catchment = catchmentMeasurement(heat, input.venue);
    const local = primary.local.rows.find(row => row.id === item.id), audience = primary.audience.rows.find(row => row.id === item.id);
    const fan = fanRank?.rows.find(row => row.id === item.id);
    const receipts = uniq([local.receiptId, audience.receiptId, demo.receipt.id, heat.receipt.id, trendCall.receipt.id, ...(fanRank ? [fanRank.receiptId] : [])]);
    const tasteFit = scoreWithUncertainty({ localAffinity: local.utility, segmentFit: audience.utility, nearVenue: catchment?.utility,
      momentum: trend?.utility, newFanReach: fan?.utility == null ? undefined : 1 - fan.utility * .8 });
    profiles.push({ id: item.id, name: item.name, tasteFit, local, audience, trend, catchment,
      demographics: { status: demo.receipt.status, rows: demo.receipt.evidence.rows, receiptId: demo.receipt.id },
      fanProxy: fanRank ? { ...fan, proxyIds: input.existingFanIds, interpretation: 'Inverse proxy rank; does not measure audience overlap or acquisition.' } : null, receipts });
    const rankSupported = audience.utility !== null;
    const localSupported = usable(heat.receipt) && heat.env.result_count > 0;
    const claims = [{ id: `${item.id}:festival-fit`, text: rankSupported
      ? `${item.name} ranks ${audience.rank} of ${items.length} in the fixed audience pool for ${input.city} [${audience.receiptId}].`
      : `Comparable full-pool audience rank unavailable for ${item.name} in ${input.city} [${audience.receiptId}].` }];
    researched.push({ ...item, culturalLinks: [], fit: audience.utility, rank: audience.rank, of: primary.audience.returned,
      local: localSupported ? 'yes' : 'no data', momentum: trend?.direction ?? 'unknown',
      evidence: { rank: rankSupported, local: localSupported, trends: !!trend, comparison: false },
      receipts: uniq([...(item.identityReceipt ? [item.identityReceipt] : []), ...receipts]), claims, note: claims[0].text });
  }
  const provisional = optimizeSlate(researched, input.constraints);
  const crossGenre = [];
  const eligible = researched.filter(item => item.terms.available && Number.isFinite(item.terms.fee) && !input.constraints.excludedIds.includes(item.id));
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const a = eligible[i], b = eligible[j];
    const call = await run.call('compare_audiences', { group_a: [a.id], group_b: [b.id], target_type: 'artist', limit: 10 }, `Cross-genre context: ${a.name} × ${b.name}`);
    crossGenre.push({ a: a.id, b: b.id, genres: [a.terms.genre, b.terms.genre], available: comparisonThemes(call.env).interpretable,
      sharedTastes: call.receipt.evidence.sharedNames ?? [], receiptId: call.receipt.id, status: call.receipt.status });
  }
  for (const item of researched) item.culturalLinks = crossGenre.filter(pair => pair.a === item.id || pair.b === item.id).map(pair => ({
    otherId: pair.a === item.id ? pair.b : pair.a, available: pair.available, sharedTastes: pair.sharedTastes, receiptId: pair.receiptId }));
  const finalSlate = optimizeSlate(researched, input.constraints);
  adaptiveResearch.push({ question: 'Does full-pool pair evidence change the preferred lineup?',
    previousIds: provisional.selectedIds, selectedIds: finalSlate.selectedIds,
    decision: 'Re-enumerate all feasible slates using cultural relationships and cancellation readiness; preserve every hard constraint' });
  const selected = researched.filter(item => finalSlate.selectedIds.includes(item.id));
  const experience = [];
  if (input.includeExperience && selected.length) for (const target of ['brand', 'artist', 'place', 'podcast']) {
    const call = await run.call('recommend', { target_type: target, signals: selected.map(item => item.id),
      ...(target === 'place' ? { filter_location: input.city } : { signal_location: input.city }), limit: 8 }, `Festival ${target} prospects from the selected audience`);
    experience.push({ target, status: call.receipt.status, candidates: call.receipt.evidence.rows, receiptId: call.receipt.id,
      state: 'research_leads', note: 'Uncontacted prospects; availability, suitability and rights require organizer review.' });
  }
  return { version: '1.0', sourceId: snapshot.id, input, markets, overlap, profiles, crossGenre, experience,
    items: researched, slate: finalSlate, adaptiveResearch, receipts: run.receipts, mode: run.mode,
    limitations: ['Cross-city comparison uses membership and fixed-pool ordinal ranks, never cross-query affinity values.',
      'Age-bucket ranks are aggregate audience signals. Missing demographics are not inferred from music taste.',
      'Five-part Taste Fit preserves the source weights but remains separate from the existing booking objective; neutral estimates do not become optimizer evidence.',
      'The harness does not expose the original family life-stage audience selector. Category-filtered, per-theme sponsor research is available through the separate season-research workflow.',
      'Incomplete ranking responses have no comparable utility. Geographic and trend measurements report their actual available scope.'] };
}
