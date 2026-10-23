import { enumerateSlates } from '../optimizer.mjs';
import { evidenceDependencies, stripEvidence } from '../decision-proof.mjs';

const profiles = [
  { name: 'Declared policy', factors: {} },
  { name: 'Half audience weight', factors: { fit: .5 } },
  { name: 'Double audience weight', factors: { fit: 2 } },
  { name: 'Double cultural connection', factors: { culturalCohesion: 2, culturalBreadth: 2 } },
  { name: 'Double evidence caution', factors: { riskPenalty: 2, pairEvidencePenalty: 2 } },
  { name: 'Double recovery preference', factors: { cancellationReadiness: 2 } },
];
const key = ids => [...ids].sort().join('\0');
function winner(rows, factors) {
  return rows.map(row => ({ row, value: Object.entries(row.rawBreakdown).reduce((sum, [name, value]) => sum + value * (factors[name] ?? 1), 0) }))
    .sort((a, b) => Math.abs(b.value - a.value) > 1e-9 ? b.value - a.value :
      a.row.totalFee - b.row.totalFee || key(a.row.selectedIds).localeCompare(key(b.row.selectedIds)))[0]?.row ?? null;
}
export function selectionWeightSensitivity(snapshot, constraints) {
  const fullItems = snapshot.memo.items;
  const links = new Map(fullItems.map(item => [item.id, evidenceDependencies(snapshot, item)]));
  const noEvidenceItems = stripEvidence(fullItems, links, 'all');
  const fullRows = enumerateSlates(fullItems, constraints).filter(row => row.feasible);
  const noEvidenceRows = enumerateSlates(noEvidenceItems, constraints).filter(row => row.feasible);
  const rows = profiles.map(profile => {
    const full = winner(fullRows, profile.factors), withdrawn = winner(noEvidenceRows, profile.factors);
    return { name: profile.name, factors: profile.factors,
      fullSelectedIds: full?.selectedIds ?? [], noEvidenceSelectedIds: withdrawn?.selectedIds ?? [],
      fullFeasible: !!full, noEvidenceFeasible: !!withdrawn,
      differentSelections: !!full && !!withdrawn && key(full.selectedIds) !== key(withdrawn.selectedIds) };
  });
  return { profiles: rows, testedProfiles: rows.length,
    changedUnderDeclaredPolicy: rows[0].differentSelections,
    changedUnderOtherProfiles: rows.slice(1).filter(row => row.differentSelections).length,
    availableProfiles: rows.filter(row => row.fullFeasible && row.noEvidenceFeasible).length,
    interpretation: 'Discrete preference sensitivity of the full-versus-no-evidence selection. These weights express organizer values, not empirical probabilities.' };
}
