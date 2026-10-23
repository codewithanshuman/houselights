import { optimizeSlate } from '../optimizer.mjs';
import { digest } from './experiment-schema.mjs';

const ARM_NAMES = ['qloo', 'llm', 'non_qloo'];
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const validRef = value => typeof value === 'string' && value.trim().length >= 6 && value.length <= 500;
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

// Distinct from fixed-pool selection: each arm has its own candidate list.
// Common verification fields are recorded attestations, never self-certified
// independent truth. Real external source review is a separate human step.
export function compareDiscovery(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A discovery manifest is required.');
  const brief = raw.brief;
  if (!brief || typeof brief.city !== 'string' || !brief.city.trim() || !Number.isFinite(brief.budget) ||
    brief.budget < 0 || !Number.isInteger(brief.slots) || brief.slots < 1 || brief.slots > 12 ||
    !validTimestamp(brief.eventDate) || typeof brief.genre !== 'string' || !brief.genre.trim())
    fail('One shared city, event date, genre, non-negative budget and 1–12 slots are required.');
  if (!raw.arms || typeof raw.arms !== 'object' || Object.keys(raw.arms).some(name => !ARM_NAMES.includes(name)))
    fail('Provide declared qloo, llm and non_qloo discovery arms.');
  const constraints = { budget: brief.budget, slots: brief.slots, maxPerGenre: brief.maxPerGenre ?? brief.slots,
    discoveryMin: 0, lockedIds: [], excludedIds: [] };
  const methods = {};
  for (const name of ARM_NAMES) {
    const arm = raw.arms[name];
    if (!arm) { methods[name] = { status: 'not_submitted', candidates: [], operationallyEligible: [],
      reason: 'No independently generated candidate list was submitted.' }; continue; }
    if (!Array.isArray(arm.candidates) || arm.candidates.length > 20 ||
      arm.candidates.some(candidate => !candidate || typeof candidate.id !== 'string' || !candidate.id.trim() ||
        typeof candidate.name !== 'string' || !candidate.name.trim())) fail(`Invalid ${name} candidate list.`);
    if (new Set(arm.candidates.map(candidate => candidate.id)).size !== arm.candidates.length) fail(`Duplicate ${name} candidate identities.`);
    const provenance = { origin: name, runDigest: validRef(arm.runDigest) ? arm.runDigest : null,
      sourceReference: validRef(arm.sourceReference) ? arm.sourceReference : null,
      generatedAt: validTimestamp(arm.generatedAt) ? new Date(arm.generatedAt).toISOString() : null };
    const candidates = arm.candidates.map(candidate => {
      const check = candidate.commonCheck ?? {};
      const identityDocumented = validRef(check.identitySource) && validTimestamp(check.checkedAt);
      const availabilityDocumented = validRef(check.availabilitySource) && validTimestamp(check.checkedAt);
      const fee = candidate.terms?.fee;
      const operationallyEligible = identityDocumented && availabilityDocumented &&
        candidate.terms?.available === true && Number.isFinite(fee) && fee >= 0 && fee <= brief.budget;
      return { id: candidate.id, name: candidate.name, fee: Number.isFinite(fee) ? fee : null,
        genre: candidate.terms?.genre ?? null, available: candidate.terms?.available === true,
        identityDocumented, availabilityDocumented, operationallyEligible,
        identitySource: identityDocumented ? check.identitySource : null,
        availabilitySource: availabilityDocumented ? check.availabilitySource : null,
        checkedAt: validTimestamp(check.checkedAt) ? new Date(check.checkedAt).toISOString() : null };
    });
    const eligible = candidates.filter(candidate => candidate.operationallyEligible);
    const optimizerItems = eligible.map(candidate => ({ id: candidate.id, name: candidate.name,
      found: false, evidence: {}, terms: { fee: candidate.fee, genre: candidate.genre, available: true } }));
    const operational = eligible.length >= brief.slots ? optimizeSlate(optimizerItems, constraints) : null;
    methods[name] = { status: !provenance.runDigest || !provenance.sourceReference || !provenance.generatedAt ? 'provenance_incomplete' : 'documented',
      provenance, candidates, operationallyEligible: eligible.map(candidate => candidate.id),
      feasibleLineupExists: operational?.feasible ?? false,
      eligibleCount: eligible.length,
      validation: 'Common identity, availability and fee checks are documented organizer attestations; references require independent source review.' };
  }
  const overlap = [];
  for (let i = 0; i < ARM_NAMES.length; i++) for (let j = i + 1; j < ARM_NAMES.length; j++) {
    const a = methods[ARM_NAMES[i]].operationallyEligible, b = methods[ARM_NAMES[j]].operationallyEligible;
    const union = new Set([...a, ...b]);
    overlap.push({ arms: [ARM_NAMES[i], ARM_NAMES[j]], sharedEligibleIds: a.filter(id => b.includes(id)),
      jaccard: union.size ? a.filter(id => b.includes(id)).length / union.size : null });
  }
  const provenanceRefs = ARM_NAMES.map(name => methods[name].provenance?.sourceReference).filter(Boolean);
  const runDigests = ARM_NAMES.map(name => methods[name].provenance?.runDigest).filter(Boolean);
  const independentOriginsDocumented = provenanceRefs.length === 3 && runDigests.length === 3 &&
    new Set(provenanceRefs).size === 3 && new Set(runDigests).size === 3;
  const report = { version: 'discovery-comparison-v1', experimentType: 'independent_discovery',
    brief: { ...brief, constraints }, methods, overlap,
    comparable: independentOriginsDocumented && ARM_NAMES.every(name => methods[name].status === 'documented'),
    independentOriginsDocumented,
    independentValidation: { status: 'pending_external_review', reviewedCandidates: 0,
      reason: 'The app cannot establish that submitted source references are genuine or independent without external review.' },
    limitations: ['Candidate discovery is a separate experiment from the fixed-pool selection comparison.',
      'Eligible candidate counts and overlap are descriptive; no Qloo policy score grades these lists.',
      'A source reference is not independently verified evidence until reviewed by an external evaluator.'] };
  report.reportDigest = digest(report);
  return report;
}
