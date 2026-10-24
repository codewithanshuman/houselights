// Houselights Autopilot: brief → evidence-gap research → strategies → stress → packet.
// The research policy is deterministic value-of-information planning: every
// open evidence gap is tested against the exact optimizer before a Qloo call is
// spent. Observations come only from executed tool receipts; nothing is imputed.
import { createHash } from 'node:crypto';
import { optimizeSlate, enumerateSlates, evaluateSelection } from './optimizer.mjs';
import { buildContingencyPlan } from './contingency.mjs';
import { buildDecisionProof } from './decision-proof.mjs';

export const AUTOPILOT_VERSION = '1.0';
const KINDS = ['local', 'comparison', 'trends'];
const TOOLS = { local: 'where_popular', comparison: 'compare_audiences', trends: 'trends', rank: 'rank', crosscheck: 'rank' };
// An incomplete ranking comes first: fit carries 100 points per slot, so per-artist
// materiality tested while every fit is unknown is not reliable.
const TIER_ORDER = { ranking: 0, material: 1, robustness: 2, justification: 3, fallback: 4 };
const EXECUTABLE = new Set(Object.keys(TIER_ORDER));
const usable = status => ['ok', 'partial', 'degraded'].includes(status);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
const key = ids => [...ids].sort().join('\0');
const same = (a, b) => key(a) === key(b);
const unique = values => [...new Set(values)];
const ago = (now, days) => new Date(now - days * 864e5).toISOString().slice(0, 10);
const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const bookable = item => item.terms?.available === true && finite(item.terms?.fee) && item.terms.fee >= 0;

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

function withOutcome(items, id, kind, outcome) {
  return items.map(item => {
    if (item.id !== id) return item;
    const copy = { ...item, evidence: { ...item.evidence, [kind]: true } };
    if (kind === 'local') copy.local = 'yes';
    if (kind === 'trends') copy.momentum = outcome;
    return copy;
  });
}

// Every possible favourable or unfavourable observation is tested against the
// exact optimizer. A gap is material only if some outcome changes the choice.
function materiality(items, constraints, id, kind, currentIds) {
  const outcomes = kind === 'trends' ? ['rising', 'cooling'] : [kind === 'local' ? 'local evidence returned' : 'comparison returned'];
  const tested = outcomes.map(outcome => {
    const slate = optimizeSlate(withOutcome(items, id, kind, outcome), constraints);
    return { outcome, selectedIds: slate.selectedIds, feasible: slate.feasible, score: slate.score, changed: !same(slate.selectedIds, currentIds) };
  });
  return { material: tested.some(row => row.changed), tested };
}

function margin(items, constraints) {
  const rows = enumerateSlates(items, constraints).filter(row => row.feasible).sort((a, b) => b.rawScore - a.rawScore || a.totalFee - b.totalFee);
  if (rows.length < 2) return { feasibleCount: rows.length, points: null, runnerUpIds: [] };
  return { feasibleCount: rows.length, points: cents(rows[0].rawScore - rows[1].rawScore), runnerUpIds: rows[1].selectedIds };
}

// policy: 'value' is the product. 'fixed-order' (top-ranked artists first, as the
// original memo agent does) and 'random' exist only as evaluation baselines.
export async function runAutopilot(source, raw = {}, { research = null, now = Date.now, mode = research ? 'live' : 'planning', emit = () => {}, policy = 'value', seed = 1, limits = null } = {}) {
  const options = autopilotOptions(source, raw);
  if (limits) Object.assign(options, limits);
  if (!['value', 'fixed-order', 'random'].includes(policy)) throw fault('Unknown research policy.');
  const memo = source.memo, city = memo.input?.city ?? '', anchorIds = (memo.input?.anchorIds ?? []).filter(id => typeof id === 'string' && id);
  const anchors = memo.input?.anchors ?? [];
  const currency = memo.currency ?? 'GBP';
  const money = value => finite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value) : 'unknown';
  const t0 = now(), events = [], receipts = [], observations = [], history = [];
  const items = cloneItems(memo.items);
  const nameOf = id => items.find(item => item.id === id)?.name ?? id;
  const names = ids => ids.length ? ids.map(nameOf).join(' + ') : 'no feasible lineup';
  const record = event => { const row = { at: Math.max(0, now() - t0), ...event }; events.push(row); emit(row); return row; };
  // Strategies depend only on evidence state and constraints; questions() asks often.
  const strategyCache = new Map();
  const attempted = new Map(), notes = { trendsUninterpretable: false, crossCheck: null, rankRetried: false };
  const sourceReceipts = new Map((source.receipts ?? []).map(receipt => [receipt.id, receipt]));
  let consecutiveFailures = 0, rounds = 0;
  const baseConstraints = options.constraints;

  // Gaps already answered by a usable saved receipt without a usable measurement
  // are not re-queried with identical arguments; that would add no evidence.
  for (const item of items) {
    const trendIds = item.evidenceReceipts.trends ?? [];
    if (!item.evidence.trends && trendIds.some(id => usable(sourceReceipts.get(id)?.status)))
      attempted.set(`trends:${item.id}`, { state: 'uninterpretable', receiptId: trendIds[0], text: `Saved receipt ${trendIds[0]} returned trend data without an interpretable direction for ${item.name}.` });
  }

  const initial = optimizeSlate(items, baseConstraints);
  history.push({ phase: 'brief', selectedIds: initial.selectedIds, feasible: initial.feasible, score: initial.score, totalFee: initial.totalFee, cause: null });
  record({ type: 'frame', text: `Brief: ${options.constraints.slots} slots for listeners of ${anchors.join(', ') || 'the saved anchors'} in ${city}, ${money(options.constraints.budget)} artist budget, ${items.length} candidates. Starting decision: ${names(initial.selectedIds)}.`,
    selectedIds: initial.selectedIds, feasible: initial.feasible, briefChanged: options.briefChanged });

  const rankComplete = () => items.every(item => item.evidence.rank === true && finite(item.fit));
  const contextsFor = (slateIds, extra = []) => [{ id: 'primary', label: 'recommended decision', constraints: baseConstraints, focusIds: slateIds }, ...extra];

  function questions(contexts) {
    const out = [], current = optimizeSlate(items, baseConstraints);
    // Evidence cannot repair fees, availability or budget. Only a fit floor makes
    // feasibility itself depend on ranking.
    const unfixable = !current.feasible && baseConstraints.minimumAverageFit == null;
    const unfixableWhy = 'No lineup satisfies the hard constraints. Cultural evidence cannot change fees, availability or budget, so research would not create a feasible bill.';
    if (!rankComplete()) {
      const state = attempted.get('rank');
      out.push({ id: 'rank', kind: 'rank', itemId: null, tier: state ? 'done' : !anchorIds.length ? 'blocked' : unfixable ? 'immaterial' : 'ranking', tool: TOOLS.rank,
        question: `Can every candidate be ranked against ${anchors.join(', ') || 'the anchors'} in ${city}?`,
        why: unfixable && anchorIds.length ? unfixableWhy : anchorIds.length ? `Relative audience fit carries 100 policy points per slot and ${items.filter(item => !item.evidence.rank).length} candidates have no comparable rank. With ${margin(items, baseConstraints).feasibleCount} feasible lineups, the order can change the choice.` : 'Anchor identities were not saved, so a matched ranking cannot be requested.' });
    } else if (anchorIds.length) {
      const state = attempted.get('crosscheck');
      const bookableCount = items.filter(bookable).length;
      out.push({ id: 'crosscheck', kind: 'crosscheck', itemId: null, tier: state ? 'done' : unfixable ? 'immaterial' : bookableCount > options.constraints.slots ? 'robustness' : 'immaterial', tool: TOOLS.crosscheck,
        question: `Does the audience ranking hold without the ${city} location signal?`,
        why: unfixable ? unfixableWhy : bookableCount > options.constraints.slots ? `Rank evidence decides the bill (decision margin ${margin(items, baseConstraints).points ?? 'n/a'} policy points). A second, location-free ranking of the same pool shows whether the choice depends on the city signal.` : 'Every bookable candidate is already required to fill the slots; a different order cannot change the bill.' });
    }
    const seen = new Set();
    for (const context of contexts) {
      const slate = context.id === 'primary' ? current : optimizeSlate(items, context.constraints);
      for (const item of items) for (const kind of KINDS) {
        if (item.evidence[kind]) continue;
        const id = `${kind}:${item.id}`;
        const existing = attempted.get(id);
        if (seen.has(id)) {
          // A later context may only raise a question's priority, never repeat it.
          const prior = out.find(row => row.id === id);
          if (existing || !prior || prior.tier === 'blocked' || (kind === 'trends' && notes.trendsUninterpretable)) continue;
          const upgrade = materialFor(item, kind, context, slate);
          if (upgrade && TIER_ORDER[upgrade.tier] < (TIER_ORDER[prior.tier] ?? 9)) Object.assign(prior, upgrade, { context: context.id });
          continue;
        }
        seen.add(id);
        const base = { id, kind, itemId: item.id, name: item.name, tool: TOOLS[kind], context: context.id,
          question: kind === 'local' ? `Is there Qloo geographic evidence for ${item.name} in ${city}?`
            : kind === 'comparison' ? `How does ${item.name}'s audience compare with the anchor audience?`
              : `Does Qloo return an interpretable recent trend direction for ${item.name}?` };
        if (existing) { out.push({ ...base, tier: 'done', why: existing.text, receiptId: existing.receiptId }); continue; }
        if (kind === 'trends' && notes.trendsUninterpretable) { out.push({ ...base, tier: 'immaterial', why: 'Earlier trend calls in this run returned no interpretable direction, so further trend queries are not expected to add evidence.' }); continue; }
        if (kind === 'comparison' && !anchorIds.length) { out.push({ ...base, tier: 'blocked', why: 'Anchor identities were not saved, so an audience comparison cannot be requested.' }); continue; }
        if (!bookable(item)) { out.push({ ...base, tier: 'blocked', why: `${item.name} has no confirmed availability and buyer-entered fee. Qloo evidence cannot make the act bookable; request a quote first.` }); continue; }
        out.push({ ...base, ...(materialFor(item, kind, context, slate) ?? { tier: 'immaterial', why: `Tested every possible result: ${item.name} would not enter or leave any recommended, alternative or fallback bill, and is not booked in one.` }) });
      }
    }
    return out.sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || (b.priority ?? 0) - (a.priority ?? 0) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || String(a.id).localeCompare(String(b.id)));
  }

  function materialFor(item, kind, context, slate) {
    const test = materiality(items, context.constraints, item.id, kind, slate.selectedIds);
    const selected = slate.selectedIds.includes(item.id);
    if (test.material) {
      const changed = test.tested.find(row => row.changed);
      return { tier: 'material', priority: selected ? 3 : 2, materiality: test,
        why: `If this came back as "${changed.outcome}", the ${context.label} would change from ${names(slate.selectedIds)} to ${names(changed.selectedIds)}.` };
    }
    if (selected) return { tier: context.id === 'primary' ? 'justification' : 'fallback', priority: context.id === 'primary' ? 2 : 1, materiality: test,
      why: context.id === 'primary' ? `${item.name} is booked in the recommended bill. No result can change the selection, but the packet's cultural justification is incomplete without it.`
        : `${item.name} is the bill under "${context.label}". No result changes that fallback, but the promoter would book it without this evidence.` };
    if ((context.focusIds ?? []).includes(item.id)) return { tier: 'justification', priority: 1, materiality: test, why: `${item.name} appears in a feasible alternative strategy; this evidence supports comparing it.` };
    return null;
  }

  function integrate(question, receipt) {
    const status = receipt.status, rows = Array.isArray(receipt.evidence?.rows) ? receipt.evidence.rows : [];
    const results = [];
    if (question.kind === 'rank' || question.kind === 'crosscheck') {
      const known = new Set(items.map(item => item.id));
      const order = usable(status) ? unique(rows.map(row => row.id).filter(id => known.has(id))) : [];
      const complete = order.length === items.length;
      const fits = new Map(order.map((id, index) => [id, items.length > 1 ? 1 - index / (items.length - 1) : .5]));
      if (question.kind === 'rank') {
        if (complete) for (const item of items) {
          item.fit = fits.get(item.id); item.rank = order.indexOf(item.id) + 1; item.of = items.length;
          item.evidence.rank = true; item.evidenceReceipts.rank = [receipt.id]; item.receipts = unique([...item.receipts, receipt.id]);
          item.rankCoverage = { complete: true, returned: order.length, requested: items.length };
        }
        results.push({ state: complete ? 'resolved' : 'incomplete', text: complete ? `Ranking returned all ${items.length} candidates [${receipt.id}].` : `Ranking returned ${order.length}/${items.length} candidates [${receipt.id}]; comparable fit remains unknown and no order was substituted.` });
      } else {
        let text;
        if (complete) {
          const alternative = items.map(item => ({ ...item, fit: fits.get(item.id), evidence: { ...item.evidence, rank: true } }));
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
        results.push({ state: complete ? 'resolved' : 'incomplete', text });
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
    if (question.kind === 'trends' && results.every(row => row.state !== 'resolved')) notes.trendsUninterpretable = true;
    return results;
  }

  async function researchPhase(phase, contextsFn, callLimit) {
    for (;;) {
      const contexts = contextsFn(), open = selectable(questions(contexts));
      if (!open.length) {
        const unresolved = observations.filter(row => row.phase === phase).flatMap(row => row.results).filter(row => row.state !== 'resolved');
        return { stop: unresolved.length ? 'exhausted' : 'sufficient', pending: [], unresolved: unresolved.length };
      }
      if (!research) return { stop: 'planning_only', pending: open };
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
      else if (question.kind === 'rank') args = { options: items.map(item => item.id), option_type: 'artist', signals: anchorIds, signal_location: city };
      else args = { options: items.map(item => item.id), option_type: 'artist', signals: anchorIds };
      const before = optimizeSlate(items, baseConstraints);
      record({ type: 'action', phase, round: rounds, questionId: question.id, tier: question.tier, tool: question.tool,
        text: question.kind === 'trends' && question.batch.length > 1 ? `${question.question} (batched for ${question.batch.map(row => row.name).join(', ')})` : question.question, why: question.why });
      const why = `Autopilot ${phase}: ${question.question}`.slice(0, 200);
      const refresh = question.kind === 'rank';
      if (refresh) attempted.set('rank', { state: 'attempted' });
      if (question.kind === 'crosscheck') attempted.set('crosscheck', { state: 'attempted' });
      const { receipt } = await research.call(question.tool, args, why, { refresh });
      receipts.push(receipt);
      consecutiveFailures = usable(receipt.status) || receipt.status === 'empty' ? 0 : consecutiveFailures + 1;
      const results = integrate(question, receipt);
      if (question.kind === 'rank') attempted.set('rank', { state: results[0].state, receiptId: receipt.id, text: results[0].text });
      if (question.kind === 'crosscheck') attempted.set('crosscheck', { state: results[0].state, receiptId: receipt.id, text: results[0].text });
      const after = optimizeSlate(items, baseConstraints);
      const changed = !same(before.selectedIds, after.selectedIds);
      observations.push({ round: rounds, phase, questionId: question.id, receiptId: receipt.id, tool: receipt.tool, status: receipt.status, results, decisionChanged: changed });
      record({ type: 'observation', phase, round: rounds, receiptId: receipt.id, tool: receipt.tool, status: receipt.status, cached: receipt.cached === true, text: results.map(row => row.text).join(' ') });
      if (changed) history.push({ phase, selectedIds: after.selectedIds, feasible: after.feasible, score: after.score, totalFee: after.totalFee, cause: { questionId: question.id, receiptId: receipt.id } });
      record({ type: 'reevaluate', phase, round: rounds, selectedIds: after.selectedIds, changed, text: changed ? `Re-optimized: the decision changed from ${names(before.selectedIds)} to ${names(after.selectedIds)}.` : `Re-optimized: ${names(after.selectedIds)} remains the best feasible bill.` });
    }
  }

  function selectable(list) {
    if (policy === 'value') return list.filter(row => EXECUTABLE.has(row.tier));
    // Baselines ignore materiality: every researchable gap is eligible.
    const open = list.filter(row => !['done', 'blocked'].includes(row.tier) && row.kind !== 'crosscheck');
    if (policy === 'fixed-order') {
      const position = row => row.kind === 'rank' ? -1 : items.find(item => item.id === row.itemId)?.rank ?? 99;
      return open.sort((a, b) => position(a) - position(b) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
    }
    const score = row => parseInt(createHash('sha256').update(`${seed}:${row.id}`).digest('hex').slice(0, 8), 16);
    return open.sort((a, b) => score(a) - score(b));
  }

  // Phase A: research the decision itself, keeping a reserve for stress follow-up.
  const reserve = policy === 'value' && options.maxCalls >= 4 ? Math.ceil(options.maxCalls / 4) : 0;
  const phaseAContexts = () => {
    const slate = optimizeSlate(items, baseConstraints);
    const strategy = strategies(items, baseConstraints);
    return contextsFor(slate.selectedIds, []).map(context => ({ ...context, focusIds: unique([...slate.selectedIds, ...strategy.list.flatMap(row => row.selectedIds)]) }));
  };
  const initialQuestions = questions(phaseAContexts());
  record({ type: 'questions', phase: 'decision', text: summarizeQuestions(initialQuestions), questions: initialQuestions.map(publicQuestion) });
  const phaseA = await researchPhase('decision', phaseAContexts, options.maxCalls - reserve);
  record({ type: 'stop', phase: 'decision', reason: phaseA.stop, text: stopText(phaseA, options.maxCalls - reserve) });

  // Phase B: strategies and stress against the updated evidence.
  let strategy = strategies(items, baseConstraints), stress = stressTest(items, baseConstraints, strategy);
  record({ type: 'strategies', text: strategy.status === 'feasible' ? `${strategy.list.length} distinct feasible strategies: ${strategy.list.map(row => `${row.label} (${names(row.selectedIds)})`).join('; ')}.` : 'No feasible strategy exists under the brief; no lineup is proposed.', strategyIds: strategy.list.map(row => row.id) });
  record({ type: 'stress', text: stress.summary, vulnerabilities: stress.vulnerabilities.length });

  // Phase C: stress scenarios name fallback acts; research their open gaps when
  // that evidence could change the fallback or would justify booking it.
  const stressContexts = stress.contexts ?? [];
  let phaseC = { stop: 'not_needed', pending: [] };
  const followupOpen = questions([...phaseAContexts(), ...stressContexts]).filter(row => EXECUTABLE.has(row.tier));
  if (policy === 'value' && stressContexts.length && followupOpen.length) {
    record({ type: 'followup', text: `Stress tests named fallback bills. ${followupOpen.length} open evidence question(s) concern them or remain from the decision phase.`, questions: followupOpen.map(publicQuestion) });
    const beforeStress = stress;
    phaseC = await researchPhase('stress-followup', () => [...phaseAContexts(), ...stressContexts], options.maxCalls);
    record({ type: 'stop', phase: 'stress-followup', reason: phaseC.stop, text: stopText(phaseC, options.maxCalls) });
    if (observations.some(row => row.phase === 'stress-followup')) {
      strategy = strategies(items, baseConstraints); stress = stressTest(items, baseConstraints, strategy);
      const changedFallbacks = stress.cancellations.filter(row => { const old = beforeStress.cancellations.find(prior => prior.canceledId === row.canceledId); return old && !same(old.selectedIds, row.selectedIds); });
      record({ type: 'reevaluate', phase: 'stress-followup', changed: changedFallbacks.length > 0, text: changedFallbacks.length ? `Follow-up evidence changed ${changedFallbacks.length} cancellation fallback(s).` : 'Follow-up evidence did not change any fallback bill; it completes the justification for booking them.' });
    }
  } else record({ type: 'stop', phase: 'stress-followup', reason: phaseC.stop, text: stressContexts.length ? `Stress tests named ${unique(stressContexts.flatMap(row => row.focusIds)).length} act(s) across fallback bills; none has an open, researchable evidence gap, so no follow-up call is needed.` : 'No fallback bill exists to research.' });

  const final = optimizeSlate(items, baseConstraints);
  const finalQuestions = questions([...phaseAContexts(), ...stressContexts]);
  const packet = buildPacket();
  record({ type: 'packet', text: `Decision packet ready: ${final.feasible ? names(final.selectedIds) : 'no feasible lineup'}; ${packet.nextSteps.length} next steps.` });
  const result = { version: AUTOPILOT_VERSION, mode, city, currency, constraints: baseConstraints, briefChanged: options.briefChanged,
    budget: { maxCalls: options.maxCalls, reserveForStress: reserve, used: research ? research.used() : 0, maxRounds: options.maxRounds, rounds },
    stop: { decision: phaseA.stop, followup: phaseC.stop }, history, events, receipts, observations,
    questions: finalQuestions.map(publicQuestion), strategies: strategy, stress: publicStress(stress), crossCheck: notes.crossCheck, packet,
    items: items.map(({ id, name, found, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms, rankCoverage }) => ({ id, name, found: found === true, fit, rank, of, local, momentum, evidence, evidenceReceipts, terms, rankCoverage })),
    interpretation: 'Deterministic research policy over the exact optimizer. Policy points are an internal objective, not ticket demand, attendance or revenue. Fees and availability are buyer inputs.' };
  result.digest = digest({ version: result.version, constraints: result.constraints, history: result.history.map(({ phase, selectedIds, cause }) => ({ phase, selectedIds, cause })),
    actions: events.filter(row => row.type === 'action').map(({ questionId, tool }) => ({ questionId, tool })), receipts: receipts.map(({ id, tool, status }) => ({ id, tool, status })),
    observations: observations.map(({ questionId, receiptId, results }) => ({ questionId, receiptId, results })),
    recommendation: packet.recommendation?.selectedIds ?? [], strategies: strategy.list.map(row => [row.id, row.selectedIds]) });
  return result;

  function summarizeQuestions(list) {
    const count = tier => list.filter(row => row.tier === tier).length;
    return `${list.length} evidence questions identified: ${count('material')} could change the decision, ${count('ranking') + count('robustness')} test the ranking, ${count('justification') + count('fallback')} justify booked acts, ${count('immaterial')} cannot change any strategy, ${count('blocked')} are blocked by missing commercial inputs or identities, ${count('done')} already answered by saved receipts.`;
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
      provider_unavailable: `Stopped after consecutive provider failures; ${pending} question(s) remain open and nothing was substituted.`,
    }[state.stop] ?? state.stop;
  }

  function strategies(pool, constraints) {
    const cacheKey = JSON.stringify([constraints, pool.map(item => [item.id, item.fit, item.local, item.momentum, item.evidence, item.terms])]);
    if (!strategyCache.has(cacheKey)) strategyCache.set(cacheKey, computeStrategies(pool, constraints));
    return structuredClone(strategyCache.get(cacheKey));
  }
  function computeStrategies(pool, constraints) {
    const best = optimizeSlate(pool, constraints);
    if (!best.feasible) return { status: 'infeasible', reasons: best.reasons, relaxations: best.diagnostics?.relaxations ?? null, list: [] };
    const rows = enumerateSlates(pool, constraints).filter(row => row.feasible);
    const cheaper = rows.filter(row => row.totalFee < best.totalFee).sort((a, b) => b.rawScore - a.rawScore || a.totalFee - b.totalFee || key(a.selectedIds).localeCompare(key(b.selectedIds)))[0];
    const coverage = ids => { const fallback = ids.map(id => optimizeSlate(pool, { ...constraints, lockedIds: ids.filter(other => other !== id), excludedIds: unique([...(constraints.excludedIds ?? []), id]) })); return { covered: fallback.filter(row => row.feasible).length, total: ids.length }; };
    const describe = (id, label, row, rationale) => {
      const members = pool.filter(item => row.selectedIds.includes(item.id));
      const evidence = members.map(item => ({ id: item.id, name: item.name, kinds: ['rank', ...KINDS].filter(kind => item.evidence[kind]) }));
      return { id, label, selectedIds: row.selectedIds, totalFee: row.totalFee, headroom: cents(constraints.budget - row.totalFee), score: row.score,
        scoreGap: cents(best.score - row.score), feeDelta: cents(row.totalFee - best.totalFee), cancellationCoverage: coverage(row.selectedIds), evidence,
        evidenceCompleteness: cents(evidence.reduce((sum, member) => sum + member.kinds.length, 0) / Math.max(1, evidence.length * 4)), rationale };
    };
    const list = [describe('cultural-fit', 'Strongest cultural fit', best, 'Highest declared policy score among all feasible lineups.')];
    if (cheaper && !same(cheaper.selectedIds, best.selectedIds)) list.push(describe('lower-cost', 'Lower-cost alternative', cheaper, `Best policy score among lineups cheaper than the recommendation: saves ${money(best.totalFee - cheaper.totalFee)} for ${cents(best.score - cheaper.score)} policy points.`));
    // Robustness is survival of the unchanged bill under the same declared
    // stress scenarios used below, then cancellation coverage, then policy score.
    const survival = ids => survivalCount(pool, constraints, ids);
    const ranked = rows.map(row => ({ row, survives: survival(row.selectedIds), coverage: coverage(row.selectedIds).covered }))
      .sort((a, b) => b.survives.survived - a.survives.survived || b.coverage - a.coverage || b.row.rawScore - a.row.rawScore || a.row.totalFee - b.row.totalFee);
    const robust = ranked[0], bestSurvival = survival(best.selectedIds);
    list[0].stressSurvival = bestSurvival;
    if (list[1]) list[1].stressSurvival = survival(list[1].selectedIds);
    let robustNote = null;
    const existing = list.find(row => same(row.selectedIds, robust.row.selectedIds));
    if (robust.survives.survived <= bestSurvival.survived) robustNote = `The recommended bill already survives the most stress scenarios unchanged (${bestSurvival.survived}/${bestSurvival.total}).`;
    else if (existing) { existing.label += ' · most stress-resilient'; robustNote = `${existing.label.split(' · ')[0]} is also the most stress-resilient bill: it survives ${robust.survives.survived}/${robust.survives.total} scenarios unchanged versus ${bestSurvival.survived} for the recommendation.`; }
    else list.push({ ...describe('robust', 'Most stress-resilient', robust.row, `Survives ${robust.survives.survived}/${robust.survives.total} declared stress scenarios unchanged versus ${bestSurvival.survived} for the recommendation, at ${cents(best.score - robust.row.score)} fewer policy points.`), stressSurvival: robust.survives });
    const cross = notes.crossCheck;
    if (cross?.complete && !cross.agrees) {
      const match = list.find(row => same(row.selectedIds, cross.selectedIds));
      if (match) { match.label += ' · preferred without the city signal'; match.rationale += ` It is also the optimizer's choice under a location-free Qloo ranking [${cross.receiptId}].`; }
      else if (cross.feasible) { const row = rows.find(slate => same(slate.selectedIds, cross.selectedIds)); if (row) list.push(describe('location-free', 'Preferred without the city signal', row, `The optimizer's choice under a location-free Qloo ranking [${cross.receiptId}]; the recommendation weights local ${city} taste.`)); }
    }
    return { status: 'feasible', list, robustNote, frontier: best.frontier.map(row => ({ selectedIds: row.selectedIds, totalFee: row.totalFee, score: row.score })), margin: margin(pool, constraints) };
  }

  function survivalCount(pool, constraints, ids) {
    const fees = ids.map(id => pool.find(item => item.id === id).terms.fee), total = fees.reduce((sum, fee) => sum + fee, 0);
    const scenarios = [...[5, 10, 15, 20].map(cut => total <= constraints.budget * (1 - cut / 100) + 1e-9),
      ...fees.flatMap(fee => [10, 20, 30].map(increase => total + fee * increase / 100 <= constraints.budget + 1e-9)),
      ...[[5, 10], [10, 15], [15, 20]].map(([cut, increase]) => total * (1 + increase / 100) <= constraints.budget * (1 - cut / 100) + 1e-9)];
    return { survived: scenarios.filter(Boolean).length, total: scenarios.length, basis: 'Budget cuts of 5–20%, +10/20/30% on each booked fee, and three combined cut-plus-increase shocks; the bill must stay within budget unchanged.' };
  }

  function stressTest(pool, constraints, strategy) {
    const best = optimizeSlate(pool, constraints);
    if (!best.feasible) return { summary: 'No feasible recommendation to stress-test.', vulnerabilities: [], contexts: [], cancellations: [], breakpoints: [] };
    const plan = buildContingencyPlan(pool, constraints);
    const snapshot = { memo: { items: pool, constraints }, receipts: [...(source.receipts ?? []), ...receipts] };
    const proof = buildDecisionProof(snapshot);
    const vulnerabilities = [], contexts = [], breakpoints = [];
    for (const row of plan.cancellations) {
      const lost = nameOf(row.canceledId);
      if (!row.feasible) vulnerabilities.push({ type: 'artist_unavailable', severity: 'critical', artistId: row.canceledId, text: `If ${lost} becomes unavailable, no replacement satisfies the brief while keeping the other booked acts.`, outcome: row.reasons[0] ?? 'Infeasible' });
      else {
        vulnerabilities.push({ type: 'artist_unavailable', severity: row.scoreDelta < -10 ? 'high' : 'moderate', artistId: row.canceledId, replacementIds: row.replacementIds,
          text: `If ${lost} becomes unavailable, replace with ${names(row.replacementIds)}: ${names(row.selectedIds)} at ${money(row.totalFee)} (${row.scoreDelta} policy points, ${row.costDelta >= 0 ? '+' : ''}${money(row.costDelta)}).` });
        contexts.push({ id: `cancel:${row.canceledId}`, label: `${lost} cancels`, constraints: { ...constraints, lockedIds: best.selectedIds.filter(id => id !== row.canceledId), excludedIds: unique([...(constraints.excludedIds ?? []), row.canceledId]) }, focusIds: row.selectedIds });
      }
    }
    for (const id of best.selectedIds) {
      const item = pool.find(row => row.id === id), limit = cents(item.terms.fee + best.remainingBudget);
      const after = optimizeSlate(pool.map(row => row.id === id ? { ...row, terms: { ...row.terms, fee: cents(limit + .01) } } : row), constraints);
      breakpoints.push({ type: 'fee', artistId: id, currentFee: item.terms.fee, maximumFee: limit, increasePercent: item.terms.fee ? cents((limit / item.terms.fee - 1) * 100) : null, nextSelectedIds: after.selectedIds, nextFeasible: after.feasible,
        text: `${item.name}'s fee can rise to ${money(limit)}${item.terms.fee ? ` (+${cents((limit / item.terms.fee - 1) * 100)}%)` : ''} before this bill exceeds the budget; above that the plan becomes ${after.feasible ? names(after.selectedIds) : 'infeasible'}.` });
    }
    const floor = best.totalFee, below = optimizeSlate(pool, { ...constraints, budget: Math.max(0, cents(floor - .01)) });
    breakpoints.push({ type: 'budget', minimumBudget: floor, cutPercent: cents((1 - floor / constraints.budget) * 100), nextSelectedIds: below.selectedIds, nextFeasible: below.feasible,
      text: `The bill survives budget cuts down to ${money(floor)} (${cents((1 - floor / constraints.budget) * 100)}% below the brief); below that the plan becomes ${below.feasible ? `${names(below.selectedIds)} at ${money(below.totalFee)}` : 'infeasible'}.` });
    if (below.feasible) contexts.push({ id: 'budget-floor', label: `budget below ${money(floor)}`, constraints: { ...constraints, budget: Math.max(0, cents(floor - .01)) }, focusIds: below.selectedIds });
    for (const row of plan.individualQuoteShocks.filter(row => !same(row.selectedIds, best.selectedIds) && row.increasePercent === 10))
      vulnerabilities.push({ type: 'fee_increase', severity: row.feasible ? 'moderate' : 'critical', artistId: row.shockedId, text: `A 10% quote increase for ${nameOf(row.shockedId)} changes the plan to ${row.feasible ? names(row.selectedIds) : 'no feasible lineup'}.` });
    const firstCut = plan.budgetCuts.find(row => !same(row.selectedIds, best.selectedIds));
    if (firstCut) vulnerabilities.push({ type: 'budget_cut', severity: firstCut.feasible ? (firstCut.cutPercent <= 10 ? 'high' : 'moderate') : 'critical', text: `A ${firstCut.cutPercent}% budget cut (${money(firstCut.budget)}) changes the plan to ${firstCut.feasible ? `${names(firstCut.selectedIds)} at ${money(firstCut.totalFee)}` : 'no feasible lineup'}.` });
    const combined = plan.combinedShocks.find(row => !row.feasible);
    if (combined) vulnerabilities.push({ type: 'combined', severity: 'high', text: `Under a ${combined.budgetCutPercent}% budget cut with ${combined.quoteIncreasePercent}% higher quotes, no lineup satisfies the brief.` });
    const ablation = id => proof.ablations.find(row => row.id === id);
    const all = ablation('class:all'), rank = ablation('class:rank');
    const evidence = { allWithdrawn: all ? { changed: all.changed, selectedIds: all.selectedIds, feasible: all.feasible } : null, rankWithdrawn: rank ? { changed: rank.changed, selectedIds: rank.selectedIds } : null,
      byClass: proof.ablations.filter(row => row.kind === 'class').map(row => ({ evidenceClass: row.evidenceClass, changed: row.changed, selectedIds: row.selectedIds })) };
    if (all?.changed) vulnerabilities.push({ type: 'missing_evidence', severity: 'dependency', text: `Without Qloo evidence the optimizer would choose ${names(all.selectedIds)}. The recommendation rests on the cultural receipts listed in this packet.` });
    const cross = notes.crossCheck;
    if (cross?.complete && !cross.agrees) {
      const moved = best.selectedIds.filter(id => !cross.selectedIds.includes(id));
      vulnerabilities.push({ type: 'cultural_specification', severity: 'high', receiptId: cross.receiptId, selectedIds: cross.selectedIds,
        text: `Without the ${city} location signal, Qloo's ranking [${cross.receiptId}] would choose ${names(cross.selectedIds)}. ${names(moved)} ${moved.length === 1 ? 'holds its' : 'hold their'} place because of local taste; if the audience is not mainly local, weigh the location-free bill.` });
    } else if (cross?.complete && cross.agrees) vulnerabilities.push({ type: 'cultural_specification', severity: 'survived', receiptId: cross.receiptId, text: `A location-free Qloo ranking [${cross.receiptId}] selects the same bill; the choice does not hinge on the ${city} signal.` });
    const weakEvidence = best.selectedIds.filter(id => { const item = pool.find(row => row.id === id); return !item.evidence.local || !item.evidence.comparison; });
    if (weakEvidence.length) vulnerabilities.push({ type: 'missing_evidence', severity: 'moderate', text: `${names(weakEvidence)} still lack${weakEvidence.length === 1 ? 's' : ''} geographic or audience-comparison evidence; their cultural justification relies mainly on rank.` });
    const order = { critical: 0, high: 1, dependency: 2, moderate: 3, survived: 4 };
    vulnerabilities.sort((a, b) => order[a.severity] - order[b.severity]);
    const survived = plan.resilience;
    return { summary: `${survived.totalScenarios} stress scenarios: the plan adapts feasibly in ${survived.feasibleScenarios}; ${survived.cancellationCoverage}/${survived.cancellationCount} cancellations have a clean replacement; ${vulnerabilities.filter(row => row.severity === 'critical').length} critical vulnerabilities.`,
      vulnerabilities, contexts, breakpoints, evidence, resilience: survived, cancellations: plan.cancellations.map(row => ({ canceledId: row.canceledId, feasible: row.feasible, selectedIds: row.selectedIds, replacementIds: row.replacementIds, totalFee: row.totalFee, scoreDelta: row.scoreDelta })),
      budgetCuts: plan.budgetCuts.map(row => ({ cutPercent: row.cutPercent, budget: row.budget, feasible: row.feasible, selectedIds: row.selectedIds, retained: same(row.selectedIds, best.selectedIds) })),
      quoteShocks: plan.individualQuoteShocks.map(row => ({ shockedId: row.shockedId, increasePercent: row.increasePercent, feasible: row.feasible, selectedIds: row.selectedIds, retained: same(row.selectedIds, best.selectedIds) })),
      sensitivity: proof.sensitivity.map(row => ({ name: row.name, selectedIds: row.selectedIds, changed: row.changed })) };
  }

  function publicStress(stress) { const { contexts, ...rest } = stress; return { ...rest, contexts: (contexts ?? []).map(({ id, label, focusIds }) => ({ id, label, focusIds })) }; }

  function buildPacket() {
    const slate = optimizeSlate(items, baseConstraints);
    const allReceipts = new Map([...sourceReceipts, ...receipts.map(row => [row.id, row])]);
    const receiptRef = id => { const row = allReceipts.get(id); return row ? { id, tool: row.tool, status: row.status, source: row.source ?? 'unknown', fetchedAt: row.fetchedAt ?? null, new: receipts.some(r => r.id === id) } : { id, missing: true }; };
    const claimsFor = item => {
      const claims = [];
      if (item.evidence.rank) claims.push({ text: `Ranks ${item.rank} of ${item.of} candidates against ${anchors.join(', ') || 'the anchors'} in ${city}. Relative order, not demand.`, receipts: item.evidenceReceipts.rank.map(receiptRef) });
      else claims.push({ text: 'No comparable audience rank; fit is unknown.', receipts: [] });
      if (item.evidence.local) claims.push({ text: `Qloo returned geographic popularity rows within ${city}.`, receipts: item.evidenceReceipts.local.map(receiptRef) });
      if (item.evidence.comparison) claims.push({ text: 'An aggregate audience comparison with the anchors was returned. It does not measure shared ticket buyers.', receipts: item.evidenceReceipts.comparison.map(receiptRef) });
      if (item.evidence.trends) claims.push({ text: `Observed trend direction: ${item.momentum}.`, receipts: item.evidenceReceipts.trends.map(receiptRef) });
      return claims;
    };
    const finalQuestions = questions([...phaseAContexts(), ...(stress.contexts ?? [])]);
    const gaps = finalQuestions.filter(row => row.tier !== 'done' || ['unavailable', 'uninterpretable', 'incomplete'].includes(attempted.get(row.id)?.state)).map(row => ({
      question: row.question, artistId: row.itemId, status: row.tier === 'done' ? `researched: ${attempted.get(row.id)?.state}` : EXECUTABLE.has(row.tier) ? `open (${row.tier})` : row.tier, why: row.why })).slice(0, 40);
    const recommended = strategy.list[0];
    const steps = [];
    if (slate.feasible) {
      steps.push(`Request holds for ${slate.selectedIds.map(id => { const item = items.find(row => row.id === id); return `${item.name} (${money(item.terms.fee)})`; }).join(' and ')}; total ${money(slate.totalFee)} against a ${money(baseConstraints.budget)} artist budget.`);
      for (const row of stress.breakpoints.filter(row => row.type === 'fee')) steps.push(`Negotiate ${nameOf(row.artistId)} at or below ${money(row.maximumFee)}; above that the bill changes.`);
      for (const row of stress.cancellations.filter(row => row.feasible && row.replacementIds.length)) steps.push(`Pre-clear ${names(row.replacementIds)} as the backup for ${nameOf(row.canceledId)}: confirm availability and the ${money(items.find(item => item.id === row.replacementIds[0])?.terms.fee)} quote.`);
      for (const row of stress.cancellations.filter(row => !row.feasible)) steps.push(`No clean backup exists for ${nameOf(row.canceledId)}; quote additional candidates before committing.`);
    } else steps.push('No lineup satisfies this brief. Relax the binding constraint shown below or add quoted candidates; nothing was booked.');
    if (notes.crossCheck?.complete && !notes.crossCheck.agrees && slate.feasible) steps.push(`Decide how local the audience is: the ${city}-weighted ranking supports ${names(slate.selectedIds)}; a location-free Qloo ranking [${notes.crossCheck.receiptId}] supports ${names(notes.crossCheck.selectedIds)}.`);
    const quoteLeads = items.filter(item => !bookable(item) && item.evidence.rank).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3).map(item => ({ ...entryFee(item), id: item.id, name: item.name, rank: item.rank, of: item.of }));
    for (const lead of quoteLeads) steps.push(lead.maximumFee == null ? `${lead.name} ranks ${lead.rank}/${lead.of} but would not enter the bill at any fee under the current constraints.` : `Request a quote from ${lead.name} (rank ${lead.rank}/${lead.of}): if available at or below ${money(lead.maximumFee)}, the optimizer would book them as ${names(lead.selectedIds)}. Hypothetical until a real quote is entered.`);
    const openMaterial = finalQuestions.filter(row => row.tier === 'material');
    if (openMaterial.length) steps.push(`Resolve ${openMaterial.length} open decision-material evidence question(s) before booking: ${openMaterial.slice(0, 3).map(row => row.question).join(' ')}`);
    const changed = !same(history[0].selectedIds, slate.selectedIds);
    const researched = observations.length;
    const researchVerdict = !researched ? (research ? 'No research action was needed: no open gap could change a strategy or justify a booked act.' : 'Planning mode: no research was executed; the open questions are listed in priority order.')
      : changed ? `Research changed the decision from ${names(history[0].selectedIds)} to ${names(slate.selectedIds)} (${history.filter(row => row.cause).map(row => `${row.cause.questionId} via ${row.cause.receiptId}`).join('; ')}).`
        : `${researched} research action(s) returned; the decision did not change because ${strategy.margin?.points != null ? `the winning margin is ${strategy.margin.points} policy points and ` : ''}no tested outcome could alter the selection. The new evidence completes the justification for booked and fallback acts.`;
    const packet = {
      title: `${city} booking decision`, mode, generatedAt: new Date(now()).toISOString(), currency,
      brief: { city, anchors, budget: baseConstraints.budget, slots: baseConstraints.slots, maxPerGenre: baseConstraints.maxPerGenre, discoveryMin: baseConstraints.discoveryMin, lockedIds: baseConstraints.lockedIds, excludedIds: baseConstraints.excludedIds, candidates: items.length, briefChanged: options.briefChanged },
      recommendation: slate.feasible ? { strategyId: recommended?.id, selectedIds: slate.selectedIds, names: slate.selectedIds.map(nameOf), totalFee: slate.totalFee, headroom: slate.remainingBudget, policyScore: cents(slate.score), stressSurvival: strategy.list[0]?.stressSurvival ?? null, status: slate.status,
        artists: slate.selectedIds.map(id => { const item = items.find(row => row.id === id); return { id, name: item.name, fee: item.terms.fee, genre: item.terms.genre || null, claims: claimsFor(item) }; }) } : null,
      infeasibility: slate.feasible ? null : { reasons: slate.reasons, relaxations: slate.diagnostics?.relaxations ?? null },
      alternatives: strategy.list.slice(1).map(row => ({ id: row.id, label: row.label, names: row.selectedIds.map(nameOf), selectedIds: row.selectedIds, totalFee: row.totalFee, scoreGap: row.scoreGap, feeDelta: row.feeDelta, cancellationCoverage: row.cancellationCoverage, stressSurvival: row.stressSurvival ?? null, tradeoff: row.rationale })),
      robustNote: strategy.robustNote ?? null,
      assumptions: [
        mode === 'synthetic' ? 'SYNTHETIC QLOO DATA: development fixtures, not real cultural evidence.' : null,
        source.memo.exampleBookingTerms === true ? 'Fees, availability and genres are illustrative booking inputs from the published brief, not real quotes.' : 'Fees, availability and genres are buyer-entered inputs.',
        'Qloo supplies aggregate cultural affinity. It does not supply fees, availability, ticket demand, attendance or revenue.',
        'Policy points (fit 100/slot, local +2, rising +3, cooling −2, genre breadth, evidence penalty) are an internal objective, not a forecast.',
        'Fit is relative rank position within this candidate pool.',
      ].filter(Boolean),
      research: { questionsConsidered: initialQuestions.length, actionsExecuted: researched, callsUsed: research ? research.used() : 0, callBudget: options.maxCalls,
        stop: { decision: phaseA.stop, followup: phaseC.stop }, decisionChanged: changed, verdict: researchVerdict, crossCheck: notes.crossCheck },
      evidenceGaps: gaps,
      robustness: { summary: stress.summary, vulnerabilities: stress.vulnerabilities, breakpoints: stress.breakpoints, evidence: stress.evidence },
      quoteLeads, nextSteps: steps,
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
    if (hypothetical(high).selectedIds.includes(item.id)) return { maximumFee: high, selectedIds: hypothetical(high).selectedIds };
    for (let index = 0; index < 40 && high - low > .01; index++) { const mid = cents((low + high) / 2); if (hypothetical(mid).selectedIds.includes(item.id)) low = mid; else high = mid; }
    return { maximumFee: low, selectedIds: hypothetical(low).selectedIds, hypothetical: true };
  }
}

function publicQuestion(row) {
  const { materiality: test, batch, ...rest } = row;
  return { ...rest, ...(test ? { tested: test.tested.map(({ outcome, selectedIds, changed }) => ({ outcome, selectedIds, changed })) } : {}) };
}

const lines = values => values.filter(value => value != null).join('\n');
export function packetMarkdown(packet, money) {
  const rec = packet.recommendation;
  return lines([
    `# Houselights decision packet — ${packet.brief.city}`,
    `Mode: ${packet.mode}. Generated ${packet.generatedAt}.`,
    '', '## Brief',
    `${packet.brief.slots} slots · ${money(packet.brief.budget)} artist budget · listeners of ${packet.brief.anchors.join(', ')} · ${packet.brief.candidates} candidates${packet.brief.briefChanged ? ' · brief changed from the published case' : ''}`,
    '', '## Recommendation',
    rec ? `**${rec.names.join(' + ')}** — ${money(rec.totalFee)} planned fees, ${money(rec.headroom)} unallocated, ${rec.policyScore} policy points (${rec.status})${rec.stressSurvival ? `; survives ${rec.stressSurvival.survived}/${rec.stressSurvival.total} stress scenarios unchanged` : ''}.` : `No feasible lineup. ${packet.infeasibility.reasons.join(' ')}`,
    ...(rec ? rec.artists.flatMap(artist => [`- **${artist.name}** · ${money(artist.fee)}${artist.genre ? ` · ${artist.genre}` : ''}`, ...artist.claims.map(claim => `  - ${claim.text}${claim.receipts.length ? ` [${claim.receipts.map(row => row.id).join(', ')}]` : ''}`)]) : []),
    '', '## Alternatives',
    ...(packet.alternatives.length ? packet.alternatives.map(row => `- ${row.label}: ${row.names.join(' + ')} — ${money(row.totalFee)} (${row.feeDelta >= 0 ? '+' : ''}${money(row.feeDelta)}, −${row.scoreGap} points; ${row.cancellationCoverage.covered}/${row.cancellationCoverage.total} cancellations covered${row.stressSurvival ? `; survives ${row.stressSurvival.survived}/${row.stressSurvival.total} stress scenarios unchanged` : ''}). ${row.tradeoff}`) : ['- No distinct feasible alternative.']),
    packet.robustNote ? `- ${packet.robustNote}` : null,
    '', '## How the research went',
    packet.research.verdict,
    `${packet.research.actionsExecuted} action(s), ${packet.research.callsUsed}/${packet.research.callBudget} Qloo workflow calls. Stop: ${packet.research.stop.decision}; follow-up: ${packet.research.stop.followup}.`,
    '', '## Robustness',
    packet.robustness.summary,
    ...packet.robustness.vulnerabilities.map(row => `- ${row.severity}: ${row.text}`),
    ...packet.robustness.breakpoints.map(row => `- ${row.text}`),
    '', '## Evidence gaps',
    ...(packet.evidenceGaps.length ? packet.evidenceGaps.map(row => `- ${row.question} — ${row.status}. ${row.why}`) : ['- None open.']),
    '', '## Next steps',
    ...packet.nextSteps.map((step, index) => `${index + 1}. ${step}`),
    '', '## Assumptions',
    ...packet.assumptions.map(row => `- ${row}`),
    '', packet.limits, '',
  ]);
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function packetHtml(packet) {
  const body = escapeHtml(packet.markdown).split('\n').map(line => {
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    const bold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (/^\s+- /.test(line)) return `<p class="sub">${bold.replace(/^\s+- /, '')}</p>`;
    if (line.startsWith('- ')) return `<p class="item">${bold.slice(2)}</p>`;
    return line.trim() ? `<p>${bold}</p>` : '';
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(packet.title)}</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 16px;color:#1d1b17;background:#f7f6f2}h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:1.6rem;border-top:1px solid #d9d4c7;padding-top:.8rem}.item{margin:.3rem 0 .3rem 1rem}.sub{margin:.1rem 0 .1rem 2.2rem;color:#4a463d;font-size:.92em}@media print{body{background:#fff}}</style></head><body>${body}</body></html>`;
}
