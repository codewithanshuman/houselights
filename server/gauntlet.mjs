import { analyzeSlate } from './analysis.mjs';
import { optimizeSlate } from './optimizer.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const selected = (items, slate) => (slate?.selectedIds || []).map(id => items.find(item => item.id === id)).filter(Boolean);
const pct = (value, total) => total > 0 ? Math.round(value / total * 100) : 0;

// Gamification is tied to useful booking behaviour. The browser never awards
// points: this function recomputes the slate and every mission from evidence
// and assumptions held by the server.
export function evaluateGauntlet(items, constraints, sourceConstraints = constraints) {
  const slate = optimizeSlate(items, constraints);
  const analysis = analyzeSlate(items, constraints);
  const chosen = selected(items, slate);
  const sourceBudget = Number(sourceConstraints?.budget);
  const currentBudget = Number(slate.constraints?.budget);
  const targetBudget = finite(sourceBudget) ? Math.round(sourceBudget * .9 * 100) / 100 : null;
  const ranked = chosen.filter(item => item.evidence?.rank || finite(item.rank) || finite(item.fit)).length;
  const genres = new Set(chosen.map(item => String(item.terms?.genre || '').trim().toLowerCase()).filter(Boolean));
  const discoveries = chosen.filter(item => item.found).length;
  const shock = analysis.feeScenarios.find(row => row.increasePercent === 10);
  const touched = (slate.constraints?.lockedIds?.length || 0) + (slate.constraints?.excludedIds?.length || 0);
  const targetGenres = Math.min(Math.max(1, Number(slate.constraints?.slots) || 1), 3);
  const missions = [
    {
      id: 'pressure', title: 'The 90% Room', points: 150, icon: '↓',
      instruction: targetBudget == null ? 'Establish a source budget, then land a feasible slate at 90% of it.' : `Land a feasible slate at or below ${targetBudget.toLocaleString('en-GB')} — 90% of the source budget.`,
      achieved: slate.feasible && targetBudget != null && currentBudget <= targetBudget,
      progress: targetBudget == null ? 'Source budget unavailable' : `${currentBudget.toLocaleString('en-GB')} / ${targetBudget.toLocaleString('en-GB')} target`,
      action: 'pressure', actionLabel: 'Set 90% budget'
    },
    {
      id: 'discovery', title: 'Open the Side Door', points: 150, icon: '✦',
      instruction: 'Book at least one Qloo-discovered act with a buyer-entered quote and confirmed availability.',
      achieved: slate.feasible && discoveries > 0,
      progress: `${discoveries} discovered act${discoveries === 1 ? '' : 's'} in the slate`,
      action: 'discovery', actionLabel: 'Require discovery'
    },
    {
      id: 'diversity', title: 'Three Colours', points: 100, icon: '◒',
      instruction: `Build a feasible slate spanning ${targetGenres} buyer-defined planning genres.`,
      achieved: slate.feasible && genres.size >= targetGenres,
      progress: `${genres.size} / ${targetGenres} genres represented`,
      action: 'diversity', actionLabel: 'Cap one per genre'
    },
    {
      id: 'shock', title: 'Rain Check', points: 150, icon: '↗',
      instruction: 'Keep the exact selected slate feasible if every known quote rises by 10%.',
      achieved: slate.feasible && shock?.currentSlateFeasible === true,
      progress: shock?.currentSlateFeasible == null ? 'Quote shock cannot be evaluated' : shock.currentSlateFeasible ? 'Current slate survives +10%' : 'Current slate breaks at +10%',
      action: 'shock', actionLabel: 'Show stress test'
    },
    {
      id: 'evidence', title: 'Receipts, Please', points: 100, icon: '◇',
      instruction: 'Select only acts with supported relative-rank evidence.',
      achieved: slate.feasible && chosen.length > 0 && ranked === chosen.length,
      progress: `${ranked} / ${chosen.length || slate.constraints?.slots || 0} selected acts supported`,
      action: 'evidence', actionLabel: 'Inspect evidence'
    },
    {
      id: 'conviction', title: 'Make the Call', points: 100, icon: '◆',
      instruction: 'Use at least one lock or exclusion and still produce a feasible slate.',
      achieved: slate.feasible && touched > 0,
      progress: `${touched} explicit decision${touched === 1 ? '' : 's'} recorded`,
      action: 'conviction', actionLabel: 'Shape the slate'
    }
  ];
  const xp = missions.filter(mission => mission.achieved).reduce((sum, mission) => sum + mission.points, 0);
  const totalXp = missions.reduce((sum, mission) => sum + mission.points, 0);
  const completed = missions.filter(mission => mission.achieved).length;
  const tier = xp >= 650 ? 'House legend' : xp >= 450 ? 'Headliner' : xp >= 250 ? 'Talent buyer' : xp >= 100 ? 'Door opener' : 'Soundcheck';
  const next = missions.find(mission => !mission.achieved);
  return {
    version: '1.0', verified: true, xp, totalXp, completed, total: missions.length, tier,
    progressPercent: pct(xp, totalXp), missions,
    nextMove: next ? `${next.title}: ${next.instruction}` : 'Every mission is complete. Save this scenario as your decision-room benchmark.',
    metrics: {
      feasible: slate.feasible,
      budgetUsePercent: finite(slate.totalFee) && currentBudget > 0 ? pct(slate.totalFee, currentBudget) : null,
      genreCount: genres.size,
      discoveredCount: discoveries,
      rankCoveragePercent: pct(ranked, chosen.length),
      quoteShock10: shock?.currentSlateFeasible ?? null
    },
    slate,
    analysisBasis: analysis.basis
  };
}
