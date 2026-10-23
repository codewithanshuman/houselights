import { benchmarkBrief } from '../gm.mjs';
import { enumerateSlates, evaluateSelection } from '../optimizer.mjs';
import { digest } from './experiment-schema.mjs';

const key = ids => [...ids].sort().join('\0');
const unavailable = (status, reason) => ({ status, available: false, selectedIds: [], reason });
const describe = result => ({ status: result.feasible ? 'feasible' : 'infeasible', available: true,
  feasible: result.feasible, selectedIds: result.selectedIds, totalFee: result.totalFee,
  violations: result.violations, violationCodes: result.violationCodes ?? [] });

export function constraintOnly(items, constraints) {
  if (constraints.minimumAverageFit != null) return unavailable('not_comparable', 'The original fit floor depends on Qloo. Declare shared_operational policy explicitly for a fair evidence-free comparison.');
  const winner = enumerateSlates(items, constraints).filter(row => row.feasible)
    .sort((a, b) => a.totalFee - b.totalFee || key(a.selectedIds).localeCompare(key(b.selectedIds)))[0];
  return winner ? { ...describe(winner), selectionRule: 'Minimum quoted fee among operationally feasible exact-size lineups.' }
    : unavailable('infeasible', 'No lineup satisfies all shared operational constraints.');
}

export function savedLLMOnly(snapshot, constraints) {
  if (constraints.minimumAverageFit != null) return unavailable('not_comparable', 'An evidence-free model cannot evaluate the original Qloo-derived fit floor.');
  const benchmark = snapshot.benchmark;
  if (!benchmark) return unavailable('unavailable', 'No saved LLM-only control for this locked brief. No response was invented.');
  const current = digest(benchmarkBrief(snapshot, constraints));
  if (benchmark.briefDigest !== current) return unavailable('stale', 'The saved LLM control was generated for a different brief or policy. Re-run a matched control.');
  if (benchmark.status === 'unavailable' || benchmark.status === 'not_comparable') return unavailable(benchmark.status, benchmark.reason ?? 'The saved control did not produce a comparable selection.');
  if (!Array.isArray(benchmark.control?.selectedIds)) return { status: 'invalid_control', available: true,
    feasible: false, selectedIds: [], violationCodes: ['invalid_selection'],
    violations: [benchmark.control?.error ?? 'The model returned no valid candidate selection.'],
    reason: 'The saved model response was invalid and was not repaired.' };
  try {
    const evaluated = evaluateSelection(snapshot.memo.items, constraints, benchmark.control.selectedIds);
    return { ...describe(evaluated), generation: benchmark.generation ? {
      provider: benchmark.generation.provider, model: benchmark.generation.model,
      promptDigest: benchmark.generation.promptDigest, responseDigest: benchmark.generation.responseDigest,
      mode: benchmark.generation.mode, status: benchmark.generation.status } : null,
      selectionRule: 'Saved tool-free model output. Invalid selections remain invalid; no optimizer repair.' };
  } catch (error) { return { status: 'invalid_control', available: true, feasible: false,
    selectedIds: [], violationCodes: ['invalid_selection'], violations: [error.message],
    reason: 'The saved model response was invalid and was not repaired.' }; }
}
