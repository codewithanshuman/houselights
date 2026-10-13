import { nameOf } from './shape.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const PROFILE_TARGETS = new Set(['book', 'brand', 'movie', 'podcast', 'tv_show', 'videogame']);

function validDate(value) {
  if (!datePattern.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function normalizePoint(raw, label) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const name = String(value.name || '').trim().slice(0, 100), lat = Number(value.lat), lon = Number(value.lon);
  if (!name || !finite(lat) || lat < -90 || lat > 90 || !finite(lon) || lon < -180 || lon > 180) {
    throw new Error(`${label} needs a name and valid lat/lon coordinates.`);
  }
  return { name, lat, lon };
}

export function normalizeIntelligenceInput(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (!Array.isArray(value.markets) || value.markets.length < 2 || value.markets.length > 8) throw new Error('Provide 2–8 candidate markets.');
  const markets = value.markets.map((market, index) => normalizePoint(market, `Market ${index + 1}`));
  if (new Set(markets.map(market => market.name.toLowerCase())).size !== markets.length) throw new Error('Market names must be unique.');
  const origin = normalizePoint(value.origin || markets[0], 'Origin');
  const stopCount = Number(value.stopCount ?? Math.min(5, markets.length));
  if (!Number.isInteger(stopCount) || stopCount < 2 || stopCount > Math.min(8, markets.length)) throw new Error('stopCount must be an integer from 2 to 8 and no larger than the market list.');
  if (!validDate(value.startDate)) throw new Error('startDate must be a valid YYYY-MM-DD date.');
  const includeAudienceProfile = value.includeAudienceProfile !== false;
  const requestedTargets = value.profileTargets ?? ['brand', 'movie', 'podcast'];
  if (!Array.isArray(requestedTargets) || requestedTargets.length > 5) throw new Error('profileTargets must be an array of at most five supported Qloo entity types.');
  const profileTargets = [...new Set(requestedTargets.map(target => String(target).trim().toLowerCase()))];
  if (profileTargets.some(target => !PROFILE_TARGETS.has(target))) throw new Error('profileTargets supports book, brand, movie, podcast, tv_show and videogame.');
  return {
    origin, markets, stopCount, startDate: value.startDate, includeAudienceProfile,
    profileTargets: includeAudienceProfile ? profileTargets : [],
    rules: { minMarketDistanceKm: 150, maxLegKm: 1800, maxDriveKmPerDay: 700, dayOffAfterShows: 5 }
  };
}

export function intelligenceWorkflowCount(input, artistCount) {
  const base = input.markets.length * artistCount + artistCount * (artistCount - 1) / 2 + input.stopCount;
  return base + (input.includeAudienceProfile ? 1 + artistCount + input.profileTargets.length : 0);
}

export function distanceKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function permutations(values, size, prefix = [], out = []) {
  if (prefix.length === size) { out.push(prefix); return out; }
  for (const value of values) if (!prefix.includes(value)) permutations(values, size, [...prefix, value], out);
  return out;
}

function schedule(route, origin, startDate, rules) {
  let date = startDate, previous = origin, consecutiveShows = 0;
  return route.map((market, index) => {
    const fromKm = distanceKm(previous, market);
    const travelDays = fromKm === 0 ? 0 : Math.max(1, Math.ceil(fromKm / rules.maxDriveKmPerDay));
    let dayOffBefore = false;
    if (index === 0) date = addDays(date, Math.max(0, travelDays - 1));
    else {
      date = addDays(date, Math.max(0, travelDays - 1));
      if (consecutiveShows >= rules.dayOffAfterShows) { date = addDays(date, 1); consecutiveShows = 0; dayOffBefore = true; }
    }
    const stop = { ...market, sequence: index + 1, from: previous.name, fromKm, travelDays, dayOffBefore, showDate: date };
    date = addDays(date, 1); previous = market; consecutiveShows++;
    return stop;
  });
}

export function optimizeMarketRoute(scoredMarkets, input) {
  let best = null, checkedCount = 0, rejectedRadius = 0, rejectedLeg = 0;
  for (const route of permutations(scoredMarkets, input.stopCount)) {
    checkedCount++;
    let radiusViolation = false;
    for (let left = 0; left < route.length; left++) for (let right = left + 1; right < route.length; right++) {
      if (distanceKm(route[left], route[right]) < input.rules.minMarketDistanceKm) radiusViolation = true;
    }
    if (radiusViolation) { rejectedRadius++; continue; }
    let previous = input.origin, distance = 0, legViolation = false;
    for (const market of route) {
      const leg = distanceKm(previous, market); distance += leg;
      if (leg > input.rules.maxLegKm) legViolation = true;
      previous = market;
    }
    if (legViolation) { rejectedLeg++; continue; }
    const tasteUtility = round(route.reduce((sum, market) => sum + market.marketScore, 0));
    const candidate = { route, tasteUtility, totalDistanceKm: round(distance) };
    if (!best || candidate.tasteUtility > best.tasteUtility || (candidate.tasteUtility === best.tasteUtility && candidate.totalDistanceKm < best.totalDistanceKm) ||
      (candidate.tasteUtility === best.tasteUtility && candidate.totalDistanceKm === best.totalDistanceKm && route.map(item => item.name).join('\0') < best.route.map(item => item.name).join('\0'))) best = candidate;
  }
  if (!best) return { feasible: false, checkedCount, rejectedRadius, rejectedLeg, stops: [], reasons: ['No route satisfies the declared market-distance and leg-distance rules.'] };
  return {
    feasible: true, method: 'exact-permutation-search', checkedCount, rejectedRadius, rejectedLeg,
    tasteUtility: best.tasteUtility, evidenceCoverageUtility: best.tasteUtility, objective: 'evidence_coverage', totalDistanceKm: best.totalDistanceKm,
    stops: schedule(best.route, input.origin, input.startDate, input.rules), reasons: [
      `Checked ${checkedCount} ordered routes and selected the highest comparable evidence coverage; distance breaks coverage ties.`,
      'Separate heatmap responses do not share a comparable affinity scale. Route utility therefore uses returned-evidence coverage only, never cross-query affinity.'
    ]
  };
}

function marketScore(artistRows, artistCount) {
  const observed = artistRows.filter(row => finite(row.affinity));
  const coverage = artistCount ? observed.length / artistCount : 0;
  // Heatmap affinities are percentiles within the response that returned them.
  // Separate market requests therefore do not share a comparable scale.
  return { coverage: round(coverage), meanAffinity: null, marketScore: round(100 * coverage), scoreBasis: 'evidence_coverage_only' };
}

function sharedNames(env) {
  const rows = Array.isArray(env?.comparison?.shared) ? env.comparison.shared : [];
  return [...new Set(rows.map(nameOf).filter(Boolean))].slice(0, 12);
}

export async function buildCulturalIntelligence(snapshot, rawInput, run) {
  if (!snapshot?.memo?.slate?.feasible) throw new Error('A feasible saved slate is required.');
  const input = normalizeIntelligenceInput(rawInput);
  const selectedIds = new Set(snapshot.memo.slate.selectedIds), artists = snapshot.memo.items.filter(item => selectedIds.has(item.id));
  const marketRows = [];
  for (const market of input.markets) {
    const artistEvidence = [];
    for (const artist of artists) {
      const { receipt } = await run.call('where_popular', { entity: artist.id, entity_type: 'artist', within: market.name, limit: 10 }, `Measure ${artist.name} evidence in ${market.name}`);
      const row = receipt.evidence?.rows?.find(item => item.name?.toLowerCase() === market.name.toLowerCase()) || receipt.evidence?.rows?.[0];
      artistEvidence.push({ artistId: artist.id, artistName: artist.name, affinity: finite(row?.affinity) ? row.affinity : null, status: receipt.status, receiptId: receipt.id });
    }
    marketRows.push({ ...market, ...marketScore(artistEvidence, artists.length), artists: artistEvidence });
  }
  const route = optimizeMarketRoute(marketRows, input);
  const cohesionPairs = [];
  for (let left = 0; left < artists.length; left++) for (let right = left + 1; right < artists.length; right++) {
    const a = artists[left], b = artists[right];
    const { env, receipt } = await run.call('compare_audiences', { group_a: [a.id], group_b: [b.id], target_type: 'artist', limit: 10 }, `Compare the aggregate audiences for ${a.name} and ${b.name}`);
    const shared = sharedNames(env);
    cohesionPairs.push({ artistA: a.id, artistB: b.id, names: [a.name, b.name], comparisonAvailable: receipt.evidence?.comparisonAvailable === true, sharedTastes: shared, sharedTasteCount: shared.length, receiptId: receipt.id });
  }
  const availablePairs = cohesionPairs.filter(pair => pair.comparisonAvailable);
  const pairsWithShared = availablePairs.filter(pair => pair.sharedTasteCount > 0);
  const cohesion = {
    pairCount: cohesionPairs.length, supportedPairCount: availablePairs.length,
    evidenceCoveragePercent: cohesionPairs.length ? round(availablePairs.length / cohesionPairs.length * 100) : 100,
    sharedTastePairPercent: availablePairs.length ? round(pairsWithShared.length / availablePairs.length * 100) : null,
    sharedThemes: [...new Set(cohesionPairs.flatMap(pair => pair.sharedTastes))], pairs: cohesionPairs,
    interpretation: 'Pair coverage and shared-theme breadth from aggregate comparison responses; not audience overlap, ticket cannibalization or sales lift.'
  };
  let audienceProfile = { enabled: false, tags: [], demographics: [], crossDomain: [], interpretation: 'Audience profile was disabled for this run.' };
  if (input.includeAudienceProfile) {
    const artistIds = artists.map(item => item.id);
    const tagCall = await run.call('entity_tags', { entities: artistIds, entity_type: 'artist', limit: 20 }, 'Find aggregate cultural concepts that characterize the selected slate');
    const demographics = [];
    for (const artist of artists) {
      const { receipt } = await run.call('audience_demographics', { entity: artist.id, entity_type: 'artist', limit: 12 }, `Inspect aggregate demographic context associated with ${artist.name}`);
      demographics.push({ artistId: artist.id, artistName: artist.name, rows: receipt.evidence?.rows || [], status: receipt.status, receiptId: receipt.id });
    }
    const crossDomain = [];
    const signalLocation = route.stops[0]?.name || input.markets[0].name;
    for (const targetType of input.profileTargets) {
      const { receipt } = await run.call('recommend', { target_type: targetType, signals: artistIds, signal_location: signalLocation, limit: 8 }, `Find ${targetType} context associated with the selected slate near ${signalLocation}`);
      crossDomain.push({ targetType, signalLocation, rows: receipt.evidence?.rows || [], status: receipt.status, receiptId: receipt.id });
    }
    audienceProfile = {
      enabled: true,
      tags: tagCall.receipt.evidence?.rows || [], tagReceiptId: tagCall.receipt.id, tagStatus: tagCall.receipt.status,
      demographics, crossDomain,
      interpretation: 'Aggregate Qloo taste context for campaign planning. It does not describe an individual, establish protected traits, or predict attendance or conversion.'
    };
  }
  const venueScouting = [];
  for (const stop of route.stops) {
    const { receipt } = await run.call('recommend', { target_type: 'place', signals: artists.map(item => item.id), filter_location: stop.name, limit: 8 }, `Scout Qloo place candidates for the selected slate in ${stop.name}`);
    venueScouting.push({ market: stop.name, candidates: receipt.evidence?.rows || [], receiptId: receipt.id, status: receipt.status, caveat: 'Place candidates require independent capacity, availability and commercial verification.' });
  }
  return {
    version: '1.0', generatedAt: new Date().toISOString(), sourceId: snapshot.id, input,
    artists: artists.map(item => ({ id: item.id, name: item.name })), markets: marketRows, route, cohesion, audienceProfile, venueScouting,
    receipts: run.receipts,
    chartData: {
      marketBars: marketRows.map(row => ({ market: row.name, policyScore: row.marketScore, scoreBasis: row.scoreBasis, evidenceCoveragePercent: round(row.coverage * 100), meanObservedAffinity: null })),
      artistMarketMatrix: marketRows.flatMap(row => row.artists.map(artist => ({ market: row.name, artist: artist.artistName, affinity: artist.affinity, affinityScale: 'within_receipt_only', receiptId: artist.receiptId }))),
      cohesionEdges: cohesionPairs.map(pair => ({ source: pair.names[0], target: pair.names[1], sharedTasteCount: pair.sharedTasteCount, supported: pair.comparisonAvailable, receiptId: pair.receiptId })),
      profileCounts: audienceProfile.enabled ? [
        { category: 'tags', count: audienceProfile.tags.length },
        ...audienceProfile.demographics.map(row => ({ category: `demographics:${row.artistName}`, count: row.rows.length })),
        ...audienceProfile.crossDomain.map(row => ({ category: row.targetType, count: row.rows.length }))
      ] : []
    },
    limitations: [
      'Market route scores use comparable evidence coverage only. Heatmap affinity values from separate market queries remain visible per receipt but are never averaged or ranked across markets.',
      'Qloo cultural affinity is not ticket demand. Coordinates are user-supplied routing inputs, not Qloo evidence.',
      'Venue candidates are cultural-context leads; capacity, availability, offer and contact details remain unverified.',
      'Audience tags, demographics and cross-domain results are aggregate cultural context; they do not identify individuals or predict campaign performance.'
    ]
  };
}
