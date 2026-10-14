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
    ...(dossier.gmDecision ? ['## Festival GM', '', `State: ${dossier.gmDecision.state}. Mode: ${dossier.gmDecision.mode}.`, ''] : []),
    ...(dossier.festivalResearch ? ['## Market DNA and Taste Fit', '',
      ...dossier.festivalResearch.markets.map(market => `- ${market.city}: ${market.domains.length} domains; audience pool ${market.audience.returned}/${market.audience.requested}; comparable: ${market.audience.complete} [${market.audience.receiptId}]`),
      ...dossier.festivalResearch.profiles.map(profile => `- ${profile.name}: Taste Fit ${profile.tasteFit.total}; measured weight ${profile.tasteFit.measuredWeight}; missing ${profile.tasteFit.estimated.join(', ') || 'none'}; sensitivity bounds ${profile.tasteFit.uncertaintyBounds.lower}–${profile.tasteFit.uncertaintyBounds.upper}.`), ''] : []),
    ...(dossier.llmBenchmark ? ['## LLM-only control', '', `Status: ${dossier.llmBenchmark.status}. ${dossier.llmBenchmark.methodology}`, ''] : []),
    ...(dossier.themeSeason ? ['## Themed dates', '',
      `Research: ${dossier.themeSeason.research?.status ?? 'Shared festival evidence only'}.`, '',
      ...dossier.themeSeason.nights.flatMap(night => [
        `- ${night.date}: ${night.title}; anchor ${night.anchor.name}; audience ${night.segment}; ${night.rights.status}.`,
        `  Taste Fit ${night.tasteFit.total}; measured weight ${night.tasteFit.measuredWeight}; missing ${night.tasteFit.estimated.join(', ') || 'none'}. ${night.experienceBasis}`,
        ...(night.experience ?? []).map(kit => `  ${kit.target}: ${kit.candidates.map(card => card.name).join(', ') || 'No supported leads'}; ${kit.status} [${kit.receiptId}].`),
        `  Evidence: ${night.evidence.map(id => `[${id}]`).join(' ')}.`,
      ]), ''] : []),
    '## Selected slate', '',
    ...dossier.selectedArtists.map(item => `- **${item.name}** — fee ${item.fee ?? 'unknown'}; relative rank ${item.rank ?? 'unsupported'}; evidence ${item.evidenceCoverage.percent}%`), '',
    '## Risk register', '', ...(dossier.riskRegister.length ? dossier.riskRegister.map(item => `- **${item.severity.toUpperCase()} · ${item.type}:** ${item.text}`) : ['- No additional deterministic risks were produced from the saved fields.']), '',
    '## Opportunities', '', ...(dossier.opportunities.length ? dossier.opportunities.map(item => `- **${item.type}:** ${item.text}`) : ['- No deterministic opportunities were produced from the saved fields.']), '',
    '## Geographic evidence', '',
    ...dossier.marketEvidence.artists.map(item => `- ${item.name}: ${item.status}; receipts ${item.receiptIds.join(', ') || 'none'}`), '',
    ...(dossier.culturalIntelligence ? ['## Multi-market intelligence', '',
      ...dossier.culturalIntelligence.markets.map(item => `- ${item.name}: policy score ${item.marketScore}; evidence coverage ${item.evidenceCoveragePercent}%`),
      `- Exact route: ${dossier.culturalIntelligence.route.stops.map(item => item.market).join(' → ') || 'no feasible route'}`,
      `- Pair evidence coverage: ${dossier.culturalIntelligence.cohesion.evidenceCoveragePercent}%`, ''] : []),
    ...(dossier.audienceProfile?.enabled ? ['## Aggregate audience activation', '',
      `- Slate tags: ${dossier.audienceProfile.tags.map(item => item.name).filter(Boolean).join(', ') || 'none returned'}`,
      ...dossier.audienceProfile.crossDomain.map(item => `- ${item.targetType}: ${item.rows.map(row => row.name).filter(Boolean).join(', ') || 'none returned'}; receipt ${item.receiptId}`), ''] : []),
    ...(dossier.venuePlan ? ['## Venue qualification and economics', '',
      `- Qualified stops: ${dossier.venuePlan.routeEconomics.qualifiedStops}; out-of-band fallbacks: ${dossier.venuePlan.routeEconomics.fallbackStops}; unqualified: ${dossier.venuePlan.routeEconomics.unqualifiedStops}`,
      `- Total declared fixed cost: ${dossier.venuePlan.routeEconomics.totalDeclaredFixedCost} ${dossier.venuePlan.routeEconomics.currency}`,
      ...dossier.venuePlan.stops.map(item => `- ${item.market}: ${item.qualificationStatus}; ${item.venueName || 'no qualified venue'}; break-even ${item.breakEvenTickets} tickets`), ''] : []),
    ...(dossier.localActivation ? ['## Local activation', '',
      `- Markets: ${dossier.localActivation.summary.marketCount}; opener candidates: ${dossier.localActivation.summary.openerCandidates}; passing returned-popularity rule: ${dossier.localActivation.summary.openerCandidatesPassingSizeRule}`,
      `- Coordinate-confirmed poster leads within 2.5 km: ${dossier.localActivation.summary.posterLeadsWithinRadius}; aftershow leads: ${dossier.localActivation.summary.aftershowLeadsWithinRadius}`, ''] : []),
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
    culturalIntelligence: snapshot.intelligence ? {
      generatedAt: snapshot.intelligence.generatedAt,
      policy: 'Comparable returned-evidence coverage only; affinity percentiles remain scoped to their individual market response.',
      markets: snapshot.intelligence.markets.map(item => ({ name: item.name, marketScore: item.marketScore, meanObservedAffinity: item.meanAffinity, evidenceCoveragePercent: money(item.coverage * 100), artists: item.artists })),
      route: { feasible: snapshot.intelligence.route.feasible, method: snapshot.intelligence.route.method, checkedCount: snapshot.intelligence.route.checkedCount, totalDistanceKm: snapshot.intelligence.route.totalDistanceKm ?? null, stops: snapshot.intelligence.route.stops.map(item => ({ market: item.name, sequence: item.sequence, from: item.from, fromKm: item.fromKm, showDate: item.showDate })) },
      cohesion: snapshot.intelligence.cohesion,
      venueScouting: snapshot.intelligence.venueScouting,
      receiptIds: snapshot.intelligence.receipts.map(receipt => receipt.id),
      limitations: snapshot.intelligence.limitations
    } : null,
    festivalResearch: snapshot.festivalResearch || null,
    gmDecision: snapshot.gm || null,
    llmBenchmark: snapshot.benchmark || null,
    themeSeason: snapshot.themeSeason || null,
    audienceProfile: snapshot.intelligence?.audienceProfile || null,
    localActivation: snapshot.localActivation ? {
      generatedAt: snapshot.localActivation.generatedAt, headliner: snapshot.localActivation.headliner,
      summary: snapshot.localActivation.summary, markets: snapshot.localActivation.markets,
      limitations: snapshot.localActivation.limitations
    } : null,
    venuePlan: snapshot.venuePlan ? {
      generatedAt: snapshot.venuePlan.generatedAt,
      rules: snapshot.venuePlan.rules,
      artistFees: snapshot.venuePlan.artistFees,
      routeEconomics: snapshot.venuePlan.routeEconomics,
      stops: snapshot.venuePlan.stops.map(stop => ({
        market: stop.market, showDate: stop.showDate, qualificationStatus: stop.qualificationStatus,
        venueId: stop.selectedVenue?.venueId || null, venueName: stop.selectedVenue?.venueName || null,
        capacity: stop.selectedVenue?.capacity ?? null, capacitySource: stop.selectedVenue?.capacitySource || null,
        breakEvenTickets: stop.economics.breakEvenTickets, breakEvenWithinCapacity: stop.economics.breakEvenWithinCapacity,
        declaredFixedCost: stop.economics.declaredFixedCost, scenarios: stop.economics.scenarios, action: stop.action
      })),
      limitations: snapshot.venuePlan.limitations
    } : null,
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
      'Synthetic mode is product-development evidence and must not be represented as a live Qloo result.',
      ...(snapshot.venuePlan?.limitations || []),
      ...(snapshot.localActivation?.limitations || []),
      ...(snapshot.festivalResearch?.limitations || []),
      ...(snapshot.themeSeason?.limitations || [])
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
  } else if (/benchmark|llm|control/.test(lower) && dossier.llmBenchmark) {
    facts = [dossier.llmBenchmark];
    answer = `The identical-brief control is ${dossier.llmBenchmark.status}. ` + (dossier.llmBenchmark.comparison
      ? `Qloo policy-point difference: ${dossier.llmBenchmark.comparison.policyPointDelta}. This is one policy comparison, not measured commercial uplift.`
      : 'No valid comparative result is available.');
  } else if (/market dna|taste fit|demographic|cross.genre/.test(lower) && dossier.festivalResearch) {
    facts = dossier.festivalResearch.profiles; receiptIds = unique(facts.flatMap(profile => profile.receipts));
    answer = `Research covers ${dossier.festivalResearch.markets.length} markets and ${facts.length} candidate profiles. Taste Fit uses five explicit policy weights with missing measurements marked estimated; full-pool ranks drive the booking optimizer.`;
  } else if (/risk|weak|concern|clash/.test(lower)) {
    facts = dossier.riskRegister; receiptIds = unique(facts.flatMap(item => item.receiptIds || []));
    answer = facts.length ? dossier.riskRegister.map(item => `${item.severity}: ${item.text}`).join(' ') : 'The deterministic dossier produced no additional risk rows from the saved fields.';
  } else if (/backup|cancel|resilien|fallback/.test(lower)) {
    facts = [dossier.contingency];
    answer = dossier.contingency.robustSlate
      ? `The robust slate covers ${dossier.contingency.robustSlate.cancellationCoverage} of ${dossier.contingency.robustSlate.cancellationCount} cancellations and gives up ${dossier.contingency.robustSlate.utilitySacrifice} policy points versus the optimum.`
      : 'No robust slate is available for this saved decision.';
  } else if (/budget|cost|fee|money/.test(lower)) {
    facts = dossier.venuePlan ? [dossier.decision, dossier.venuePlan.routeEconomics] : [dossier.decision];
    answer = `The selected slate totals ${dossier.decision.totalFee ?? 'unknown'} and leaves ${dossier.decision.remainingBudget ?? 'unknown'} in the declared budget.` + (dossier.venuePlan ? ` The route plan records ${dossier.venuePlan.routeEconomics.totalDeclaredFixedCost} ${dossier.venuePlan.routeEconomics.currency} in entered fixed costs; its attendance rows are arithmetic scenarios, not forecasts.` : '');
  } else if (/city|geo|local|market/.test(lower)) {
    if (dossier.culturalIntelligence) {
      facts = dossier.culturalIntelligence.markets; receiptIds = dossier.culturalIntelligence.receiptIds;
      answer = 'Requested-market evidence-coverage scores are ' + facts.map(item => `${item.name}: ${item.marketScore}`).join('; ') + '. Affinity percentiles from separate heatmap responses are not compared, and these scores are not market-size or demand forecasts.';
    } else {
      facts = dossier.marketEvidence.artists; receiptIds = unique(facts.flatMap(item => item.receiptIds));
      answer = `For ${dossier.marketEvidence.city || 'the saved city'}, ` + facts.map(item => `${item.name}: ${item.status}`).join('; ') + '. This reports evidence availability, not market size.';
    }
  } else if (/audience|demographic|brand|movie|podcast|campaign|activation|theme|tag/.test(lower) && dossier.audienceProfile?.enabled) {
    facts = [dossier.audienceProfile];
    receiptIds = unique([
      dossier.audienceProfile.tagReceiptId,
      ...dossier.audienceProfile.demographics.map(item => item.receiptId),
      ...dossier.audienceProfile.crossDomain.map(item => item.receiptId)
    ]);
    answer = `The aggregate slate profile returned ${dossier.audienceProfile.tags.length} tags and ${dossier.audienceProfile.crossDomain.length} cross-domain groups. These are campaign-planning signals, not individual traits or conversion predictions.`;
  } else if (/evidence|receipt|source|proof/.test(lower)) {
    facts = dossier.sourceReceipts; receiptIds = facts.map(item => item.id);
    answer = `The dossier contains ${facts.length} compact source receipts. Each retains tool, status, source, fetch time and digest; the digest is not a provider signature.`;
  } else {
    answer = 'That question is not answerable from the supported dossier fields. Ask about a selected artist, budget, risks, cancellation resilience, geographic evidence or receipts.';
  }
  return { answer, facts, receiptIds: unique(receiptIds), grounding: 'saved_dossier_only', question: text };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const listHtml = rows => rows.length ? `<ul>${rows.map(row => `<li>${row}</li>`).join('')}</ul>` : '<p>None recorded.</p>';

export function dossierHtml(dossier) {
  if (!dossier?.sourceId) throw new Error('A built dossier is required.');
  const artists = dossier.selectedArtists.map(item => `<strong>${escapeHtml(item.name)}</strong> — fee ${escapeHtml(item.fee ?? 'unknown')}; relative rank ${escapeHtml(item.rank ?? 'unsupported')}; evidence ${escapeHtml(item.evidenceCoverage.percent)}%`);
  const risks = dossier.riskRegister.map(item => `<strong>${escapeHtml(item.severity.toUpperCase())} · ${escapeHtml(item.type)}</strong>: ${escapeHtml(item.text)}`);
  const opportunities = dossier.opportunities.map(item => `<strong>${escapeHtml(item.type)}</strong>: ${escapeHtml(item.text)}`);
  const receipts = dossier.sourceReceipts.map(item => `<code>${escapeHtml(item.id)}</code> · ${escapeHtml(item.tool)} · ${escapeHtml(item.status)} · ${escapeHtml(item.digest)}`);
  const markets = dossier.culturalIntelligence?.markets.map(item => `<strong>${escapeHtml(item.name)}</strong> — policy score ${escapeHtml(item.marketScore)}; evidence coverage ${escapeHtml(item.evidenceCoveragePercent)}%`) || [];
  const route = dossier.culturalIntelligence?.route.stops.map(item => escapeHtml(`${item.sequence}. ${item.market} · ${item.showDate} · ${item.fromKm} km from ${item.from}`)) || [];
  const profile = dossier.audienceProfile?.enabled ? [
    `<strong>Slate tags</strong> — ${escapeHtml(dossier.audienceProfile.tags.map(item => item.name).filter(Boolean).join(', ') || 'none returned')}`,
    ...dossier.audienceProfile.crossDomain.map(item => `<strong>${escapeHtml(item.targetType)}</strong> — ${escapeHtml(item.rows.map(row => row.name).filter(Boolean).join(', ') || 'none returned')}`)
  ] : [];
  const venues = dossier.venuePlan?.stops.map(item => `<strong>${escapeHtml(item.market)}</strong> — ${escapeHtml(item.qualificationStatus)}; ${escapeHtml(item.venueName || 'no qualified venue')}; break-even ${escapeHtml(item.breakEvenTickets)} tickets`) || [];
  const activation = dossier.localActivation ? [
    `Markets ${escapeHtml(dossier.localActivation.summary.marketCount)}; opener candidates ${escapeHtml(dossier.localActivation.summary.openerCandidates)}; passing returned-popularity rule ${escapeHtml(dossier.localActivation.summary.openerCandidatesPassingSizeRule)}`,
    `Coordinate-confirmed poster leads within 2.5 km ${escapeHtml(dossier.localActivation.summary.posterLeadsWithinRadius)}; aftershow leads ${escapeHtml(dossier.localActivation.summary.aftershowLeadsWithinRadius)}`
  ] : [];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Houselights decision dossier</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#15233d}h1,h2{line-height:1.2}code{overflow-wrap:anywhere}.meta{color:#526078}section{break-inside:avoid;margin:28px 0}@media print{body{margin:0;max-width:none}a{color:inherit}}</style></head><body><header><h1>Houselights decision dossier</h1><p class="meta">Source ${escapeHtml(dossier.sourceId)} · ${escapeHtml(dossier.mode)} · generated ${escapeHtml(dossier.generatedAt)}</p></header><section><h2>Executive decision</h2><p>${escapeHtml(dossier.executiveSummary)}</p></section><section><h2>Selected slate</h2>${listHtml(artists)}</section>${dossier.culturalIntelligence ? `<section><h2>Multi-market intelligence</h2>${listHtml(markets)}<h3>Exact route</h3>${listHtml(route)}</section>` : ''}${dossier.audienceProfile?.enabled ? `<section><h2>Aggregate audience activation</h2>${listHtml(profile)}</section>` : ''}${dossier.venuePlan ? `<section><h2>Venue qualification and economics</h2>${listHtml(venues)}</section>` : ''}${dossier.localActivation ? `<section><h2>Local activation</h2>${listHtml(activation)}</section>` : ''}<section><h2>Risk register</h2>${listHtml(risks)}</section><section><h2>Opportunities</h2>${listHtml(opportunities)}</section><section><h2>Receipt index</h2>${listHtml(receipts)}</section><section><h2>Evidence limits</h2>${listHtml(dossier.limitations.map(escapeHtml))}</section></body></html>`;
}
