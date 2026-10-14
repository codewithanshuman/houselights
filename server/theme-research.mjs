// Theme Night GM's per-domain audience matrix and per-night research workflow,
// adapted to the official bounded harness. Exact scoring utilities retain their license.
import { buildThemeSeason } from './theme-season.mjs';
import { rankPool } from './festival-research.mjs';
import { DNA_KINDS } from './theme-night/market-dna.mjs';
import { sensitiveTopic, isYoungCrowd, isAlcoholBrand, isDrinkingSpot } from './theme-night/sensitivity.mjs';

const SEGMENT_QUERIES = { gen_z: ['0-24'], young_pros: ['25-29', '30-34'], boomers: ['over 55'], families: [] };
const TARGETS = ['brand', 'artist', 'place', 'podcast'];
const usable = receipt => ['ok', 'partial', 'degraded'].includes(receipt.status);
const unique = list => [...new Set(list)];
const round = value => Math.round(value * 1000) / 1000;

export function prepareThemeResearch(snapshot, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Season research options must be an object.');
  const initial = buildThemeSeason(snapshot, raw);
  const referenceLocation = raw.referenceLocation?.trim?.() || null;
  if (raw.referenceLocation != null && (typeof raw.referenceLocation !== 'string' || !referenceLocation || referenceLocation.length > 100)) throw new Error('Reference location must be a nonempty place name of at most 100 characters.');
  if (referenceLocation?.toLowerCase() === initial.city.toLowerCase()) throw new Error('Reference location must differ from the decision city.');
  const candidateLimit = raw.candidateLimit ?? 10;
  if (!Number.isInteger(candidateLimit) || candidateLimit < 2 || candidateLimit > 10) throw new Error('Use 2–10 theme candidates per domain.');
  const excludedIds = raw.excludedAnchorIds ?? [];
  if (!Array.isArray(excludedIds) || excludedIds.length > 100 || excludedIds.some(id => typeof id !== 'string')) throw new Error('Excluded anchors must be an array of up to 100 IDs.');
  const market = snapshot.festivalResearch.markets.find(item => item.city === initial.city);
  const known = new Set(market.domains.flatMap(domain => domain.entities.map(card => card.id)));
  if (excludedIds.some(id => !known.has(id))) throw new Error('Excluded anchor is absent from the saved market research.');
  const anchorOverrides = raw.anchorOverrides ?? {};
  if (!anchorOverrides || typeof anchorOverrides !== 'object' || Array.isArray(anchorOverrides)) throw new Error('Anchor overrides must map selected dates to saved theme IDs.');
  const selectedDates = new Set(initial.dates.selected.map(date => date.date));
  const overrideIds = Object.values(anchorOverrides);
  if (unique(overrideIds).length !== overrideIds.length) throw new Error('Anchor overrides must use distinct themes.');
  for (const [date, id] of Object.entries(anchorOverrides)) {
    if (!selectedDates.has(date) || typeof id !== 'string' || !known.has(id) || excludedIds.includes(id)) throw new Error('Anchor override must use a selected date and an eligible saved theme ID.');
  }
  const domains = market.domains.filter(domain => DNA_KINDS.includes(domain.kind)).map(domain => {
    const eligible = domain.entities.filter(card => card.id && card.name && !excludedIds.includes(card.id) && !sensitiveTopic(card));
    const required = eligible.filter(card => overrideIds.includes(card.id));
    if (required.length > candidateLimit) throw new Error('Too many locked anchors for this domain candidate limit.');
    const ids = new Set([...required, ...eligible.filter(card => !overrideIds.includes(card.id)).slice(0, candidateLimit - required.length)].map(card => card.id));
    return { ...domain, entities: eligible.filter(card => ids.has(card.id)), availableCount: eligible.length };
  }).filter(domain => domain.entities.length);
  const eligibleIds = new Set(domains.flatMap(domain => domain.entities.map(card => card.id)));
  if (overrideIds.some(id => !eligibleIds.has(id))) throw new Error('An overridden theme is excluded by suitability checks.');
  if (eligibleIds.size < selectedDates.size) throw new Error('Not enough distinct eligible anchors for these nights. Reduce nights or exclusions.');
  const sponsorTags = raw.sponsorTags ?? [];
  if (!Array.isArray(sponsorTags) || sponsorTags.length > 5 || sponsorTags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 180)) throw new Error('Sponsor categories must be 0–5 Qloo tags or category names.');
  const segments = unique(initial.dates.selected.map(date => date.segment));
  const expectedCalls = domains.length * (1 + Number(!!referenceLocation) + segments.reduce((n, segment) => n + SEGMENT_QUERIES[segment].length, 0)) + initial.nights.length * TARGETS.length;
  return { raw: structuredClone(raw), city: initial.city, domains, segments, referenceLocation, candidateLimit,
    sponsorTags: unique(sponsorTags.map(tag => tag.trim())), anchorOverrides: { ...anchorOverrides }, expectedCalls,
    dates: initial.dates, sourceId: snapshot.id };
}

function segmentRow(segment, calls, id) {
  if (!calls.length) return { status: 'unsupported', complete: false, utility: null, receiptIds: [], buckets: [],
    interpretation: 'The harness exposes age and gender, not the source family life-stage selector. No age proxy is substituted.' };
  const complete = calls.every(call => call.rank.complete);
  const buckets = calls.map(call => ({ demographic: call.demographic, ...call.rank.rows.find(row => row.id === id), complete: call.rank.complete }));
  return { status: complete ? 'complete' : 'incomplete', complete,
    utility: complete ? round(buckets.reduce((sum, bucket) => sum + bucket.utility, 0) / buckets.length) : null,
    receiptIds: calls.map(call => call.rank.receiptId), buckets,
    interpretation: segment === 'young_pros'
      ? 'Equal-weight mean of complete 25–29 and 30–34 ordinal ranks in the same domain pool; a planning policy, not a measured population mixture.'
      : 'Complete age-signal rank within the fixed domain pool. This is not a population share or attendance forecast.' };
}

export async function researchThemeSeason(snapshot, raw, run) {
  const plan = prepareThemeResearch(snapshot, raw);
  // Enforce at the engine boundary as well as the route; retries share this budget.
  if (plan.expectedCalls > run.budget - run.used) throw new Error(`Season research requires ${plan.expectedCalls} workflows before retries; remaining budget is ${run.budget - run.used}. Reduce nights, segments or reference comparison.`);
  const matrix = [];
  for (const domain of plan.domains) {
    run.emit({ type: 'stage', text: `Theme audience matrix · ${domain.kind} · ${plan.city}` });
    const args = { options: domain.entities.map(card => card.id), option_type: domain.kind, signal_location: plan.city };
    const local = rankPool(await run.call('rank', args, `Re-rank the fixed ${domain.kind} theme pool locally`), domain.entities);
    const reference = plan.referenceLocation ? rankPool(await run.call('rank', { ...args, signal_location: plan.referenceLocation },
      `Compare the identical ${domain.kind} pool against ${plan.referenceLocation}`), domain.entities) : null;
    const segments = {};
    for (const segment of plan.segments) {
      segments[segment] = [];
      for (const demographic of SEGMENT_QUERIES[segment]) {
        const rank = rankPool(await run.call('rank', { ...args, demographic }, `Rank fixed ${domain.kind} pool for ${segment}: ${demographic}`), domain.entities);
        segments[segment].push({ demographic, rank });
      }
    }
    matrix.push({ kind: domain.kind, poolIds: args.options, scannedCandidates: domain.availableCount, testedCandidates: domain.entities.length,
      local, reference, rows: domain.entities.map(card => {
        const localRow = local.rows.find(row => row.id === card.id), referenceRow = reference?.rows.find(row => row.id === card.id);
        return { id: card.id, name: card.name, local: localRow,
          segments: Object.fromEntries(plan.segments.map(segment => [segment, segmentRow(segment, segments[segment], card.id)])),
          referenceLift: reference ? { location: plan.referenceLocation, localRank: localRow.rank, referenceRank: referenceRow.rank,
            positions: local.complete && reference.complete ? referenceRow.rank - localRow.rank : null,
            receiptIds: [local.receiptId, reference.receiptId],
            interpretation: 'Positive means ranked higher locally within this identical pool. Ordinal position difference is not affinity growth or national market size.' } : null };
      }) });
  }
  const season = buildThemeSeason(snapshot, raw, { domains: plan.domains, matrix, anchorOverrides: plan.anchorOverrides });
  const usedBrands = new Set();
  for (const night of season.nights) {
    run.emit({ type: 'stage', text: `Theme-specific partners · ${night.anchor.name} · ${night.date}` });
    const kits = [];
    for (const target of TARGETS) {
      const call = await run.call('recommend', { target_type: target, signals: [night.anchor.id], signal_location: plan.city,
        ...(target === 'place' ? { filter_location: plan.city } : {}),
        ...(target === 'brand' && plan.sponsorTags.length ? { include_tags: plan.sponsorTags, include_tags_operator: 'union' } : {}), limit: 8 },
      `Research ${target} leads for ${night.anchor.name} on ${night.date}; no availability inferred`);
      const returned = usable(call.receipt) ? call.receipt.evidence.rows.filter(card => card.id && card.name) : [];
      const candidates = returned.filter(card => !sensitiveTopic(card) && !(isYoungCrowd(night.segment) &&
        (isAlcoholBrand(card) || target === 'place' && isDrinkingSpot(card)))).map(card => ({ ...card, receiptId: call.receipt.id }));
      const resolution = call.receipt.status === 'needs_input' ? (call.env.resolution?.issues ?? [])
        .filter(issue => issue.field === 'include_tags' && issue.input_kind === 'tag' && plan.sponsorTags.includes(issue.input))
        .slice(0, 5).map(issue => ({ input: issue.input, receiptId: call.receipt.id,
          candidates: (issue.candidates ?? []).filter(card => typeof card.id === 'string' && card.id.startsWith('urn:tag:') && typeof card.name === 'string')
            .slice(0, 10).map(card => ({ id: card.id, name: card.name })) })) : [];
      kits.push({ target, status: call.receipt.status, receiptId: call.receipt.id, candidates,
        resolution, filteredCount: returned.length - candidates.length, state: 'uncontacted_leads' });
    }
    const kit = target => kits.find(item => item.target === target);
    const brands = kit('brand').candidates;
    night.sponsors = [...brands.filter(card => !usedBrands.has(card.id)), ...brands.filter(card => usedBrands.has(card.id))].slice(0, 2);
    night.sponsors.forEach(card => usedBrands.add(card.id));
    night.playlist = kit('artist').candidates.slice(0, 6);
    night.localPartners = kit('place').candidates.slice(0, 2);
    night.mediaPartner = kit('podcast').candidates[0] ?? null;
    night.experience = kits;
    night.experienceBasis = 'Separate Qloo queries for this theme anchor and city. Date is a planning label, not a date-specific availability signal. Segment suitability uses label/tag filtering, not a demographic partner ranking.';
    night.evidence = unique([night.anchor.receiptId, ...(night.anchor.scoreReceipts ?? []), ...(night.anchor.referenceLift?.receiptIds ?? []), ...kits.map(kit => kit.receiptId)].filter(Boolean));
    night.researchStatus = night.anchor.localEvidence?.utility != null && night.anchor.audienceEvidence?.complete && kits.every(kit => kit.status === 'ok' && kit.candidates.length) ? 'complete' : 'partial';
  }
  season.research = { version: '1.0', mode: run.mode, expectedCalls: plan.expectedCalls, usedAttempts: run.used,
    candidateLimit: plan.candidateLimit, referenceLocation: plan.referenceLocation, sponsorTags: plan.sponsorTags, matrix,
    options: plan.raw, receiptIds: run.receipts.map(receipt => receipt.id),
    status: season.nights.every(night => night.researchStatus === 'complete') && matrix.every(domain => domain.local.complete &&
      (!domain.reference || domain.reference.complete) && domain.rows.every(row => Object.values(row.segments).every(segment => segment.complete))) ? 'complete' : 'partial' };
  season.limitations = [
    'Audience and local fit use complete ordinal rankings of the same capped pool in each domain. Cross-domain scores are a programming policy, not comparable demand measurements.',
    'Young-professional fit equally weights two age-bucket ranks. Family life-stage is unavailable through this harness and stays unmeasured.',
    'Near-venue concentration, momentum and new-fan reach remain estimated for themes. Missing-input bounds are not confidence intervals.',
    'Partner queries use the individual theme anchor; availability, suitability, sponsorship interest, category resolution and rights still require organizer review.',
    'Reference-market lift is ordinal position change within the identical pool, never a raw-affinity subtraction.',
    'This programs themed nights around a saved festival; it does not book artists for multiple dates.'
  ];
  return { ...snapshot, id: undefined, createdAt: undefined, parentId: snapshot.id, themeSeason: season,
    receipts: [...(snapshot.receipts ?? []), ...run.receipts] };
}
