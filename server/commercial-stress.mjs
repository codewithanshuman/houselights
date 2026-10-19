import { createHash } from 'node:crypto';
import { enumerateSlates, evaluateSelection, optimizeSlate } from './optimizer.mjs';
import { decisionFingerprint } from './decision-proof.mjs';

const cents = value => Math.round((value + Number.EPSILON) * 100);
const cash = value => {
  if (!Number.isSafeInteger(value)) throw new Error('Combined scenario totals exceed exact cent arithmetic limits.');
  const result = value / 100;
  if (cents(result) !== value) throw new Error('Scenario amount cannot be represented as an exact cent monetary value.');
  return result;
};
function money(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) throw new Error(`${name} must be a number between zero and one billion.`);
  return cents(value);
}
export function commercialStress(snapshot, raw) {
  const items = snapshot.memo.items, ids = new Set(items.map(i => i.id));
  const baseline = optimizeSlate(items, snapshot.memo.constraints);
  if (!baseline.feasible) throw new Error('Commercial stress requires a feasible saved decision.');
  if (!Array.isArray(raw?.scenarios) || !raw.scenarios.length || raw.scenarios.length > 20) throw new Error('Supply 1–20 explicit joint scenarios.');
  const scenarios = raw.scenarios.map((s, index) => {
    if (typeof s.label !== 'string' || !s.label.trim() || s.label.length > 100) throw new Error('Every scenario needs a label of 1–100 characters.');
    if (!Number.isInteger(s.attendance) || s.attendance < 0 || !Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 1000000 || s.attendance > s.capacity) throw new Error('Attendance must be an integer within the declared capacity (1–1000000).');
    const price = money(s.ticketPrice, 'Ticket price'), variable = money(s.variableCostPerAttendee ?? 0, 'Variable cost'), fixed = money(s.fixedCosts ?? 0, 'Fixed costs');
    if (![s.attendance * price, s.attendance * variable, s.capacity * price].every(Number.isSafeInteger)) throw new Error('Scenario totals exceed exact cent arithmetic limits.');
    const fees = s.fees ?? {}, unavailableIds = s.unavailableIds ?? [];
    if (!fees || typeof fees !== 'object' || Array.isArray(fees) || Object.keys(fees).some(id => !ids.has(id))) throw new Error('Scenario fees must refer to saved candidates.');
    for (const fee of Object.values(fees)) money(fee, 'Scenario fee');
    if (!Array.isArray(unavailableIds) || unavailableIds.some(id => !ids.has(id))) throw new Error('Unavailable IDs must refer to saved candidates.');
    if (s.probability != null && (typeof s.probability !== 'number' || !Number.isFinite(s.probability) || s.probability < 0 || s.probability > 1)) throw new Error('Scenario probability must be between zero and one.');
    return { id: `s${index + 1}`, label: s.label.trim(), attendance: s.attendance, capacity: s.capacity, price, variable, fixed, fees, unavailableIds, probability: s.probability ?? null };
  });
  const weighted = scenarios.some(s => s.probability !== null);
  if (weighted && (scenarios.some(s => s.probability === null) || Math.abs(scenarios.reduce((sum, s) => sum + s.probability, 0) - 1) > 1e-9)) throw new Error('Provide probabilities for every scenario summing to one, or omit all probabilities.');
  const options = enumerateSlates(items, baseline.constraints).filter(s => s.feasible);
  const outcomes = scenarios.map(s => {
    const altered = items.map(i => ({ ...i, terms: { ...i.terms, ...(Object.hasOwn(s.fees, i.id) ? { fee: s.fees[i.id] } : {}), available: i.terms?.available === true && !s.unavailableIds.includes(i.id) } }));
    const optimum = optimizeSlate(altered, baseline.constraints);
    const alternatives = options.map(option => {
      const result = evaluateSelection(altered, baseline.constraints, option.selectedIds);
      const fee = result.totalFee == null ? null : cents(result.totalFee);
      const contribution = s.price - s.variable;
      if (fee != null && !Number.isSafeInteger(fee + s.fixed)) throw new Error('Combined scenario costs exceed exact cent arithmetic limits.');
      const breakEvenAttendance = fee == null || contribution <= 0 ? null : Math.ceil((fee + s.fixed) / contribution);
      return { selectedIds: option.selectedIds, feasible: result.feasible, violations: result.violations ?? result.reasons,
        policyUtility: result.score, utilityRegret: result.feasible && optimum.feasible ? Math.max(0, optimum.score - result.score) : null,
        artistFees: fee == null ? null : cash(fee), plannedRevenue: cash(s.attendance * s.price),
        operatingMargin: result.feasible && fee != null ? cash(s.attendance * contribution - fee - s.fixed) : null,
        breakEvenAttendance, breakEvenWithinCapacity: breakEvenAttendance !== null && breakEvenAttendance <= s.capacity };
    });
    return { scenarioId: s.id, label: s.label, probability: s.probability, feasibleRecovery: optimum.feasible, reoptimizedIds: optimum.selectedIds, alternatives };
  });
  const key = selectedIds => JSON.stringify([...selectedIds].sort());
  const comparison = options.map(option => {
    const rows = outcomes.map(o => o.alternatives.find(a => key(a.selectedIds) === key(option.selectedIds)));
    const universallyFeasible = rows.every(r => r.feasible);
    return { selectedIds: option.selectedIds, universallyFeasible, failedScenarios: rows.filter(r => !r.feasible).length,
      worstUtilityRegret: universallyFeasible ? Math.max(...rows.map(r => r.utilityRegret)) : null,
      worstOperatingMargin: universallyFeasible ? Math.min(...rows.map(r => r.operatingMargin)) : null,
      expectedOperatingMargin: weighted && universallyFeasible ? cash(Math.round(rows.reduce((sum, r, i) => sum + cents(r.operatingMargin) * scenarios[i].probability, 0))) : null };
  }).sort((a, b) => a.failedScenarios - b.failedScenarios || (a.worstUtilityRegret ?? Infinity) - (b.worstUtilityRegret ?? Infinity) || key(a.selectedIds).localeCompare(key(b.selectedIds)));
  const result = { version: '1.0', sourceDigest: decisionFingerprint(snapshot), assumptions: raw.scenarios, baselineIds: baseline.selectedIds,
    method: 'Exhaustive fixed-slate stress across organizer-declared joint scenarios; minimize worst policy-utility regret among slates feasible in every scenario. A failure is never replaced by a fictitious financial payoff.',
    robustAlternative: comparison.find(c => c.universallyFeasible) ?? null, comparison, outcomes,
    limitations: ['These scenarios and probabilities are supplied assumptions, not calibrated forecasts.', 'Attendance is held equal across slates within each scenario; cultural rank does not predict ticket sales.', 'Operating margin excludes taxes, refunds and costs not entered. Infeasible event margins are unknown.', 'The analysis does not change a decision, approve it, or reserve an artist.'] };
  return { ...result, digest: 'sha256:' + createHash('sha256').update(JSON.stringify(result)).digest('hex') };
}
