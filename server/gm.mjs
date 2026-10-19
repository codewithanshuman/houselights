import { createHash } from 'node:crypto';
import { optimizeSlate, evaluateSelection } from './optimizer.mjs';
import { analyzeSlate } from './analysis.mjs';
import { buildContingencyPlan } from './contingency.mjs';
import { festivalBaselineAttempt, interpretRevision } from './llm.mjs';
import { buildFestivalResearch } from './festival-research.mjs';

const unique = values => [...new Set(values)];
const averageFit = (items, ids) => {
  const selected = items.filter(item => ids.includes(item.id));
  return selected.length && selected.every(item => item.evidence?.rank && Number.isFinite(item.fit))
    ? selected.reduce((sum, item) => sum + item.fit, 0) / selected.length : null;
};
export function withoutDerived(snapshot) {
  const copy = { ...snapshot };
  if (snapshot.memo) copy.memo = { ...snapshot.memo, items: preserveRankProvenance(snapshot) };
  for (const key of ['intelligence', 'venuePlan', 'capacityResearch', 'localActivation', 'festivalResearch', 'gm', 'benchmark', 'benchmarkTrial', 'themeSeason', 'decisionProof', 'investigation', 'commercialStress']) delete copy[key];
  return copy;
}

// Older research stores the exact rank dependency on its profile. Carry that
// explicit binding into candidates before discarding derived research reports.
// Never choose between multiple receipts or replace an existing binding.
export function preserveRankProvenance(snapshot, items = snapshot.memo?.items) {
  return items?.map(item => {
    const receiptId = snapshot.festivalResearch?.profiles?.find(profile => profile.id === item.id)?.audience?.receiptId;
    if (item.evidenceReceipts?.rank != null || !receiptId) return item;
    return { ...item, evidenceReceipts: { ...item.evidenceReceipts, rank: [receiptId] } };
  });
}

export function benchmarkBrief(snapshot, constraints) {
  const { items } = snapshot.memo;
  // Explicit allowlist: no fit, rank, receipts, notes, tags, trends or research
  // enters the control prompt. Discovery membership remains a booking constraint.
  return { city: snapshot.memo.input?.city ?? snapshot.input?.city,
    audiencePreferences: snapshot.memo.input?.anchors ?? snapshot.input?.anchors ?? [],
    currency: snapshot.memo.currency, constraints: structuredClone(constraints),
    candidates: items.map(item => ({ id: item.id, name: item.name, discovered: item.found === true,
      terms: { fee: item.terms?.fee ?? null, genre: item.terms?.genre ?? '', available: item.terms?.available === true } })) };
}
export async function benchmarkFestival(snapshot, { propose } = {}) {
  const { items, constraints } = snapshot.memo;
  const qloo = optimizeSlate(items, constraints);
  if (qloo.status === 'invalid') throw new Error(qloo.reasons.join(' '));
  const brief = benchmarkBrief(snapshot, qloo.constraints);
  const fingerprint = createHash('sha256').update(JSON.stringify(brief)).digest('hex');
  const attempt = qloo.constraints.minimumAverageFit != null ? null : propose
    ? { proposal: await propose(structuredClone(brief)), receipt: { mode: 'injected', status: 'test_adapter' } }
    : await festivalBaselineAttempt(structuredClone(brief));
  const proposal = attempt?.proposal;
  const base = { version: '1.0', sourceId: snapshot.id, brief, briefDigest: `sha256:${fingerprint}`, qloo,
    methodology: 'Objective diagnostic only: the optimizer is expected to win its own Qloo-weighted objective. This is not an independent or held-out evaluation. Both selections obey the same booking brief; an invalid control is not repaired. Collect separate blinded promoter preferences for independent evidence.',
    evaluationKind: 'in_sample_objective_diagnostic', independentEvidence: false,
    limitations: ['Optimizing the scoring objective makes its score advantage tautological; it does not prove better festival choices.', 'No independent promoter judgments have been collected by this comparison.', 'Policy-score improvement is not attendance or revenue uplift.'],
    generation: attempt?.receipt ?? { mode: 'not_called', status: 'evidence_dependent_constraint' },
    evidenceMode: snapshot.memo.mode ?? (snapshot.mock ? 'mock' : 'unknown'), generatedAt: new Date().toISOString() };
  if (!attempt) return { ...base, status: 'not_comparable', control: null, comparison: null, reason: 'The Qloo-derived minimum fit constraint cannot be used by an evidence-free control. No model call was made.' };
  if (!proposal) return { ...base, status: 'unavailable', control: null, comparison: null, reason: attempt.reason ?? 'No LLM response; no synthetic lineup is labeled LLM-only.' };
  let control;
  try { control = evaluateSelection(items, qloo.constraints, proposal.selectedIds); }
  catch (error) { return { ...base, status: 'invalid_control', control: { valid: false, error: error.message }, comparison: null }; }
  const comparable = qloo.feasible && control.feasible;
  const qlooFit = averageFit(items, qloo.selectedIds), controlFit = averageFit(items, control.selectedIds);
  return { ...base, status: comparable ? 'compared' : 'constraint_failure', control: { ...control, reason: String(proposal.reason ?? '').slice(0, 1200), reasoningSource: 'unverified LLM explanation' },
    comparison: comparable ? { policyPointDelta: qloo.score - control.score, feeDelta: qloo.totalFee - control.totalFee,
      meanRankUtilityDelta: qlooFit == null || controlFit == null ? null : qlooFit - controlFit,
      retainedIds: qloo.selectedIds.filter(id => control.selectedIds.includes(id)) } : null };
}

export async function runFestivalGM(snapshot, input, run) {
  const trace = [];
  const stage = (name, detail) => { const event = { sequence: trace.length + 1, stage: name, detail, at: new Date().toISOString() }; trace.push(event); run.emit({ type: 'gm_stage', ...event }); };
  stage('research', 'Scan city taste, rank the fixed pool, profile candidates, compare every bookable pair and research experience leads.');
  const research = await buildFestivalResearch(snapshot, input, run);
  for (const decision of research.adaptiveResearch ?? []) stage('adapt', `${decision.question}: ${decision.decision}`);
  stage('select', `${research.items.length} candidates keep their buyer-entered fees and availability.`);
  const slate = optimizeSlate(research.items, input.constraints);
  stage('optimize', `Enumerated ${slate.checkedCount} combinations; ${slate.feasibleCount} satisfy all constraints.`);
  const verification = slate.feasible ? evaluateSelection(research.items, input.constraints, slate.selectedIds) : null;
  stage('verify', verification?.feasible ? 'Independent selected-ID evaluation passed all booking constraints.' : 'No compliant slate; report the binding constraints without relaxing them.');
  const analysis = analyzeSlate(research.items, input.constraints);
  const recovery = buildContingencyPlan(research.items, input.constraints);
  stage('stress_test', 'Recomputed budget/fee scenarios and cancellation recovery using the same pool.');
  const needsEvidence = !research.markets.find(market => market.city === input.city).audience.complete;
  const state = !slate.feasible ? 'constraints_blocked' : needsEvidence ? 'evidence_required' : 'decision_ready';
  stage('decision', state === 'decision_ready' ? 'A feasible evidence-backed planning decision is ready for organizer review.' : state === 'evidence_required' ? 'A provisional bookable slate exists; audience ranking is incomplete.' : slate.reasons.join(' '));
  const next = { ...withoutDerived(snapshot), id: undefined, createdAt: undefined, parentId: snapshot.id,
    mock: snapshot.mock === true || run.mode === 'mock' || run.receipts.some(receipt => receipt.source === 'synthetic'),
    input: { ...snapshot.input, city: input.city, constraints: input.constraints },
    memo: { ...snapshot.memo, input: { ...snapshot.memo.input, city: input.city, constraints: input.constraints },
      mode: snapshot.mock === true || run.mode === 'mock' || run.receipts.some(receipt => receipt.source === 'synthetic') ? 'mock' : 'live', items: research.items, slate, constraints: input.constraints,
      base: null, eval: null, summary: trace.at(-1).detail, caveats: research.limitations,
      quality: { resolved: research.items.length, ranked: research.items.filter(item => item.evidence.rank).length, deepChecked: research.profiles.length, receipts: (snapshot.receipts?.length ?? 0) + run.receipts.length, liveCalls: run.used } },
    festivalResearch: research, receipts: [...(snapshot.receipts ?? []), ...run.receipts],
    gm: { state, mode: 'bounded-evidence-agent', trace, verification, analysis, recovery, generatedAt: new Date().toISOString() } };
  return next;
}

export async function cancelFestival(snapshot, raw) {
  const canceledId = raw?.artistId;
  if (!snapshot.memo.slate.selectedIds.includes(canceledId)) throw new Error('Choose a currently selected artist to cancel.');
  const canceledSource = structuredClone(snapshot);
  canceledSource.memo.constraints.lockedIds = unique([...(snapshot.memo.constraints.lockedIds ?? []).filter(id => id !== canceledId), ...snapshot.memo.slate.selectedIds.filter(id => id !== canceledId)]);
  const result = await reviseFestival(canceledSource, { request: `Exclude ${canceledId}` });
  if (result.snapshot) {
    result.snapshot.cancellations = [...(snapshot.cancellations ?? []), { artistId: canceledId, at: new Date().toISOString(),
      replacementIds: result.revision.addedIds, retainedIds: snapshot.memo.slate.selectedIds.filter(id => id !== canceledId) }];
    result.snapshot.gm.state = 'recovered';
  }
  return result;
}

function constrainedInterpretation(snapshot, request, headlinerId) {
  const text = request.trim().replace(/[.!]+$/, '');
  const match = text.match(/^(replace|exclude|lock)\s+(.+?)(?:,?\s+(?:and\s+)?keep (?:the )?budget)?(?:,?\s+(?:and\s+)?maintain (?:the )?audience fit)?$/i);
  if (!match) return null;
  let target = match[2].trim(), id;
  if (/^(the )?headliner$/i.test(target)) id = headlinerId;
  else {
    const matches = snapshot.memo.items.filter(item => [item.id, item.name].some(value => value.toLowerCase() === target.toLowerCase()));
    if (matches.length === 1) id = matches[0].id;
  }
  if (!id) return null;
  return { action: 'revise', excludeIds: match[1].toLowerCase() === 'lock' ? [] : [id],
    lockIds: match[1].toLowerCase() === 'lock' ? [id] : [], budget: null, slots: null,
    maintainFit: /maintain (?:the )?audience fit/i.test(text) };
}

export async function reviseFestival(snapshot, raw, { interpret = interpretRevision } = {}) {
  const request = typeof raw?.request === 'string' ? raw.request.trim() : '';
  if (!request || request.length > 2000) throw new Error('Provide a revision request of 1–2000 characters.');
  const items = preserveRankProvenance(snapshot);
  const headlinerId = raw.headlinerId ?? snapshot.gm?.headlinerId;
  if (headlinerId && !snapshot.memo.slate.selectedIds.includes(headlinerId)) throw new Error('The headliner must be a selected artist ID.');
  if (/\bheadliner\b/i.test(request) && !headlinerId) return { status: 'needs_input', reason: 'Specify headlinerId. The existing slate has no explicit headliner role.' };
  const direct = constrainedInterpretation(snapshot, request, headlinerId);
  const patch = direct ?? await interpret({ request, headlinerId, constraints: snapshot.memo.constraints,
    candidates: items.map(item => ({ id: item.id, name: item.name })), selectedIds: snapshot.memo.slate.selectedIds });
  if (!patch || patch.action !== 'revise') return { status: 'needs_input', reason: 'Use “Replace <artist>, keep the budget and maintain audience fit”, “Exclude <artist>”, or “Lock <artist>”. More complex requests require a configured LLM and supported patch.' };
  for (const field of ['excludeIds', 'lockIds']) if (!Array.isArray(patch[field]) || patch[field].length > 10 || patch[field].some(id => !items.some(item => item.id === id))) throw new Error('Revision returned an unknown candidate ID.');
  if (!patch.excludeIds.length && !patch.lockIds.length && patch.budget == null && patch.slots == null) return { status: 'needs_input', reason: 'No supported change was identified.' };
  const constraints = { ...snapshot.memo.constraints,
    lockedIds: unique([...(snapshot.memo.constraints.lockedIds ?? []), ...patch.lockIds]),
    excludedIds: unique([...(snapshot.memo.constraints.excludedIds ?? []), ...patch.excludeIds]) };
  // A language model may interpret prose, but may not silently change economics.
  // Numeric budget/slot patches require an independently recognizable explicit request.
  for (const [field, pattern] of [['budget', /\bbudget\s+(?:to|of|=)\s*([0-9]+(?:\.[0-9]{1,2})?)\b/i], ['slots', /\bslots\s+(?:to|=)\s*([0-9]+)\b/i]]) {
    if (patch[field] != null) {
      const explicit = request.match(pattern);
      if (!explicit || Number(explicit[1]) !== patch[field]) throw new Error(`The ${field} patch is not explicitly supported by the request.`);
      constraints[field] = patch[field];
    }
  }
  if (patch.maintainFit || /maintain (?:the )?audience fit/i.test(request)) {
    const floor = averageFit(items, snapshot.memo.slate.selectedIds);
    if (floor == null) return { status: 'evidence_required', reason: 'Cannot promise maintained audience fit: the original selection has missing comparable ranks.' };
    constraints.minimumAverageFit = Math.max(constraints.minimumAverageFit ?? 0, floor);
  }
  const slate = optimizeSlate(items, constraints);
  if (!slate.feasible) return { status: 'rejected', patch, slate, reason: 'The requested changes cannot satisfy every constraint. The source decision is unchanged.' };
  const revision = { request, patch, interpreter: direct ? 'bounded-grammar' : 'llm', at: new Date().toISOString(),
    removedIds: snapshot.memo.slate.selectedIds.filter(id => !slate.selectedIds.includes(id)),
    addedIds: slate.selectedIds.filter(id => !snapshot.memo.slate.selectedIds.includes(id)),
    previousMeanFit: averageFit(items, snapshot.memo.slate.selectedIds), revisedMeanFit: averageFit(items, slate.selectedIds),
    evidencePolicy: 'Reuses saved fixed-pool evidence. Run GM research again to refresh data or research a different city.' };
  return { status: 'revised', revision, snapshot: { ...withoutDerived(snapshot), id: undefined, createdAt: undefined, parentId: snapshot.id,
    input: { ...snapshot.input, constraints }, memo: { ...snapshot.memo, items, slate, constraints,
      input: { ...snapshot.memo.input, constraints }, base: null, eval: null, summary: 'Organizer revision checked against all booking constraints.' },
    revisions: [...(snapshot.revisions ?? []), revision],
    gm: { state: 'decision_ready', mode: 'validated-revision', headlinerId: slate.selectedIds.includes(headlinerId) ? headlinerId : undefined,
      verification: evaluateSelection(items, constraints, slate.selectedIds), recovery: buildContingencyPlan(items, constraints) } } };
}
