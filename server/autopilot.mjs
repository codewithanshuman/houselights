// Houselights Autopilot: brief → evidence-gap research → strategies → stress →
// stress follow-up → decision packet.
//
// The research policy is deterministic value-of-information planning over the
// exact optimizer. Policy 'value' (2.0) tests open evidence gaps jointly: a gap is
// decision-material if it belongs to a set of answerable gaps whose best and worst
// outcomes could promote another feasible bill, and that set fits the remaining
// call budget. Policy 'value-v1' is the 1.0 single-gap test, kept for evaluation
// and for replaying 1.0 records. Observations come only from executed tool
// receipts; nothing is imputed.
import { createHash } from 'node:crypto';
import { optimizeSlate } from './optimizer.mjs';
import { GAP_KINDS, withOutcome, jointMateriality, answerRates } from './autopilot-research.mjs';
import { bookable, computeStrategies, stressTest } from './autopilot-strategy.mjs';
import { publicReceipt, receiptContentDigest, buildManifest, sha256 } from './autopilot-integrity.mjs';
import { packetMarkdown } from './autopilot-packet.mjs';
import { withAffinityFit, fitsFromRankRows, tieSensitivity, rankComparability, TIE_BAND } from './affinity.mjs';

export const AUTOPILOT_VERSION = '2.0';
export const POLICIES = ['value', 'value-v1', 'fixed-order', 'random'];
const KINDS = GAP_KINDS;
const TOOLS = { local: 'where_popular', comparison: 'compare_audiences', trends: 'trends', rank: 'rank', crosscheck: 'rank' };
// An incomplete ranking comes first: fit carries 100 points per slot, so per-artist
// materiality tested while every fit is unknown is not reliable.
const TIER_ORDER = { ranking: 0, material: 1, robustness: 2, justification: 3, fallback: 4 };
const EXECUTABLE = new Set(Object.keys(TIER_ORDER));
const NON_EXECUTABLE_ORDER = { deferred: 5, immaterial: 6, blocked: 7, done: 8 };
// Planning replays make no calls; reachability is judged against this nominal budget.
const PLANNING_CALLS = 10;
const usable = status => ['ok', 'partial', 'degraded'].includes(status);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
const key = ids => [...ids].sort().join('\0');
const same = (a, b) => key(a) === key(b);
const unique = values => [...new Set(values)];
const ago = (now, days) => new Date(now - days * 864e5).toISOString().slice(0, 10);
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const tierRank = tier => TIER_ORDER[tier] ?? NON_EXECUTABLE_ORDER[tier] ?? 9;
export const moneyFormatter = currency => value => finite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value) : 'unknown';

export function autopilotOptions(source, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fault('Autopilot options must be an object.');
  const allowed = ['maxCalls', 'maxRounds', 'budget', 'lockedIds', 'excludedIds'];
  if (Object.keys(raw).some(name => !allowed.includes(name))) throw fault(`Autopilot accepts only ${allowed.join(', ')}.`);
  const items = source?.memo?.items;
  if (!Array.isArray(items) || items.length < 2 || items.length > 12) throw fault('Autopilot needs a saved pool of 2–12 candidates.');
  const ids = new Set(items.map(item => item.id));
  const maxCalls = raw.maxCalls ?? 10, maxRounds = raw.maxRounds ?? 12;
  if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 16) throw fault('Choose 0–16 Qloo workflow calls.');
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 16) throw fault('Choose 1–16 research rounds.');
  if (raw.budget !== undefined && (!finite(raw.budget) || raw.budget < 0 || raw.budget > 1e9)) throw fault('Budget must be a number between 0 and 1,000,000,000.');
  for (const field of ['lockedIds', 'excludedIds']) if (raw[field] !== undefined && (!Array.isArray(raw[field]) || raw[field].length > 12 || raw[field].some(id => !ids.has(id)))) throw fault('Locks and exclusions must refer to this candidate pool.');
  const constraints = { ...source.memo.constraints,
    ...(raw.budget !== undefined ? { budget: raw.budget } : {}),
    ...(raw.lockedIds !== undefined ? { lockedIds: unique(raw.lockedIds) } : {}),
    ...(raw.excludedIds !== undefined ? { excludedIds: unique(raw.excludedIds) } : {}) };
  const check = optimizeSlate(items, constraints);
  if (check.status === 'invalid') throw fault(check.reasons.join(' '));
  return { maxCalls, maxRounds, constraints: check.constraints, briefChanged: raw.budget !== undefined || raw.lockedIds !== undefined || raw.excludedIds !== undefined };
}

function cloneItems(items) {
  return items.map(item => ({ ...structuredClone(item),
    evidence: { rank: false, local: false, trends: false, comparison: false, ...(item.evidence ?? {}) },
    evidenceReceipts: { rank: [], local: [], trends: [], comparison: [], ...structuredClone(item.evidenceReceipts ?? {}) },
    receipts: [...(item.receipts ?? [])], culturalLinks: structuredClone(item.culturalLinks ?? []) }));
}

// 1.0 single-gap test: does any one outcome of this gap alone change the choice?
function singleMateriality(items, constraints, id, kind, currentIds) {
  const outcomes = kind === 'trends' ? ['rising', 'cooling'] : [kind === 'local' ? 'local evidence returned' : 'comparison returned'];
  const tested = outcomes.map(outcome => {
    const slate = optimizeSlate(withOutcome(items, id, kind, outcome), constraints);
    return { outcome, selectedIds: slate.selectedIds, feasible: slate.feasible, changed: !same(slate.selectedIds, currentIds) };
  });
  return { material: tested.some(row => row.changed), tested };
}

/**
 * options: research {call, used} (absent = planning), now, mode, emit, policy,
 * seed (random baseline), limits (evaluation only), brief (event metadata),
 * shouldStop() (interruption), callTimeoutMs.
 */
export async function runAutopilot(source, raw = {}, { research = null, now = Date.now, mode = research ? 'live' : 'planning', emit = () => {}, policy = 'value', seed = 1, limits = null, brief = null, shouldStop = () => false, fitBasis = 'affinity' } = {}) {
  const options = autopilotOptions(source, raw);
  if (limits) Object.assign(options, limits);
  if (!POLICIES.includes(policy)) throw fault('Unknown research policy.');
  const memo = source.memo, city = memo.input?.city ?? '', anchorIds = (memo.input?.anchorIds ?? []).filter(id => typeof id === 'string' && id);
  const anchors = memo.input?.anchors ?? [];
  const currency = memo.currency ?? 'GBP', money = moneyFormatter(currency);
  const t0 = now(), events = [], receipts = [], observations = [], history = [], failures = [];
  const items = cloneItems(memo.items);
  // Fit from Qloo affinity scores where every ranked candidate has one ('ordinal'
  // reproduces records captured before affinity fits were introduced).
  const ordinalStart = optimizeSlate(items, memo.constraints);
  let affinity = { basis: 'ordinal-rank', receiptId: null };
  // 'affinity' uses the current fixed-span scale; 'affinity-minmax' replays records
  // captured before it. Both are affinity runs for every other purpose.
  const scale = fitBasis === 'affinity-minmax' ? 'min-max' : 'fixed-span', usesAffinity = fitBasis !== 'ordinal';
  if (usesAffinity) { affinity = withAffinityFit(items, source.receipts ?? [], { scale }); items.splice(0, items.length, ...affinity.items); }
  const nameOf = id => items.find(item => item.id === id)?.name ?? id;
  const names = ids => ids?.length ? ids.map(nameOf).join(' + ') : 'no feasible lineup';
  const record = event => { const row = { at: Math.max(0, now() - t0), ...event }; events.push(row); emit(row); return row; };
  const strategyCache = new Map();
  const attempted = new Map(), notes = { trendsUninterpretable: false, crossCheck: null, partialRank: null };
  const sourceReceipts = new Map((source.receipts ?? []).map(receipt => [receipt.id, receipt]));
  let consecutiveFailures = 0, rounds = 0, interrupted = false;
  const baseConstraints = options.constraints;
  const callsLeft = limit => research ? Math.max(0, limit - research.used()) : PLANNING_CALLS;
  let phaseLimit = options.maxCalls;

  for (const item of items) {
    const trendIds = item.evidenceReceipts.trends ?? [];
    if (!item.evidence.trends && trendIds.some(id => usable(sourceReceipts.get(id)?.status)))
      attempted.set(`trends:${item.id}`, { state: 'uninterpretable', receiptId: trendIds[0], text: `Saved receipt ${trendIds[0]} returned trend data without an interpretable direction for ${item.name}.` });
  }

  // A saved, location-scoped ranking that omitted bookable acts is kept as an
  // explicitly labelled partial order, never merged into fit.
  if (items.some(item => bookable(item) && !item.evidence.rank)) {
    const saved = [...sourceReceipts.values()].filter(row => row.tool === 'rank' && usable(row.status) && row.args?.signal_location).at(-1);
    const order = unique((saved?.evidence?.rows ?? []).map(row => row.id).filter(id => items.some(item => item.id === id && bookable(item))));
    const missingIds = items.filter(item => bookable(item) && !order.includes(item.id)).map(item => item.id);
    if (saved && order.length >= 2 && missingIds.length) {
      const scored = usesAffinity ? fitsFromRankRows(order, saved.evidence.rows, { scale }) : null;
      notes.partialRank = { receiptId: saved.id, scope: 'saved', order, missingIds, ...(scored ? { fits: Object.fromEntries(scored.fits), basis: scored.basis } : {}) };
    }
  }

  const initial = optimizeSlate(items, baseConstraints);
  history.push({ phase: 'brief', selectedIds: initial.selectedIds, feasible: initial.feasible, score: initial.score, totalFee: initial.totalFee, cause: null });
  const basisText = affinity.basis === 'qloo-affinity' ? ` Fit uses Qloo affinity scores [${affinity.receiptId}]${!same(ordinalStart.selectedIds, optimizeSlate(items, memo.constraints).selectedIds) ? `; ordinal rank positions alone would have chosen ${names(ordinalStart.selectedIds)}` : ''}.` : usesAffinity && items.some(item => item.evidence.rank) ? ' Qloo affinity scores are missing for part of the pool, so fit uses ordinal rank positions.' : '';
  record({ type: 'frame', text: `Brief: ${options.constraints.slots} slots for listeners of ${anchors.join(', ') || 'the saved anchors'} in ${city}, ${money(options.constraints.budget)} artist budget, ${items.length} candidates. Starting decision: ${names(initial.selectedIds)}.${basisText}`,
    selectedIds: initial.selectedIds, feasible: initial.feasible, briefChanged: options.briefChanged });

  // Ranking is decision-complete when every bookable act has a comparable rank.
  // Unquoted discoveries cannot be booked, so their absence cannot change a bill.
  const rankComplete = () => items.filter(bookable).every(item => item.evidence.rank === true && finite(item.fit));
  // After an incomplete full-pool ranking, re-rank only the bookable acts in one
  // query: if that query returns them all, their positions are comparable.
  const rankOptions = () => items.some(item => item.rankCoverage?.complete === false) || attempted.get('rank')?.state === 'incomplete'
    ? { scope: 'bookable', ids: items.filter(bookable).map(item => item.id) } : { scope: 'pool', ids: items.map(item => item.id) };
  const answerable = (item, kind) => !(kind === 'comparison' && !anchorIds.length) && !(kind === 'trends' && notes.trendsUninterpretable) && bookable(item);
  const strategyContext = () => ({ money, names, nameOf, crossCheck: notes.crossCheck, partialRank: notes.partialRank, city, receipts: [...sourceReceipts.values(), ...receipts] });

  function questions(contexts) {
    const out = [], current = optimizeSlate(items, baseConstraints);
    const unfixable = !current.feasible && baseConstraints.minimumAverageFit == null;
    const unfixableWhy = 'No lineup satisfies the hard constraints. Cultural evidence cannot change fees, availability or budget, so research would not create a feasible bill.';
    const feasibleCount = () => strategies(items, baseConstraints).margin?.feasibleCount ?? 0;
    if (!rankComplete()) {
      // A full-pool attempt that came back incomplete earns one bookable-only retry.
      const prior = attempted.get('rank'), state = prior && !(prior.state === 'incomplete' && prior.scope === 'pool') ? prior : null;
      out.push({ id: 'rank', kind: 'rank', itemId: null, tier: state ? 'done' : !anchorIds.length ? 'blocked' : unfixable ? 'immaterial' : 'ranking', tool: TOOLS.rank,
        question: `Can every ${items.some(item => item.rankCoverage?.complete === false) ? 'bookable ' : ''}candidate be ranked against ${anchors.join(', ') || 'the anchors'} in ${city}?`,
        why: state ? state.text ?? 'Ranking was requested.' : unfixable && anchorIds.length ? unfixableWhy : anchorIds.length ? `Relative audience fit carries 100 policy points per slot and ${items.filter(item => !item.evidence.rank).length} candidates have no comparable rank. With ${feasibleCount()} feasible lineups, the order can change the choice.` : 'Anchor identities were not saved, so a matched ranking cannot be requested.' });
    } else if (anchorIds.length) {
      const state = attempted.get('crosscheck');
      const bookableCount = items.filter(bookable).length;
      out.push({ id: 'crosscheck', kind: 'crosscheck', itemId: null, tier: state ? 'done' : unfixable ? 'immaterial' : bookableCount > options.constraints.slots ? 'robustness' : 'immaterial', tool: TOOLS.crosscheck,
        question: `Does the audience ranking hold without the ${city} location signal?`,
        why: state ? state.text ?? 'Cross-check was requested.' : unfixable ? unfixableWhy : bookableCount > options.constraints.slots ? `Rank evidence decides the bill (decision margin ${strategies(items, baseConstraints).margin?.points ?? 'n/a'} policy points). A second, location-free ranking of the same pool shows whether the choice depends on the city signal.` : 'Every bookable candidate is already required to fill the slots; a different order cannot change the bill.' });
    }
    // Every evidence gap once, with its best tier across contexts.
    const gaps = new Map();
    for (const item of items) for (const kind of KINDS) {
      if (item.evidence[kind]) continue;
      const id = `${kind}:${item.id}`, existing = attempted.get(id);
      const row = { id, kind, itemId: item.id, name: item.name, tool: TOOLS[kind],
        question: kind === 'local' ? `Is there Qloo geographic evidence for ${item.name} in ${city}?`
          : kind === 'comparison' ? `How does ${item.name}'s audience compare with the anchor audience?`
            : `Does Qloo return an interpretable recent trend direction for ${item.name}?` };
      if (existing) Object.assign(row, { tier: 'done', why: existing.text, receiptId: existing.receiptId });
      else if (kind === 'trends' && notes.trendsUninterpretable) Object.assign(row, { tier: 'immaterial', answerable: false, why: 'Not answerable in practice: earlier trend calls in this run returned no interpretable direction, so further trend queries are not expected to add evidence.' });
      else if (kind === 'comparison' && !anchorIds.length) Object.assign(row, { tier: 'blocked', why: 'Anchor identities were not saved, so an audience comparison cannot be requested.' });
      else if (!bookable(item)) Object.assign(row, { tier: 'blocked', why: `${item.name} has no confirmed or assumed availability and a known fee. Qloo evidence cannot make the act bookable; request a quote first.` });
      else Object.assign(row, { tier: 'immaterial', why: `Tested every combination of possible results: ${item.name}'s ${kind} evidence could not change the recommended, alternative or fallback bills, and the act is not booked in one.` });
      gaps.set(id, row);
    }
    const open = [...gaps.values()].filter(row => row.tier === 'immaterial' && row.answerable !== false);
    const rates = answerRates(observations);
    const upgrade = (row, next) => { if (tierRank(next.tier) < tierRank(row.tier) || (next.tier === row.tier && (next.priority ?? 0) > (row.priority ?? 0))) Object.assign(row, next); };
    for (const context of contexts) {
      const slate = context.id === 'primary' ? current : optimizeSlate(items, context.constraints);
      if (!slate.feasible) continue;
      const analysis = policy === 'value' ? jointMateriality(items, context.constraints, open, { callsLeft: callsLeft(phaseLimit) }) : null;
      for (const row of open) {
        const item = items.find(entry => entry.id === row.itemId), selected = slate.selectedIds.includes(row.itemId);
        if (analysis) {
          const result = analysis.byGap.get(row.id), lead = result.challengers[0];
          if (result.reachable && lead) {
            const partners = lead.partners.map(id => gaps.get(id)?.question?.replace(/\?$/, '') ?? id);
            upgrade(row, { tier: 'material', context: context.id, joint: !result.single, challenger: lead.selectedIds, partners: lead.partners, callsNeeded: lead.cost,
              priority: (lead.needed ? 1 : .5) * (rates[row.kind] ?? .5) / Math.max(1, lead.cost) + (selected ? .25 : 0),
              why: result.single
                ? `If this came back as "${lead.outcome}", the ${context.label} would change from ${names(slate.selectedIds)} to ${names(lead.selectedIds)}.`
                : `Jointly with ${partners.length} other open question(s) (${partners.join('; ')}), favourable results could change the ${context.label} from ${names(slate.selectedIds)} to ${names(lead.selectedIds)}. No single answer is enough; ${lead.cost} call(s) needed, decision margin ${cents(lead.deficit)} points.` });
            continue;
          }
          if (result.material && !result.reachable) {
            const lead2 = result.challengers[0];
            upgrade(row, { tier: 'deferred', context: context.id, callsNeeded: lead2.cost,
              why: `Could change the ${context.label} to ${names(lead2.selectedIds)} only together with ${lead2.partners.length} other answer(s): ${lead2.cost} call(s) needed but ${callsLeft(phaseLimit)} remain in this phase, so a partial answer cannot change the decision.` });
          }
        } else if (policy === 'value-v1') {
          const test = singleMateriality(items, context.constraints, row.itemId, row.kind, slate.selectedIds);
          if (test.material) {
            const changed = test.tested.find(entry => entry.changed);
            upgrade(row, { tier: 'material', context: context.id, priority: selected ? 3 : 2, why: `If this came back as "${changed.outcome}", the ${context.label} would change from ${names(slate.selectedIds)} to ${names(changed.selectedIds)}.` });
            continue;
          }
        }
        if (selected) upgrade(row, { tier: context.id === 'primary' ? 'justification' : 'fallback', context: context.id, priority: context.id === 'primary' ? 2 : 1,
          why: context.id === 'primary' ? `${item.name} is booked in the recommended bill. No result can change the selection, but the packet's cultural justification is incomplete without it.`
            : `${item.name} is in the bill under "${context.label}". No result changes that fallback, but the promoter would book it without this evidence.` });
        else if ((context.focusIds ?? []).includes(row.itemId)) upgrade(row, { tier: 'justification', context: context.id, priority: 1, why: `${item.name} appears in a feasible alternative strategy; this evidence supports comparing it.` });
      }
    }
    out.push(...gaps.values());
    return out.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (b.priority ?? 0) - (a.priority ?? 0) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || String(a.id).localeCompare(String(b.id)));
  }

  function integrate(question, receipt) {
    const status = receipt.status, rows = Array.isArray(receipt.evidence?.rows) ? receipt.evidence.rows : [];
    const results = [];
    if (question.kind === 'rank' || question.kind === 'crosscheck') {
      const requested = question.options ?? { scope: 'pool', ids: items.map(item => item.id) }, known = new Set(requested.ids);
      const order = usable(status) ? unique(rows.map(row => row.id).filter(id => known.has(id))) : [];
      const complete = order.length === requested.ids.length;
      const scored = usesAffinity ? fitsFromRankRows(order, rows, { scale }) : { basis: 'ordinal-rank', fits: new Map(order.map((id, index) => [id, order.length > 1 ? 1 - index / (order.length - 1) : .5])), scores: new Map() };
      const fits = scored.fits;
      const scopeText = requested.scope === 'bookable' ? 'bookable ' : '';
      if (question.kind === 'rank') {
        if (complete) for (const item of items.filter(entry => known.has(entry.id))) {
          item.fit = fits.get(item.id); item.rank = order.indexOf(item.id) + 1; item.of = order.length;
          if (scored.basis === 'qloo-affinity') { item.affinity = scored.scores.get(item.id); item.fitBasis = 'qloo-affinity'; } else { delete item.affinity; item.fitBasis = 'ordinal-rank'; }
          item.evidence.rank = true; item.evidenceReceipts.rank = [receipt.id]; item.receipts = unique([...item.receipts, receipt.id]);
          item.rankCoverage = { complete: true, returned: order.length, requested: requested.ids.length, scope: requested.scope };
        }
        // An incomplete ranking is kept only as an explicit, separately labelled strategy.
        notes.partialRank = complete || order.length < 2 ? null : { receiptId: receipt.id, scope: requested.scope, order, fits: Object.fromEntries(fits), basis: scored.basis, missingIds: requested.ids.filter(id => !order.includes(id)) };
        results.push({ questionId: 'rank', state: complete ? 'resolved' : 'incomplete', text: complete ? `Ranking returned all ${requested.ids.length} ${scopeText}candidates [${receipt.id}]${requested.scope === 'bookable' ? '; positions are comparable among the acts that can be booked' : ''}.` : `Ranking returned ${order.length}/${requested.ids.length} ${scopeText}candidates [${receipt.id}]; comparable fit remains unknown and no order was substituted.` });
      } else {
        let text;
        if (complete) {
          const alternative = items.map(item => known.has(item.id) ? { ...item, fit: fits.get(item.id), evidence: { ...item.evidence, rank: true } } : item);
          const altSlate = optimizeSlate(alternative, baseConstraints), current = optimizeSlate(items, baseConstraints);
          const bookableIds = items.filter(bookable).map(item => item.id);
          const primaryOrder = [...items].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map(item => item.id).filter(id => bookableIds.includes(id));
          const altOrder = order.filter(id => bookableIds.includes(id));
          notes.crossCheck = { receiptId: receipt.id, complete, agrees: same(altSlate.selectedIds, current.selectedIds), selectedIds: altSlate.selectedIds, feasible: altSlate.feasible,
            primaryBookableOrder: primaryOrder, locationFreeBookableOrder: altOrder, sameBookableOrder: primaryOrder.join() === altOrder.join() };
          text = notes.crossCheck.agrees ? `Location-free ranking [${receipt.id}] selects the same bill (${names(altSlate.selectedIds)}); the choice does not hinge on the ${city} signal.`
            : `Location-free ranking [${receipt.id}] would select ${names(altSlate.selectedIds)} instead; the recommendation depends on the ${city} location signal.`;
        } else {
          notes.crossCheck = { receiptId: receipt.id, complete: false, agrees: null, returned: order.length, requested: items.length };
          text = `Location-free ranking returned ${order.length}/${items.length} candidates [${receipt.id}]; the cross-check is inconclusive.`;
        }
        results.push({ questionId: 'crosscheck', state: complete ? 'resolved' : 'incomplete', text });
      }
      return results;
    }
    const targets = question.kind === 'trends' ? question.batch : [question];
    for (const target of targets) {
      const item = items.find(row => row.id === target.itemId);
      let state = 'unavailable', text;
      if (!usable(status)) text = `${TOOLS[target.kind]} for ${item.name} returned ${status} [${receipt.id}]; the gap remains open and nothing was substituted.`;
      else if (target.kind === 'local') {
        if (rows.length) { state = 'resolved'; item.evidence.local = true; item.local = 'yes'; item.evidenceReceipts.local = [receipt.id]; text = `${rows.length} geographic rows returned for ${item.name} within ${city} [${receipt.id}].`; }
        else text = `No geographic rows were returned for ${item.name} within ${city} [${receipt.id}]; local relevance stays unverified.`;
      } else if (target.kind === 'comparison') {
        if (receipt.evidence?.comparisonAvailable === true) {
          state = 'resolved'; item.evidence.comparison = true; item.evidenceReceipts.comparison = [receipt.id];
          const shared = receipt.evidence.interpretable ? receipt.evidence.sharedNames ?? [] : [];
          text = `Audience comparison with the anchors returned for ${item.name} [${receipt.id}]${shared.length ? `; shared tastes include ${shared.slice(0, 4).join(', ')}` : ''}. It does not measure shared ticket buyers.`;
        } else text = `No usable audience comparison returned for ${item.name} [${receipt.id}].`;
      } else {
        const row = rows.find(row => row.id === item.id) ?? rows.find(row => String(row.name ?? '').toLowerCase() === item.name.toLowerCase());
        const direction = row?.direction && row.direction !== 'unknown' ? row.direction : finite(row?.change) ? row.change > 0 ? 'rising' : row.change < 0 ? 'cooling' : 'flat' : 'unknown';
        if (direction !== 'unknown') { state = 'resolved'; item.evidence.trends = true; item.momentum = direction; item.evidenceReceipts.trends = [receipt.id]; text = `Trend direction for ${item.name}: ${direction} [${receipt.id}]. Not an attendance forecast.`; }
        else { state = 'uninterpretable'; text = `Trend data for ${item.name} carried no interpretable direction [${receipt.id}].`; }
      }
      if (state === 'resolved') item.receipts = unique([...item.receipts, receipt.id]);
      attempted.set(target.id, { state, receiptId: receipt.id, text });
      results.push({ questionId: target.id, state, text });
    }
    if (question.kind === 'trends' && usable(status) && results.every(row => row.state !== 'resolved')) notes.trendsUninterpretable = true;
    return results;
  }

  function selectable(list) {
    if (policy === 'value' || policy === 'value-v1') return list.filter(row => EXECUTABLE.has(row.tier));
    // Baselines ignore materiality: every researchable gap is eligible.
    const open = list.filter(row => !['done', 'blocked'].includes(row.tier) && row.kind !== 'crosscheck');
    if (policy === 'fixed-order') {
      const position = row => row.kind === 'rank' ? -1 : items.find(item => item.id === row.itemId)?.rank ?? 99;
      return open.sort((a, b) => position(a) - position(b) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
    }
    const score = row => parseInt(createHash('sha256').update(`${seed}:${row.id}`).digest('hex').slice(0, 8), 16);
    return open.sort((a, b) => score(a) - score(b));
  }

  async function researchPhase(phase, contextsFn, callLimit) {
    phaseLimit = callLimit;
    for (;;) {
      const contexts = contextsFn(), open = selectable(questions(contexts));
      if (!open.length) {
        const unresolved = observations.filter(row => row.phase === phase).flatMap(row => row.results).filter(row => row.state !== 'resolved').length + failures.filter(row => row.phase === phase).length;
        return { stop: unresolved ? 'exhausted' : 'sufficient', pending: [], unresolved };
      }
      if (!research) return { stop: 'planning_only', pending: open };
      if (shouldStop()) { interrupted = true; return { stop: 'interrupted', pending: open }; }
      if (rounds >= options.maxRounds) return { stop: 'round_limit', pending: open };
      if (research.used() >= callLimit) return { stop: 'budget_exhausted', pending: open };
      if (consecutiveFailures >= 2) return { stop: 'provider_unavailable', pending: open };
      rounds++;
      let question = open[0], args;
      if (question.kind === 'trends') {
        question = { ...question, batch: [question, ...open.filter(row => row.kind === 'trends' && row.id !== question.id)].slice(0, 6) };
        args = { entities: question.batch.map(row => row.itemId), entity_type: 'artist', start_date: ago(now(), 180), end_date: ago(now(), 0) };
      } else if (question.kind === 'local') args = { entity: question.itemId, entity_type: 'artist', within: city, limit: 10 };
      else if (question.kind === 'comparison') args = { group_a: anchorIds, group_b: [question.itemId], target_type: 'artist', limit: 10 };
      else if (question.kind === 'rank') { question = { ...question, options: rankOptions() }; args = { options: question.options.ids, option_type: 'artist', signals: anchorIds, signal_location: city }; }
      else { question = { ...question, options: rankOptions() }; args = { options: question.options.ids, option_type: 'artist', signals: anchorIds }; }
      const before = optimizeSlate(items, baseConstraints);
      record({ type: 'action', phase, round: rounds, questionId: question.id, tier: question.tier, tool: question.tool, joint: question.joint === true,
        text: question.kind === 'trends' && question.batch.length > 1 ? `${question.question} (batched for ${question.batch.map(row => row.name).join(', ')})` : question.question, why: question.why });
      const why = `Autopilot ${phase}: ${question.question}`.slice(0, 200);
      const refresh = question.kind === 'rank';
      let receipt;
      try { ({ receipt } = await research.call(question.tool, args, why, { refresh })); }
      catch (error) {
        // A transport exception is not an observation: record the failure, keep the gap open.
        consecutiveFailures++;
        const targets = question.kind === 'trends' ? question.batch : [question];
        for (const target of targets) attempted.set(target.id, { state: 'failed', receiptId: null, text: `The ${question.tool} request for this question failed before returning a receipt; the gap remains open.` });
        failures.push({ round: rounds, phase, questionId: question.id, tool: question.tool, message: String(error?.message ?? 'Request failed').slice(0, 160) });
        record({ type: 'failure', phase, round: rounds, questionId: question.id, tool: question.tool, text: `The ${question.tool} request failed before a receipt was returned. Nothing was recorded as evidence.` });
        continue;
      }
      receipts.push(receipt);
      consecutiveFailures = usable(receipt.status) || receipt.status === 'empty' ? 0 : consecutiveFailures + 1;
      const results = integrate(question, receipt);
      if (question.kind === 'rank') attempted.set('rank', { state: results[0].state, receiptId: receipt.id, text: results[0].text, scope: question.options?.scope ?? 'pool' });
      if (question.kind === 'crosscheck') attempted.set('crosscheck', { state: results[0].state, receiptId: receipt.id, text: results[0].text });
      const after = optimizeSlate(items, baseConstraints);
      const changed = !same(before.selectedIds, after.selectedIds);
      observations.push({ round: rounds, phase, questionId: question.id, receiptId: receipt.id, tool: receipt.tool, status: receipt.status, results, decisionChanged: changed });
      record({ type: 'observation', phase, round: rounds, receiptId: receipt.id, tool: receipt.tool, status: receipt.status, cached: receipt.cached === true, text: results.map(row => row.text).join(' ') });
      if (changed) history.push({ phase, selectedIds: after.selectedIds, feasible: after.feasible, score: after.score, totalFee: after.totalFee, cause: { questionId: question.id, receiptId: receipt.id } });
      record({ type: 'reevaluate', phase, round: rounds, selectedIds: after.selectedIds, changed, text: changed ? `Re-optimized: the decision changed from ${names(before.selectedIds)} to ${names(after.selectedIds)}.` : `Re-optimized: ${names(after.selectedIds)} remains the best feasible bill.` });
    }
  }

  // Phase A: research the decision itself, keeping a reserve for stress follow-up.
  const reserve = (policy === 'value' || policy === 'value-v1') && options.maxCalls >= 4 ? Math.ceil(options.maxCalls / 4) : 0;
  const phaseAContexts = () => {
    const slate = optimizeSlate(items, baseConstraints);
    const strategy = strategies(items, baseConstraints);
    return [{ id: 'primary', label: 'recommended decision', constraints: baseConstraints, focusIds: unique([...slate.selectedIds, ...strategy.list.flatMap(row => row.selectedIds)]) }];
  };
  phaseLimit = options.maxCalls - reserve;
  const initialQuestions = questions(phaseAContexts());
  record({ type: 'questions', phase: 'decision', text: summarizeQuestions(initialQuestions), questions: initialQuestions.map(publicQuestion) });
  const phaseA = await researchPhase('decision', phaseAContexts, options.maxCalls - reserve);
  record({ type: 'stop', phase: 'decision', reason: phaseA.stop, text: stopText(phaseA, options.maxCalls - reserve) });

  // Phase B: strategies and stress against the updated evidence.
  let strategy = strategies(items, baseConstraints), stress = stressTest(items, baseConstraints, strategyContext());
  record({ type: 'strategies', text: strategy.status === 'feasible' ? `${strategy.list.length} distinct feasible strategies: ${strategy.list.map(row => `${row.label} (${names(row.selectedIds)})`).join('; ')}.` : 'No feasible strategy exists under the brief; no lineup is proposed.', strategyIds: strategy.list.map(row => row.id) });
  record({ type: 'stress', text: stress.summary, vulnerabilities: stress.vulnerabilities.length });

  // Phase C: stress scenarios name fallback acts; research their open gaps when
  // that evidence could change the fallback or would justify booking it.
  const stressContexts = stress.contexts ?? [];
  let phaseC = { stop: interrupted ? 'interrupted' : 'not_needed', pending: [] };
  phaseLimit = options.maxCalls;
  const followupOpen = interrupted ? [] : questions([...phaseAContexts(), ...stressContexts]).filter(row => EXECUTABLE.has(row.tier));
  if ((policy === 'value' || policy === 'value-v1') && stressContexts.length && followupOpen.length) {
    record({ type: 'followup', text: `Stress tests named fallback bills. ${followupOpen.length} open evidence question(s) concern them or remain from the decision phase.`, questions: followupOpen.map(publicQuestion) });
    const beforeStress = stress;
    phaseC = await researchPhase('stress-followup', () => [...phaseAContexts(), ...stressContexts], options.maxCalls);
    record({ type: 'stop', phase: 'stress-followup', reason: phaseC.stop, text: stopText(phaseC, options.maxCalls) });
    if (observations.some(row => row.phase === 'stress-followup')) {
      strategy = strategies(items, baseConstraints); stress = stressTest(items, baseConstraints, strategyContext());
      const changedFallbacks = stress.cancellations.filter(row => { const old = beforeStress.cancellations.find(prior => prior.canceledId === row.canceledId); return old && !same(old.selectedIds, row.selectedIds); });
      record({ type: 'reevaluate', phase: 'stress-followup', changed: changedFallbacks.length > 0, text: changedFallbacks.length ? `Follow-up evidence changed ${changedFallbacks.length} cancellation fallback(s).` : 'Follow-up evidence did not change any fallback bill; it completes the justification for booking them.' });
    }
  } else record({ type: 'stop', phase: 'stress-followup', reason: phaseC.stop, text: interrupted ? 'The run was interrupted; stress follow-up was not attempted.' : stressContexts.length ? `Stress tests named ${unique(stressContexts.flatMap(row => row.focusIds)).length} act(s) across fallback bills; none has an open, researchable evidence gap, so no follow-up call is needed.` : 'No fallback bill exists to research.' });

  const final = optimizeSlate(items, baseConstraints);
  const finalQuestions = questions([...phaseAContexts(), ...stressContexts]);
  const status = interrupted || phaseA.stop === 'provider_unavailable' || phaseC.stop === 'provider_unavailable' ? 'partial' : 'complete';
  const outputItems = items.map(({ id, name, found, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms, rankCoverage, affinity: score, fitBasis: basis }) => ({ id, name, found: found === true, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms, rankCoverage, ...(usesAffinity ? { affinity: score ?? null, fitBasis: basis ?? null } : {}) }));
  const ties = tieSensitivity(items, baseConstraints), comparability = rankComparability(items);
  const result = { version: AUTOPILOT_VERSION, policy, status, mode, city, currency, constraints: baseConstraints, briefChanged: options.briefChanged,
    ...(usesAffinity ? { fitBasis: affinity.basis === 'qloo-affinity' ? 'qloo-affinity' : 'ordinal-rank', ...(scale === 'fixed-span' ? { fitScale: 'fixed-span-0.05' } : {}), ties, comparability, ordinalStartIds: ordinalStart.selectedIds } : {}),
    budget: { maxCalls: options.maxCalls, reserveForStress: reserve, used: research ? research.used() : 0, maxRounds: options.maxRounds, rounds },
    stop: { decision: phaseA.stop, followup: phaseC.stop }, history, events, receipts, observations, failures,
    questions: finalQuestions.map(publicQuestion), strategies: strategy, stress: publicStress(stress), crossCheck: notes.crossCheck,
    items: outputItems,
    interpretation: 'Deterministic research policy over the exact optimizer. Policy points are an internal objective, not ticket demand, attendance or revenue. Fees and availability are buyer inputs.' };
  // The decision digest covers every decision-relevant input, including the
  // numerical content of each receipt (via its content digest).
  result.digest = sha256({ version: result.version, policy, ...(usesAffinity ? { fitBasis: result.fitBasis } : {}), ...(result.fitScale ? { fitScale: result.fitScale } : {}), constraints: result.constraints,
    items: outputItems.map(({ id, fit, rank, of, local, momentum, evidence, terms }) => ({ id, fit, rank, of, local, momentum, evidence, terms })),
    history: history.map(({ phase, selectedIds, cause }) => ({ phase, selectedIds, cause })),
    actions: events.filter(row => row.type === 'action').map(({ questionId, tool }) => ({ questionId, tool })),
    receipts: receipts.map(row => ({ id: row.id, contentDigest: receiptContentDigest(row) })),
    observations: observations.map(({ questionId, receiptId, results }) => ({ questionId, receiptId, results })),
    failures: failures.map(({ questionId, tool }) => ({ questionId, tool })),
    recommendation: final.selectedIds, strategies: strategy.list.map(row => [row.id, row.selectedIds]), stop: result.stop });
  result.integrity = buildManifest({ receipts, sourceReceipts: [...sourceReceipts.values()], decisionDigest: result.digest, items: outputItems });
  result.packet = buildPacket();
  record({ type: 'packet', text: `Decision packet ready: ${final.feasible ? names(final.selectedIds) : 'no feasible lineup'}; ${result.packet.actions.length} next actions.` });
  return result;

  function summarizeQuestions(list) {
    const count = tier => list.filter(row => row.tier === tier).length;
    const joint = list.filter(row => row.tier === 'material' && row.joint).length;
    return `${list.length} evidence questions identified: ${count('material')} could change the decision${joint ? ` (${joint} only in combination with other answers)` : ''}, ${count('ranking') + count('robustness')} test the ranking, ${count('justification') + count('fallback')} justify booked acts, ${count('deferred')} need more calls than the budget allows, ${count('immaterial')} cannot change any strategy, ${count('blocked')} are blocked by missing commercial inputs or identities, ${count('done')} already answered by saved receipts.`;
  }
  function stopText(state, limit) {
    const pending = state.pending?.length ?? 0;
    return {
      sufficient: 'Stopped: every remaining gap was tested against the optimizer. None can change a recommended or fallback bill, or it has already been researched.',
      planning_only: `No provider calls in this mode. ${pending} question(s) would be researched next, in the order listed.`,
      budget_exhausted: `Stopped: ${limit} Qloo workflow call(s) allowed for this phase are spent; ${pending} decision-relevant question(s) remain open.`,
      round_limit: `Stopped at the ${options.maxRounds}-round limit; ${pending} question(s) remain open.`,
      exhausted: `Stopped: every decision-relevant question was attempted. ${state.unresolved} answer(s) returned errors or no usable evidence; those gaps stay open and nothing was substituted.`,
      not_needed: 'No stress follow-up was needed: stress scenarios named no fallback act with an open, researchable evidence gap.',
      provider_unavailable: `Stopped after consecutive provider failures; ${pending} question(s) remain open and nothing was substituted. The run is marked partial.`,
      interrupted: `The run was interrupted before completion; ${pending} question(s) remain open. Results so far are kept and marked partial.`,
    }[state.stop] ?? state.stop;
  }

  function strategies(pool, constraints) {
    const cacheKey = JSON.stringify([constraints, notes.crossCheck?.receiptId ?? null, notes.partialRank?.receiptId ?? null, pool.map(item => [item.id, item.fit, item.local, item.momentum, item.evidence, item.terms])]);
    if (!strategyCache.has(cacheKey)) strategyCache.set(cacheKey, computeStrategies(pool, constraints, strategyContext()));
    return structuredClone(strategyCache.get(cacheKey));
  }

  function publicStress(value) { const { contexts, ...rest } = value; return { ...rest, contexts: (contexts ?? []).map(({ id, label, focusIds }) => ({ id, label, focusIds })) }; }

  function termStatus(item) {
    const terms = item.terms ?? {}, illustrative = memo.exampleBookingTerms === true;
    const feeStatus = terms.feeStatus ?? (finite(terms.fee) ? (illustrative ? 'illustrative' : 'entered') : 'unknown');
    const availability = terms.availabilityStatus ?? (illustrative ? (terms.available ? 'illustrative' : 'unconfirmed') : terms.available ? 'confirmed' : 'unconfirmed');
    return { feeStatus, availability, needsConfirmation: feeStatus !== 'quoted' || availability !== 'confirmed' };
  }

  function buildPacket() {
    const slate = optimizeSlate(items, baseConstraints);
    const allReceipts = new Map([...sourceReceipts, ...receipts.map(row => [row.id, row])]);
    const receiptRef = id => { const row = allReceipts.get(id); return row ? { id, tool: row.tool, status: row.status, source: row.source ?? 'unknown', fetchedAt: row.fetchedAt ?? null, new: receipts.some(r => r.id === id) } : { id, missing: true }; };
    const claimsFor = item => {
      const claims = [];
      if (item.evidence.rank && finite(item.affinity)) claims.push({ text: `Qloo affinity ${item.affinity.toFixed(4)} with ${anchors.join(', ') || 'the anchors'} in ${city} (${item.rank} of ${item.of}${item.rankCoverage?.scope === 'bookable' ? ' bookable' : ''} candidates). Relative cultural fit, not demand.`, receipts: item.evidenceReceipts.rank.map(receiptRef) });
      else if (item.evidence.rank) claims.push({ text: `Ranks ${item.rank} of ${item.of} ${item.rankCoverage?.scope === 'bookable' ? 'bookable ' : ''}candidates against ${anchors.join(', ') || 'the anchors'} in ${city}. Relative order, not demand.`, receipts: item.evidenceReceipts.rank.map(receiptRef) });
      else claims.push({ text: 'No comparable audience rank; fit is unknown.', receipts: [] });
      if (item.evidence.local) claims.push({ text: `Qloo returned geographic popularity rows within ${city}.`, receipts: item.evidenceReceipts.local.map(receiptRef) });
      if (item.evidence.comparison) claims.push({ text: 'An aggregate audience comparison with the anchors was returned. It does not measure shared ticket buyers.', receipts: item.evidenceReceipts.comparison.map(receiptRef) });
      if (item.evidence.trends) claims.push({ text: `Observed trend direction: ${item.momentum}.`, receipts: item.evidenceReceipts.trends.map(receiptRef) });
      return claims;
    };
    const gaps = finalQuestions.filter(row => row.tier !== 'done' || ['unavailable', 'uninterpretable', 'incomplete', 'failed'].includes(attempted.get(row.id)?.state)).map(row => ({
      question: row.question, artistId: row.itemId, status: row.tier === 'done' ? `researched: ${attempted.get(row.id)?.state}` : EXECUTABLE.has(row.tier) ? `open (${row.tier})` : row.tier, why: row.why })).slice(0, 40);
    const recommended = strategy.list[0];
    const roles = new Map();
    for (const row of strategy.list) for (const id of row.selectedIds) if (!roles.has(id)) roles.set(id, row.id === 'cultural-fit' ? 'recommended' : 'alternative');
    for (const backup of strategy.backups ?? []) for (const option of backup.options) for (const id of option.replacementIds) if (!roles.has(id)) roles.set(id, 'backup');
    const questionById = new Map(finalQuestions.map(row => [row.id, row]));
    const cellFor = (item, kind) => {
      if (kind === 'rank') return item.evidence.rank ? { label: `Measured: ${finite(item.affinity) ? `affinity ${item.affinity.toFixed(4)}, ` : ''}${item.rank}/${item.of}`, receipts: item.evidenceReceipts.rank ?? [] } : { label: 'Missing: no comparable rank', receipts: [] };
      if (item.evidence[kind]) return { label: kind === 'trends' ? `Measured: ${item.momentum}` : 'Measured', receipts: item.evidenceReceipts[kind] ?? [] };
      const state = attempted.get(`${kind}:${item.id}`), question = questionById.get(`${kind}:${item.id}`);
      if (state) return { label: state.state === 'failed' ? 'Missing: request failed' : `Missing: researched, ${state.state === 'uninterpretable' ? 'no interpretable result' : 'no usable result'}`, receipts: state.receiptId ? [state.receiptId] : [] };
      const reason = { immaterial: 'not researched (could not change a strategy)', blocked: 'not answerable by Qloo here', deferred: 'not researched (needs more calls than budget)' }[question?.tier] ?? (EXECUTABLE.has(question?.tier) ? 'open question' : 'not researched');
      return { label: `Missing: ${reason}`, receipts: [] };
    };
    const evidenceMatrix = [...roles].map(([id, role]) => { const item = items.find(row => row.id === id); return { id, name: item.name, role, cells: Object.fromEntries(['rank', ...KINDS].map(kind => [kind, cellFor(item, kind)])) }; });
    const termIds = unique([...roles.keys(), ...items.filter(item => !bookable(item) && item.evidence.rank).map(item => item.id)]);
    const terms = termIds.map(id => { const item = items.find(row => row.id === id), status = termStatus(item); return { id, name: item.name, fee: finite(item.terms?.fee) ? item.terms.fee : null, ...status, role: roles.get(id) ?? 'quote lead' }; });
    const confirmations = terms.filter(row => row.needsConfirmation && roles.has(row.id)).map(row => `${row.name}: ${row.feeStatus === 'unknown' ? 'fee unknown' : `fee ${money(row.fee)} (${row.feeStatus})`}; availability ${row.availability}.`);
    const commercialInput = brief?.commercial ?? null;
    let commercial = null;
    if (commercialInput && (finite(commercialInput.ticketPrice) || finite(commercialInput.capacity))) {
      const otherCosts = finite(commercialInput.otherCosts) ? commercialInput.otherCosts : 0, total = slate.feasible ? cents(slate.totalFee + otherCosts) : null;
      const breakEvenTickets = total != null && finite(commercialInput.ticketPrice) && commercialInput.ticketPrice > 0 ? Math.ceil(total / commercialInput.ticketPrice) : null;
      commercial = { capacity: finite(commercialInput.capacity) ? commercialInput.capacity : null, ticketPrice: finite(commercialInput.ticketPrice) ? commercialInput.ticketPrice : null, otherCosts, totalCost: total, breakEvenTickets,
        breakEvenShare: breakEvenTickets != null && finite(commercialInput.capacity) && commercialInput.capacity > 0 ? cents(breakEvenTickets / commercialInput.capacity * 100) : null,
        label: 'Promoter-entered assumptions. Break-even is arithmetic, not a demand forecast.' };
    }
    const actions = [];
    const push = (type, text) => actions.push({ priority: actions.length + 1, type, text });
    if (slate.feasible) {
      push('approval', `Approve ${names(slate.selectedIds)} as the planning bill (${money(slate.totalFee)} against ${money(baseConstraints.budget)}) before any hold request is sent. Houselights has not contacted any agent.`);
      const toConfirm = terms.filter(row => slate.selectedIds.includes(row.id) && row.needsConfirmation);
      if (toConfirm.length) push('confirm', `Confirm fee and availability for ${toConfirm.map(row => row.name).join(' and ')}; the recommendation assumes the values in section 5.`);
      for (const row of stress.breakpoints.filter(row => row.type === 'fee')) push('recommendation', `Negotiate ${nameOf(row.artistId)} at or below ${money(row.maximumFee)}; above that the bill changes to ${row.nextFeasible ? names(row.nextSelectedIds) : 'no feasible lineup'}.`);
      for (const backup of strategy.backups ?? []) if (backup.options[0]) push('confirm', `Pre-clear ${names(backup.options[0].replacementIds)} as the backup for ${nameOf(backup.artistId)}: confirm availability and fee.`);
      for (const row of stress.cancellations.filter(row => !row.feasible)) push('recommendation', `No clean backup exists for ${nameOf(row.canceledId)}; quote additional candidates before committing.`);
    } else push('approval', 'No lineup satisfies this brief. Decide which constraint to relax (see the infeasibility reasons) or add quoted candidates; nothing was booked.');
    if (notes.crossCheck?.complete && !notes.crossCheck.agrees && slate.feasible) push('approval', `Decide how local the audience is: the ${city}-weighted ranking supports ${names(slate.selectedIds)}; a location-free Qloo ranking [${notes.crossCheck.receiptId}] supports ${names(notes.crossCheck.selectedIds)}.`);
    if (notes.partialRank && slate.feasible) {
      const unranked = notes.partialRank.missingIds.filter(id => bookable(items.find(item => item.id === id)));
      if (unranked.length) push('approval', `Decide whether to keep ${names(unranked)} in contention: Qloo returned no rank for ${unranked.length === 1 ? 'this act' : 'these acts'} against your reference artists [${notes.partialRank.receiptId}], so the recommendation is provisional. The "best among ranked acts" strategy shows the bill without ${unranked.length === 1 ? 'it' : 'them'}.`);
    }
    // Near-ties: a bill that changes when tied acts are treated as equal is flagged.
    const tieGroups = ties.groups.filter(group => group.affectsBill || group.changesBill);
    const tieFindings = ties.groups.filter(group => group.changesBill).map(group => ({ type: 'near_tie', severity: 'high', ids: group.ids,
      text: `The bill rests on a near-tie: ${group.names.join(', ')} are within ${group.spread.toFixed(4)} Qloo affinity of each other (band ${TIE_BAND}). Treating them as tied gives ${names(group.tiedSelectedIds)}.` }));
    if (tieFindings.length && slate.feasible) push('approval', `Choose between near-tied acts: ${tieFindings.map(row => row.text).join(' ')} Qloo scores cannot separate them; decide on fee, availability or programming fit.`);
    const quoteLeads = items.filter(item => !bookable(item) && item.evidence.rank).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3).map(item => ({ ...entryFee(item), id: item.id, name: item.name, rank: item.rank, of: item.of }));
    for (const lead of quoteLeads) if (lead.maximumFee != null) push('recommendation', `Request a quote from ${lead.name} (rank ${lead.rank}/${lead.of}): if available at or below ${money(lead.maximumFee)}, the optimizer would book them as ${names(lead.selectedIds)}. This is a hypothetical ceiling, not a quote.`);
    const openMaterial = finalQuestions.filter(row => row.tier === 'material' || row.tier === 'deferred');
    if (openMaterial.length) push('recommendation', `Resolve ${openMaterial.length} open decision-relevant evidence question(s) before booking: ${openMaterial.slice(0, 3).map(row => row.question).join(' ')}`);
    const changed = !same(history[0].selectedIds, slate.selectedIds);
    const researched = observations.length;
    const researchVerdict = status === 'partial' ? `Partial run (${result.stop.decision === 'interrupted' || result.stop.followup === 'interrupted' ? 'interrupted' : 'provider unavailable'}): ${researched} research action(s) returned before stopping. Open questions are listed; nothing was substituted.`
      : !researched ? (research ? 'No research action was needed: no open gap could change a strategy or justify a booked act.' : 'Planning mode: no research was executed; the open questions are listed in priority order.')
        : changed ? `Research changed the decision from ${names(history[0].selectedIds)} to ${names(slate.selectedIds)} (${history.filter(row => row.cause).map(row => `${row.cause.questionId} via ${row.cause.receiptId}`).join('; ')}).`
          : `${researched} research action(s) returned; the decision did not change because ${strategy.margin?.points != null ? `the winning margin is ${strategy.margin.points} policy points and ` : ''}no combination of tested outcomes could alter the selection. The new evidence completes the justification for booked and fallback acts.`;
    const why = slate.feasible && recommended ? `${recommended.preferWhen} ${strategy.robustNote ?? ''}`.trim() : null;
    const packet = {
      version: AUTOPILOT_VERSION, title: `${brief?.name ?? city} booking decision`, mode, status, generatedAt: new Date(now()).toISOString(), currency,
      brief: { name: brief?.name ?? null, city, venue: brief?.venue ?? null, date: brief?.date ?? null, direction: brief?.direction ?? null, audience: brief?.audience ?? null, objectives: brief?.objectives ?? [],
        anchors, budget: baseConstraints.budget, slots: baseConstraints.slots, maxPerGenre: baseConstraints.maxPerGenre, discoveryMin: baseConstraints.discoveryMin,
        locked: baseConstraints.lockedIds.map(nameOf), excluded: baseConstraints.excludedIds.map(nameOf), lockedIds: baseConstraints.lockedIds, excludedIds: baseConstraints.excludedIds, candidates: items.length, briefChanged: options.briefChanged },
      recommendation: slate.feasible ? { provisional: slate.status === 'provisional' || !comparability.comparable, provisionalReason: !comparability.comparable ? comparability.reason : slate.status === 'provisional' ? `${names(slate.confidence?.missingFitIds ?? [])} ${(slate.confidence?.missingFitIds ?? []).length === 1 ? 'has' : 'have'} no comparable Qloo rank, so cultural fit is unknown for part of this bill.` : null,
        restsOnNearTie: ties.restsOnNearTie, strategyId: recommended?.id, selectedIds: slate.selectedIds, names: slate.selectedIds.map(nameOf), totalFee: slate.totalFee, headroom: slate.remainingBudget, policyScore: cents(slate.score), robustness: recommended?.robustness ?? null, status: slate.status, why,
        artists: slate.selectedIds.map(id => { const item = items.find(row => row.id === id); return { id, name: item.name, fee: item.terms.fee, genre: item.terms.genre || null, ...termStatus(item), claims: claimsFor(item) }; }) } : null,
      infeasibility: slate.feasible ? null : { reasons: slate.reasons, relaxations: slate.diagnostics?.relaxations ?? null },
      strategies: strategy.list.map(row => ({ id: row.id, label: row.label, names: row.selectedIds.map(nameOf), selectedIds: row.selectedIds, totalFee: row.totalFee, score: row.score, scoreGap: row.scoreGap, feeDelta: row.feeDelta, robustness: row.robustness, cancellationCoverage: row.cancellationCoverage, evidenceCompleteness: row.evidenceCompleteness, rationale: row.rationale, preferWhen: row.preferWhen })),
      alternatives: strategy.list.slice(1).map(row => ({ id: row.id, label: row.label, names: row.selectedIds.map(nameOf), selectedIds: row.selectedIds, totalFee: row.totalFee, scoreGap: row.scoreGap, feeDelta: row.feeDelta, robustness: row.robustness, tradeoff: row.rationale, preferWhen: row.preferWhen })),
      robustNote: strategy.robustNote ?? null, robustnessDefinition: strategy.robustnessDefinition ?? null,
      backups: (strategy.backups ?? []).map(row => ({ artistId: row.artistId, name: nameOf(row.artistId), options: row.options.map(option => ({ ...option, names: option.selectedIds.map(nameOf) })) })),
      terms, confirmations,
      financial: { artistBudget: baseConstraints.budget, plannedFees: slate.feasible ? slate.totalFee : null, headroom: slate.feasible ? slate.remainingBudget : null, breakpoints: stress.breakpoints, commercial },
      assumptions: [
        mode === 'synthetic' ? 'SYNTHETIC QLOO DATA: development fixtures, not real cultural evidence.' : null,
        memo.exampleBookingTerms === true ? 'Fees, availability and genres are illustrative booking inputs from the published brief, not real quotes.' : 'Fees, availability and genres are promoter-entered inputs; their status (quoted, estimate, assumed) is shown in section 5.',
        'Qloo supplies aggregate cultural affinity. It does not supply fees, availability, ticket demand, attendance or revenue.',
        'Policy points (fit 100/slot, local +2, rising +3, cooling −2, genre breadth, evidence penalty) are an internal objective, not a forecast.',
        'Fit is relative rank position within this candidate pool.',
        brief?.unresolved?.length ? `Not resolved by Qloo, so not considered in this decision: ${brief.unresolved.join(', ')}. Correct or disambiguate the name and research again.` : null,
      ].filter(Boolean),
      research: { policy, questionsConsidered: initialQuestions.length, actionsExecuted: researched, callsUsed: research ? research.used() : 0, callBudget: options.maxCalls,
        stop: result.stop, decisionChanged: changed, verdict: researchVerdict, crossCheck: notes.crossCheck, failures: failures.length },
      evidenceMatrix, evidenceGaps: gaps,
      fitBasis: result.fitBasis ?? 'ordinal-rank', ...(result.fitScale ? { fitScale: result.fitScale } : {}), comparability,
      ordinalComparison: result.fitBasis === 'qloo-affinity' && !same(ordinalStart.selectedIds, initial.selectedIds) ? { ordinalNames: ordinalStart.selectedIds.map(nameOf), affinityNames: initial.selectedIds.map(nameOf),
        text: `Ranked by ordinal positions alone, the starting bill would be ${names(ordinalStart.selectedIds)}; with Qloo affinity scores it is ${names(initial.selectedIds)}. The difference comes from score gaps that ordinal ranks exaggerate.` } : null, ties: { band: ties.band, restsOnNearTie: ties.restsOnNearTie, groups: tieGroups.map(({ names: groupNames, spread, scores, changesBill, tiedSelectedIds }) => ({ names: groupNames, spread, scores, changesBill, tiedNames: tiedSelectedIds.map(nameOf) })) },
      robustness: { summary: stress.summary, vulnerabilities: [...tieFindings, ...stress.vulnerabilities], breakpoints: stress.breakpoints, evidence: stress.evidence },
      quoteLeads, actions, nextSteps: actions.map(row => row.text),
      receiptIndex: unique([...items.flatMap(item => Object.values(item.evidenceReceipts).flat()), ...receipts.map(row => row.id)]).filter(id => allReceipts.has(id))
        .map(id => { const row = allReceipts.get(id), isNew = receipts.some(entry => entry.id === id); return { id, tool: row.tool, status: row.status, source: row.source ?? 'unknown', fetchedAt: row.fetchedAt ?? null, new: isNew, contentDigest: isNew ? receiptContentDigest(row) : sha256(row) }; }),
      integrity: { manifestDigest: result.integrity.manifestDigest, statement: 'Receipt content digests let anyone detect later edits to this record. They do not prove the responses came from Qloo; Qloo responses are unsigned.' },
      limits: 'Planning analysis only: no booking, offer or approval was created. Verify every fee and availability with agents before acting.',
    };
    packet.markdown = packetMarkdown(packet, money);
    return packet;
  }

  function entryFee(item) {
    const hypothetical = fee => optimizeSlate(items.map(row => row.id === item.id ? { ...row, terms: { ...row.terms, fee, available: true } } : row), baseConstraints);
    const atZero = hypothetical(0);
    if (!atZero.selectedIds.includes(item.id)) return { maximumFee: null, selectedIds: [] };
    let low = 0, high = Math.max(0, baseConstraints.budget);
    if (hypothetical(high).selectedIds.includes(item.id)) return { maximumFee: high, selectedIds: hypothetical(high).selectedIds, hypothetical: true };
    for (let index = 0; index < 40 && high - low > .01; index++) { const mid = cents((low + high) / 2); if (hypothetical(mid).selectedIds.includes(item.id)) low = mid; else high = mid; }
    return { maximumFee: low, selectedIds: hypothetical(low).selectedIds, hypothetical: true };
  }
}

function publicQuestion(row) {
  const { batch, ...rest } = row;
  return rest;
}

export { publicReceipt };
