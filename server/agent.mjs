import { nameOf, idOf, tagsOf, trendOf, comparisonOf } from './shape.mjs';
import { optimizeSlate } from './optimizer.mjs';
import { evaluate } from './eval.mjs';
import * as llm from './llm.mjs';
import { fitsFromRankRows, relativeVerdicts } from './affinity.mjs';
import { researchValue, allocateResearch, RESEARCH_REASON } from './research-value.mjs';

const low = value => String(value ?? '').toLowerCase().trim();
const ago = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const usable = env => ['ok', 'partial', 'degraded'].includes(env.status);
const rows = env => Array.isArray(env.results) ? env.results : [];
export const defaultConstraints = { budget: 20000, slots: 3, discoveryMin: 0, maxPerGenre: 2, riskTolerance: 50, lockedIds: [], excludedIds: [] };

// Resolve, discover, rank, allocate evidence checks, and solve the whole portfolio.
// Written factual statements come from a closed, per-candidate claim ledger.
// `discover` lets a public run with no buyer-entered offers discover up to `limit` artists
// and give each illustrative terms (`terms(row)`), so they can enter a bookable slate.
export async function buildMemo({ city, anchors, offers, picks = {}, terms = {}, constraints = {}, currency = 'USD', exampleBookingTerms = false, discover = {} }, run) {
  constraints = { ...defaultConstraints, ...constraints };
  const say = text => run.emit({ type: 'stage', text });
  const candidates = new Map(), lookup = new Map(), pending = [], anchorRefs = [], anchorIdentities = new Set(), excludedAnchors = [];
  const remember = (ref, name) => { lookup.set(low(ref), ref); lookup.set(low(name), ref); };
  const termsFor = (original, name) => {
    const entry = Object.entries(terms).find(([key]) => [low(original), low(name)].includes(low(key)))?.[1];
    return { fee: typeof entry?.fee === 'number' && Number.isFinite(entry.fee) && entry.fee >= 0 ? entry.fee : null,
      genre: String(entry?.genre || '').trim().slice(0, 60), available: entry?.available === true };
  };
  say('Resolve · confirming artist identities');
  for (const [names, isAnchor] of [[anchors, true], [[...new Set(offers)], false]]) {
    for (const original of names) {
      if (!isAnchor && anchorIdentities.has(low(original))) { excludedAnchors.push(original); continue; }
      const picked = picks[original];
      const { env, receipt } = await run.call('describe', { entity: picked?.id || picked?.name || original, type: 'artist' }, `Confirm “${original}”`);
      if (env.status === 'needs_input') {
        pending.push(original);
        run.emit({ type: 'needs_input', name: original, receipt: receipt.id,
          candidates: rows(env).slice(0, 6).map(row => ({ name: nameOf(row), id: idOf(row) })).filter(row => row.name) });
        continue;
      }
      const row = rows(env)[0];
      if (!usable(env) || !row) { pending.push(original); continue; }
      const name = nameOf(row) || original, ref = idOf(row) || name;
      if (isAnchor) {
        remember(ref, name);
        lookup.set(low(original), ref);
        for (const identity of [ref, name, original]) anchorIdentities.add(low(identity));
        if (!anchorRefs.includes(ref)) anchorRefs.push(ref);
      } else if ([ref, name, original].some(identity => anchorIdentities.has(low(identity)))) {
        excludedAnchors.push(original);
      } else {
        remember(ref, name);
        if (!candidates.has(ref)) candidates.set(ref, { id: ref, name, originalName: original, found: false, terms: termsFor(original, name), identityReceipt: receipt.id });
      }
    }
  }
  if (!anchorRefs.length) { run.emit({ type: 'error', text: 'No anchor artists could be confirmed. Resolve the matches or check the names.' }); return; }
  const eligibleOffers = [...candidates.values()].filter(candidate => !candidate.found).map(candidate => candidate.originalName);
  const baselinePromise = eligibleOffers.length ? llm.baseline({ city, anchors, offers: eligibleOffers }) : Promise.resolve(null);
  say('Discover · mapping the room’s taste and adjacent artists');
  const tags = await run.call('entity_tags', { entities: anchorRefs, entity_type: 'artist' }, 'Taste vocabulary associated with the anchor artists');
  const crowd = usable(tags.env) ? [...new Set(tagsOf(tags.env))].slice(0, 12) : [];
  const discovery = await run.call('recommend', { target_type: 'artist', signals: anchorRefs, signal_location: city, limit: 8 }, 'Discover adjacent artists for this city');
  if (usable(discovery.env)) for (const row of rows(discovery.env)) {
    const name = nameOf(row), ref = idOf(row) || name;
    if (!name || lookup.has(low(ref)) || lookup.has(low(name)) || candidates.size >= Math.min(discover.limit ?? offers.length + 3, 9)) continue;
    remember(ref, name);
    const discoveredTerms = typeof discover.terms === 'function' ? discover.terms(row) : null;
    candidates.set(ref, { id: ref, name, found: true, terms: discoveredTerms ?? termsFor(name, name), identityReceipt: discovery.receipt.id });
  }
  if (!candidates.size) { run.emit({ type: 'error', text: 'No candidates could be resolved or discovered.' }); return; }
  say('Rank · testing the candidate pool against your anchors');
  const ranking = await run.call('rank', { options: [...candidates.keys()], option_type: 'artist', signals: anchorRefs, signal_location: city }, 'Relative audience fit for this candidate pool and city');
  const order = usable(ranking.env) ? [...new Set(rows(ranking.env).map(row => lookup.get(low(idOf(row))) || lookup.get(low(nameOf(row)))).filter(ref => candidates.has(ref)))] : [];
  const ordered = [...order, ...[...candidates.keys()].filter(ref => !order.includes(ref))];
  const rankComplete = order.length === candidates.size;
  // Fit from Qloo affinity scores when the ranking returned one for every candidate.
  const scored = rankComplete ? fitsFromRankRows(order, ranking.receipt.evidence?.rows ?? []) : null;
  say('Plan · allocating the remaining evidence budget');
  const deepLimit = Math.max(0, Math.min(4, Math.floor((run.budget - run.used - 1) / 2)));
  const proposal = await llm.plan({ city, callsLeft: run.budget - run.used, candidates: ordered.map(ref => ({ name: candidates.get(ref).name, rank: order.includes(ref) ? order.indexOf(ref) + 1 : null, foundForYou: candidates.get(ref).found })) });
  const proposed = [...new Set((Array.isArray(proposal?.deep) ? proposal.deep : []).map(name => ordered.find(ref => low(candidates.get(ref).name) === low(name))).filter(Boolean))];
  const discoveryRef = ordered.find(ref => candidates.get(ref).found);
  const affordable = ordered.filter(ref => candidates.get(ref).terms.fee != null).sort((a, b) => candidates.get(a).terms.fee - candidates.get(b).terms.fee)[0];
  const preference = [...new Set([...proposed, ordered[0], discoveryRef, affordable, ...ordered].filter(Boolean))];
  let deep = preference.slice(0, deepLimit), research = null;
  // Live plans spend deep checks by value of information: acts whose possible results could
  // change the bill first, then the booked acts. Other runs keep the original allocation, so
  // pinned recordings replay exactly.
  if (discover.research === 'value-of-information') {
    const drafts = ordered.map(ref => { const candidate = candidates.get(ref), hasRank = rankComplete && order.includes(ref);
      return { id: ref, name: candidate.name, found: candidate.found, terms: candidate.terms, fit: hasRank ? scored.fits.get(ref) : null,
        local: 'no data', momentum: 'unknown', evidence: { rank: hasRank, local: false, comparison: false, trends: false } }; });
    const value = researchValue(drafts, constraints);
    if (value.status === 'ready') {
      const allocation = allocateResearch(value, preference, deepLimit);
      deep = allocation.deep;
      research = { method: value.method, outcomes: value.outcomes, deepLimit, candidates: allocation.reasons };
    }
  }
  run.emit({ type: 'plan', by: research ? 'value-of-information' : proposed.length ? 'llm' : 'rules', deep: deep.map(ref => candidates.get(ref).name),
    reason: research ? RESEARCH_REASON : 'Check leading fit, discovered choices and affordable alternatives within the tool budget.' });
  const trendCall = deep.length ? await run.call('trends', { entities: deep, entity_type: 'artist', start_date: ago(180), end_date: ago(0) }, 'Observed trend direction over the last six months') : null;
  const items = [];
  for (const ref of ordered) {
    const candidate = candidates.get(ref), position = order.indexOf(ref), hasRank = rankComplete && position >= 0;
    const receipts = [candidate.identityReceipt, ranking.receipt.id];
    let local = 'no data', momentum = 'unknown', comparison = false, localEvidence = false, trendEvidence = false;
    const evidenceReceipts = { rank: [ranking.receipt.id], local: [], comparison: [], trends: [] };
    if (deep.includes(ref)) {
      say(`Verify · local and audience context for ${candidate.name}`);
      const where = await run.call('where_popular', { entity: ref, entity_type: 'artist', within: city, limit: 10 }, `Geographic popularity evidence for ${candidate.name} within ${city}`);
      const compare = await run.call('compare_audiences', { group_a: anchorRefs, group_b: [ref], target_type: 'artist', limit: 10 }, `Compare ${candidate.name} and the anchor audience; no net-new percentage inferred`);
      localEvidence = usable(where.env) && rows(where.env).length > 0;
      local = localEvidence ? 'yes' : 'no data';
      comparison = comparisonOf(compare.env).available;
      if (trendCall && usable(trendCall.env)) {
        const trend = trendOf(trendCall.env, ref, candidate.name);
        momentum = typeof trend === 'string' ? trend : trend?.direction || 'unknown';
        if (!['rising', 'cooling', 'flat', 'unknown'].includes(momentum)) momentum = 'unknown';
        trendEvidence = momentum !== 'unknown';
      }
      receipts.push(where.receipt.id, compare.receipt.id, ...(trendCall ? [trendCall.receipt.id] : []));
      evidenceReceipts.local = [where.receipt.id]; evidenceReceipts.comparison = [compare.receipt.id];
      evidenceReceipts.trends = trendCall ? [trendCall.receipt.id] : [];
    }
    // Fit is Qloo affinity scaled across the ranked pool (ordinal position only when
    // scores are missing). It is relative cultural fit, not market share or a forecast.
    const fit = hasRank ? scored.fits.get(ref) : null;
    const claimList = [{ id: `${ref}:rank`, text: hasRank ? `Ranks ${position + 1} of ${order.length} returned artists for these anchors [${ranking.receipt.id}].` : `No supported audience rank is available [${ranking.receipt.id}].` }];
    if (deep.includes(ref)) {
      claimList.push({ id: `${ref}:local`, text: `${localEvidence ? 'Geographic popularity results are available' : 'Geographic popularity is unverified'} for ${city} [${receipts[2]}].` });
      claimList.push({ id: `${ref}:trend`, text: `Observed trend direction: ${momentum}${trendCall ? ` [${trendCall.receipt.id}]` : ''}.` });
    }
    items.push({ ...candidate, rank: hasRank ? position + 1 : null, of: candidates.size, fit, local, momentum, verdict: 'hold',
      ...(hasRank && scored.basis === 'qloo-affinity' ? { affinity: scored.scores.get(ref), fitBasis: 'qloo-affinity' } : hasRank ? { fitBasis: 'ordinal-rank' } : {}),
      rankCoverage: { complete: rankComplete, returned: order.length, requested: candidates.size },
      receipts: [...new Set(receipts)], tags: candidate.terms.genre ? [candidate.terms.genre] : [],
      evidence: { rank: hasRank, local: localEvidence, comparison, trends: trendEvidence }, evidenceReceipts, claims: claimList, note: claimList.map(claim => claim.text).join(' ') });
  }
  const verdicts = relativeVerdicts(items);
  for (const item of items) item.verdict = verdicts.get(item.id);
  say('Optimize · checking every possible slate against your constraints');
  const slate = optimizeSlate(items, constraints);
  const caveats = [
    'Verdicts are relative cultural-fit bands within this candidate pool, not calibrated booking or ticket-sales predictions. Near-tied acts share a conservative verdict.',
    'Qloo supplies aggregate cultural affinities, not ticket sales, attendance, or revenue forecasts.',
    'Fit is a relative rank utility within this pool, not an affinity percentage. Fees, availability and genres are buyer-entered assumptions.',
    'Discovered artists need a fee and availability check before they can enter a bookable slate.',
    'Audience comparison is contextual evidence; it does not establish net-new audience share or pairwise cannibalization.'
  ];
  if (pending.length) caveats.push(`Unresolved or unavailable artists: ${pending.join(', ')}.`);
  if (excludedAnchors.length) caveats.push(`Not ranked or booked because they are also anchors: ${[...new Set(excludedAnchors)].join(', ')}.`);
  if (!rankComplete) caveats.push(`Ranking returned ${order.length}/${candidates.size} candidates. Comparable full-pool fit is unknown for every artist; the returned order remains in its receipt.`);
  if (order.length < candidates.size) caveats.push(`${candidates.size - order.length} candidates have no supported Qloo rank; no input-order rank was substituted.`);
  for (const receipt of run.receipts) if (['partial', 'degraded', 'error'].includes(receipt.status)) caveats.push(`${receipt.id} ${receipt.tool}: ${receipt.status}. ${receipt.summary || ''}`);
  say('Write · assembling the booking brief from verified claim IDs');
  const written = await llm.write({ city, acts: items.map(item => ({ name: item.name, claims: item.claims })) });
  const removed = [];
  if (written?.notes && typeof written.notes === 'object') for (const item of items) {
    const selected = written.notes[item.name];
    if (!Array.isArray(selected)) continue;
    const known = new Map(item.claims.map(claim => [claim.id, claim.text]));
    const valid = [...new Set(selected)].filter(id => typeof id === 'string' && known.has(id));
    for (const id of selected) if (!known.has(id)) removed.push({ sentence: String(id), reason: 'unknown claim ID' });
    if (valid.length) item.note = valid.map(id => known.get(id)).join(' ');
  }
  const baseRaw = await baselinePromise;
  const base = baseRaw && Array.isArray(baseRaw.verdicts) && Array.isArray(baseRaw.order) ? {
    order: baseRaw.order.filter(value => typeof value === 'string').slice(0, 10),
    verdicts: baseRaw.verdicts.filter(value => value && typeof value.name === 'string' && typeof value.reason === 'string' && ['lean yes', 'growth bet', 'hold', 'lean pass'].includes(value.verdict)).slice(0, 10)
  } : null;
  const memo = { items, slate, constraints, input: { city, anchors, anchorIds: anchorRefs, offers, currency, exampleBookingTerms }, currency, exampleBookingTerms,
    fitBasis: rankComplete ? scored.basis : 'unavailable', ...(rankComplete && scored.basis === 'qloo-affinity' ? { fitScale: 'fixed-span-0.05' } : {}),
    mode: run.mode === 'mock' || run.receipts.some(receipt => receipt.source === 'synthetic') ? 'mock' : 'live', caveats, crowd,
    writer: written ? 'claim-selector' : 'template', ...(research ? { research } : {}), verdictPolicy: 'relative-affinity-bands-v1', summary: '', removed, base,
    quality: { resolved: candidates.size, ranked: rankComplete ? order.length : 0, deepChecked: deep.length, receipts: run.receipts.length, liveCalls: run.used },
    eval: evaluate({ items, ranked: rankComplete ? order.map(ref => candidates.get(ref).name) : [], base, receipts: run.receipts }) };
  run.emit({ type: 'memo', ...memo });
  return memo;
}
