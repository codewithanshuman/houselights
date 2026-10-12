import { buildContingencyPlan } from './contingency.mjs';

const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const unique = values => [...new Set(values.filter(Boolean))];
const evidenceFields = ['rank', 'local', 'comparison', 'trends'];

function coverage(item) {
  const supported = evidenceFields.filter(field => item.evidence?.[field] === true);
  return { supported, missing: evidenceFields.filter(field => !supported.includes(field)), percent: money(supported.length / evidenceFields.length * 100) };
}

function matrix(selected) {
  const rows = [];
  for (let left = 0; left < selected.length; left++) for (let right = left + 1; right < selected.length; right++) {
    const a = selected[left], b = selected[right];
    const aGenre = String(a.terms?.genre || '').trim().toLowerCase(), bGenre = String(b.terms?.genre || '').trim().toLowerCase();
    rows.push({
      artistA: a.id, artistB: b.id, names: [a.name, b.name],
      buyerGenreRelationship: !aGenre || !bGenre ? 'unknown' : aGenre === bGenre ? 'same' : 'different',
      rankDistance: Number.isFinite(a.rank) && Number.isFinite(b.rank) ? Math.abs(a.rank - b.rank) : null,
      bothHaveAudienceComparisonEvidence: a.evidence?.comparison === true && b.evidence?.comparison === true,
      combinedEvidenceCoveragePercent: money((coverage(a).supported.length + coverage(b).supported.length) / 8 * 100),
      interpretation: 'Planning relationship derived from buyer-entered genres and evidence coverage; not a Qloo pairwise compatibility score.'
    });
  }
  return rows;
}

function risks(snapshot, selected, contingency) {
  const output = [];
  const currency = snapshot.memo.currency || snapshot.input?.currency || 'GBP';
  if (!snapshot.memo.slate.feasible) output.push({ severity: 'critical', type: 'infeasible', text: 'The saved slate does not satisfy all declared booking constraints.', receiptIds: [] });
  for (const item of selected) {
    const itemCoverage = coverage(item);
    if (itemCoverage.missing.length) output.push({
      severity: itemCoverage.missing.includes('rank') ? 'high' : 'medium', type: 'evidence_gap', artistId: item.id,
      text: `${item.name} is missing ${itemCoverage.missing.join(', ')} evidence.`, receiptIds: item.receipts || []
    });
    if (item.evidence?.trends === true && item.momentum === 'cooling') output.push({
      severity: 'medium', type: 'cooling_signal', artistId: item.id,
      text: `${item.name} has an observed cooling trend direction; this is not a demand forecast.`, receiptIds: item.receipts || []
    });
  }
  const total = selected.reduce((sum, item) => sum + (item.terms?.fee || 0), 0);
  for (const item of selected) if (total > 0 && typeof item.terms?.fee === 'number' && item.terms.fee / total >= .5) output.push({
    severity: 'high', type: 'fee_concentration', artistId: item.id,
    text: `${item.name} represents ${money(item.terms.fee / total * 100)}% of the selected ${currency} fee total.`, receiptIds: []
  });
  for (const dependency of contingency.criticalDependencies || []) output.push({
    severity: 'critical', type: 'cancellation_dependency', artistId: dependency.canceledId,
    text: 'No clean one-for-one cancellation fallback exists while the other selected artists remain fixed.', receiptIds: []
  });
  return output;
}

function opportunities(snapshot, selected, contingency) {
  const selectedIds = new Set(selected.map(item => item.id));
  const output = [];
  if (contingency.robustSlate?.differsFromBaseline) output.push({
    type: 'robust_slate', text: `A different slate covers ${contingency.robustSlate.cancellationCoverage} of ${contingency.robustSlate.cancellationCount} single-artist cancellations at a ${contingency.robustSlate.utilitySacrifice}-point utility cost.`,
    artistIds: contingency.robustSlate.selectedIds
  });
  for (const backup of contingency.backupBench || []) output.push({
    type: 'backup_bench', text: `${backup.name} appears in ${backup.selectedScenarios} feasible contingency slates.`, artistIds: [backup.id]
  });
  for (const item of snapshot.memo.items.filter(item => !selectedIds.has(item.id) && item.found === true)) {
    if (item.terms?.available === true && typeof item.terms?.fee === 'number') output.push({
      type: 'bookable_discovery', text: `${item.name} was discovered outside the original shortlist and now has bookable terms.`, artistIds: [item.id]
    });
    else output.push({ type: 'discovery_to_qualify', text: `${item.name} was discovered but still needs a quote and confirmed availability.`, artistIds: [item.id] });
  }
  return output.slice(0, 12);
}

function markdown(dossier) {
  const lines = [
    `# Houselights decision dossier`, '', `Source: ${dossier.sourceId}`, `Mode: ${dossier.mode}`, `City: ${dossier.marketEvidence.city || 'Not supplied'}`, '',
    '## Executive decision', '', dossier.executiveSummary, '',
    '## Selected slate', '',
    ...dossier.selectedArtists.map(item => `- **${item.name}** — fee ${item.fee ?? 'unknown'}; relative rank ${item.rank ?? 'unsupported'}; evidence ${item.evidenceCoverage.percent}%`), '',
    '## Risk register', '', ...(dossier.riskRegister.length ? dossier.riskRegister.map(item => `- **${item.severity.toUpperCase()} · ${item.type}:** ${item.text}`) : ['- No additional deterministic risks were produced from the saved fields.']), '',
    '## Opportunities', '', ...(dossier.opportunities.length ? dossier.opportunities.map(item => `- **${item.type}:** ${item.text}`) : ['- No deterministic opportunities were produced from the saved fields.']), '',
    '## Geographic evidence', '',
    ...dossier.marketEvidence.artists.map(item => `- ${item.name}: ${item.status}; receipts ${item.receiptIds.join(', ') || 'none'}`), '',
    '## Limits', '', ...dossier.limitations.map(item => `- ${item}`)
  ];
  return lines.join('\n');
}

export function buildDossier(snapshot) {
  if (!snapshot?.memo?.items || !snapshot.memo.slate) throw new Error('A complete saved run is required.');
  const selectedIds = new Set(snapshot.memo.slate.selectedIds || []);
  const selected = snapshot.memo.items.filter(item => selectedIds.has(item.id));
  const contingency = buildContingencyPlan(snapshot.memo.items, snapshot.memo.constraints);
  const selectedArtists = selected.map(item => ({
    id: item.id, name: item.name, fee: item.terms?.fee ?? null, genre: item.terms?.genre || null,
    available: item.terms?.available === true, rank: item.evidence?.rank === true ? item.rank : null,
    fit: item.evidence?.rank === true ? item.fit : null, momentum: item.evidence?.trends === true ? item.momentum : 'unverified',
    local: item.evidence?.local === true ? item.local : 'unverified', evidenceCoverage: coverage(item),
    claimIds: (item.claims || []).map(claim => claim.id), receiptIds: unique(item.receipts || [])
  }));
  const dossier = {
    version: '1.0', sourceId: snapshot.id, generatedAt: new Date().toISOString(), mode: snapshot.mock ? 'synthetic' : 'live',
    executiveSummary: snapshot.memo.slate.feasible
      ? `The exact optimizer selected ${selected.length} artists at a total buyer-entered fee of ${snapshot.memo.slate.totalFee}, leaving ${snapshot.memo.slate.remainingBudget} in the declared budget. The score is policy utility, not predicted demand.`
      : 'No feasible slate satisfies every declared constraint; use the optimizer diagnostics before beginning outreach.',
    decision: {
      feasible: snapshot.memo.slate.feasible, selectedIds: [...selectedIds], totalFee: snapshot.memo.slate.totalFee,
      remainingBudget: snapshot.memo.slate.remainingBudget, policyScore: snapshot.memo.slate.score,
      confidence: snapshot.memo.slate.confidence, objectiveBreakdown: snapshot.memo.slate.objectiveBreakdown
    },
    selectedArtists, compatibilityMatrix: matrix(selected),
    marketEvidence: {
      city: snapshot.input?.city || snapshot.memo.input?.city || null,
      sourceMode: snapshot.mock ? 'synthetic' : 'live',
      artists: selected.map(item => ({
        id: item.id, name: item.name,
        status: item.evidence?.local === true ? item.local : 'unverified',
        receiptIds: (item.claims || []).filter(claim => claim.id.endsWith(':local')).flatMap(claim => claim.text.match(/\[(r\d+)\]/g)?.map(value => value.slice(1, -1)) || [])
      })),
      limitation: 'This is city-scoped evidence availability. It contains no invented coordinates, density estimates or seasonal forecasts.'
    },
    contingency: {
      resilience: contingency.resilience, robustSlate: contingency.robustSlate,
      backupBench: contingency.backupBench, criticalDependencies: contingency.criticalDependencies
    },
    riskRegister: [], opportunities: [],
    sourceReceipts: (snapshot.receipts || []).map(receipt => ({
      id: receipt.id, tool: receipt.tool, status: receipt.status, source: receipt.source,
      fetchedAt: receipt.fetchedAt, digest: receipt.digest, summary: receipt.summary
    })),
    limitations: [
      'Qloo evidence describes cultural context and relative ranking; it does not forecast ticket sales, attendance or revenue.',
      'Fees, availability, genres and operational status are buyer-entered unless a contract is recorded elsewhere.',
      'Compatibility rows are planning comparisons, not pairwise affinity scores.',
      'Synthetic mode is product-development evidence and must not be represented as a live Qloo result.'
    ]
  };
  dossier.riskRegister = risks(snapshot, selected, contingency);
  dossier.opportunities = opportunities(snapshot, selected, contingency);
  dossier.markdown = markdown(dossier);
  return dossier;
}

export function answerDossierQuestion(dossier, question) {
  const text = String(question || '').trim().slice(0, 500);
  if (!text) throw new Error('Ask a non-empty question.');
  const lower = text.toLowerCase();
  let answer, facts = [], receiptIds = [];
  const artist = dossier.selectedArtists.find(item => {
    const escaped = item.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, 'i').test(lower);
  });
  if (artist) {
    facts = [artist]; receiptIds = artist.receiptIds;
    answer = `${artist.name} has a buyer-entered fee of ${artist.fee ?? 'unknown'}, relative rank ${artist.rank ?? 'unsupported'}, ${artist.evidenceCoverage.percent}% evidence coverage, local status ${artist.local}, and momentum ${artist.momentum}.`;
  } else if (/risk|weak|concern|clash/.test(lower)) {
    facts = dossier.riskRegister; receiptIds = unique(facts.flatMap(item => item.receiptIds || []));
    answer = facts.length ? dossier.riskRegister.map(item => `${item.severity}: ${item.text}`).join(' ') : 'The deterministic dossier produced no additional risk rows from the saved fields.';
  } else if (/backup|cancel|resilien|fallback/.test(lower)) {
    facts = [dossier.contingency];
    answer = dossier.contingency.robustSlate
      ? `The robust slate covers ${dossier.contingency.robustSlate.cancellationCoverage} of ${dossier.contingency.robustSlate.cancellationCount} cancellations and gives up ${dossier.contingency.robustSlate.utilitySacrifice} policy points versus the optimum.`
      : 'No robust slate is available for this saved decision.';
  } else if (/budget|cost|fee|money/.test(lower)) {
    facts = [dossier.decision];
    answer = `The selected slate totals ${dossier.decision.totalFee ?? 'unknown'} and leaves ${dossier.decision.remainingBudget ?? 'unknown'} in the declared budget.`;
  } else if (/city|geo|local|market/.test(lower)) {
    facts = dossier.marketEvidence.artists; receiptIds = unique(facts.flatMap(item => item.receiptIds));
    answer = `For ${dossier.marketEvidence.city || 'the saved city'}, ` + facts.map(item => `${item.name}: ${item.status}`).join('; ') + '. This reports evidence availability, not market size.';
  } else if (/evidence|receipt|source|proof/.test(lower)) {
    facts = dossier.sourceReceipts; receiptIds = facts.map(item => item.id);
    answer = `The dossier contains ${facts.length} compact source receipts. Each retains tool, status, source, fetch time and digest; the digest is not a provider signature.`;
  } else {
    answer = 'That question is not answerable from the supported dossier fields. Ask about a selected artist, budget, risks, cancellation resilience, geographic evidence or receipts.';
  }
  return { answer, facts, receiptIds: unique(receiptIds), grounding: 'saved_dossier_only', question: text };
}
