import { buildContingencyPlan } from './contingency.mjs';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function evidenceCoverage(item) {
  const fields = ['rank', 'local', 'comparison', 'trends'];
  const supported = fields.filter(field => item.evidence?.[field] === true);
  return { supported, missing: fields.filter(field => !supported.includes(field)), percent: money(supported.length / fields.length * 100) };
}

function fallbackFor(contingency, artistId, names) {
  const row = contingency.cancellations.find(item => item.canceledId === artistId);
  if (!row) return null;
  return {
    feasible: row.feasible,
    replacements: row.replacementIds.map(id => ({ id, name: names.get(id) || id })),
    totalFee: row.totalFee ?? null,
    scoreDelta: row.scoreDelta ?? null,
    minimumBudget: row.relaxations?.minimumBudget ?? null,
    reasons: row.reasons || []
  };
}

function nextAction(deal) {
  if (deal.stage === 'research_complete') return { action: 'approve_pitch', rationale: 'Research exists and requires a human approval before outreach.' };
  if (deal.stage === 'pitch_approved') return { action: 'send_outreach', rationale: 'The pitch is approved and no outreach has been recorded.' };
  if (deal.stage === 'sent') {
    const due = deal.followUps.find(item => item.status === 'scheduled');
    return { action: due ? 'follow_up' : 'record_response', dueAt: due?.dueAt || null, rationale: due ? `The next scheduled checkpoint is Day ${due.day}.` : 'All scheduled checkpoints are resolved; record the outcome.' };
  }
  if (deal.stage === 'responded') return { action: 'classify_response', rationale: 'The response has not yet produced a secured, negotiating or declined outcome.' };
  if (deal.stage === 'negotiating') return { action: 'review_counteroffer', rationale: 'Compare the counteroffer with the deterministic slate ceiling before accepting.' };
  if (['secured', 'logistics_pending'].includes(deal.stage)) return { action: 'complete_logistics', rationale: 'Complete the required operational checklist before scheduling the show.' };
  if (deal.stage === 'show_scheduled') return { action: 'monitor_delivery', rationale: 'The core show fields are complete; monitor remaining contract and promotion items.' };
  return { action: 'activate_fallback', rationale: 'The deal is declined; use the saved cancellation substitution if it remains feasible.' };
}

export function buildCampaign(snapshot, pipeline) {
  if (!snapshot?.memo?.slate?.feasible || !pipeline?.deals) throw new Error('A feasible saved slate and its booking pipeline are required.');
  const selected = new Set(snapshot.memo.slate.selectedIds);
  const selectedItems = snapshot.memo.items.filter(item => selected.has(item.id));
  const names = new Map(snapshot.memo.items.map(item => [item.id, item.name]));
  const contingency = buildContingencyPlan(snapshot.memo.items, snapshot.memo.constraints);
  const budget = snapshot.memo.constraints.budget;
  const intelligence = snapshot.intelligence || null;
  const dealPlans = pipeline.deals.map(deal => {
    const item = selectedItems.find(row => row.id === deal.artistId);
    const otherCommitted = pipeline.deals.reduce((sum, other) => other.artistId === deal.artistId ? sum :
      sum + (other.agreedRate ?? other.proposedRate ?? selectedItems.find(row => row.id === other.artistId)?.terms?.fee ?? 0), 0);
    const ceiling = typeof budget === 'number' ? money(Math.max(0, budget - otherCommitted)) : null;
    const proposed = deal.proposedRate ?? item?.terms?.fee ?? null;
    const agreed = deal.agreedRate ?? null;
    const rateForDecision = agreed ?? proposed;
    const latestCounteroffer = deal.negotiation?.counteroffers?.at(-1) || null;
    const withinCeiling = typeof rateForDecision === 'number' && typeof ceiling === 'number' ? rateForDecision <= ceiling : null;
    return {
      artistId: deal.artistId,
      artistName: deal.artistName,
      stage: deal.stage,
      evidenceCoverage: evidenceCoverage(item || {}),
      negotiation: {
        proposedRate: proposed, agreedRate: agreed, maxRateKeepingCurrentSlateFeasible: ceiling,
        headroomFromProposedRate: typeof proposed === 'number' && typeof ceiling === 'number' ? money(ceiling - proposed) : null,
        currentRateWithinCeiling: withinCeiling,
        latestCounteroffer,
        latestCounterofferWithinCeiling: latestCounteroffer && typeof ceiling === 'number' ? latestCounteroffer.amount <= ceiling : null,
        history: deal.negotiation?.counteroffers || [],
        policy: 'A rate above this ceiling makes the current selected slate exceed the declared budget; it is not a market-value estimate.'
      },
      response: deal.response,
      pitch: deal.pitch || null,
      outreach: deal.outreach || null,
      nextScheduledFollowUp: deal.followUps.find(item => item.status === 'scheduled') || null,
      nextAction: nextAction(deal),
      fallback: fallbackFor(contingency, deal.artistId, names),
      checklist: deal.checklist
    };
  });

  const researchQueue = [...dealPlans].sort((a, b) => a.evidenceCoverage.percent - b.evidenceCoverage.percent || a.artistName.localeCompare(b.artistName));
  const marketBrief = intelligence ? {
    topMarkets: [...intelligence.markets].sort((a, b) => b.marketScore - a.marketScore).slice(0, 3).map(row => ({ name: row.name, policyScore: row.marketScore, evidenceCoveragePercent: money(row.coverage * 100) })),
    routeFeasible: intelligence.route.feasible,
    routeStops: intelligence.route.stops.map(stop => ({ market: stop.name, showDate: stop.showDate })),
    venueLeadCount: intelligence.venueScouting.reduce((sum, row) => sum + row.candidates.length, 0),
    receiptIds: intelligence.receipts.map(receipt => receipt.id),
    audienceActivation: intelligence.audienceProfile?.enabled ? {
      tags: intelligence.audienceProfile.tags.map(row => row.name).filter(Boolean),
      demographics: intelligence.audienceProfile.demographics.map(row => ({ artistId: row.artistId, artistName: row.artistName, labels: row.rows.map(item => item.name).filter(Boolean), receiptId: row.receiptId })),
      crossDomain: intelligence.audienceProfile.crossDomain.map(row => ({ targetType: row.targetType, names: row.rows.map(item => item.name).filter(Boolean), receiptId: row.receiptId })),
      guard: intelligence.audienceProfile.interpretation
    } : null,
    venuePlan: snapshot.venuePlan ? {
      routeEconomics: snapshot.venuePlan.routeEconomics,
      stops: snapshot.venuePlan.stops.map(stop => ({ market: stop.market, status: stop.qualificationStatus, venue: stop.selectedVenue?.venueName || null, breakEvenTickets: stop.economics.breakEvenTickets, breakEvenWithinCapacity: stop.economics.breakEvenWithinCapacity }))
    } : null,
    localActivation: snapshot.localActivation ? {
      headliner: snapshot.localActivation.headliner,
      summary: snapshot.localActivation.summary,
      markets: snapshot.localActivation.markets.map(row => ({ market: row.market, showDate: row.showDate,
        hotspotAvailable: !!row.hotspot, eligibleOpeners: row.openerDiscovery.eligibleCount,
        openerSizeChecksRequired: row.openerDiscovery.evidenceRequiredCount,
        posterLeadsWithinRadius: row.posterRun.confirmedWithinRadius,
        aftershowLeadsWithinRadius: row.aftershow.confirmedWithinRadius }))
    } : null
  } : null;
  const recommendations = [];
  for (const plan of dealPlans) {
    if (plan.evidenceCoverage.missing.length) recommendations.push({ priority: 'evidence', artistId: plan.artistId, action: 'inspect_missing_evidence', detail: `${plan.artistName} lacks ${plan.evidenceCoverage.missing.join(', ')} evidence.` });
    if (plan.negotiation.currentRateWithinCeiling === false) recommendations.push({ priority: 'budget', artistId: plan.artistId, action: 'activate_fallback_or_reoptimize', detail: `${plan.artistName}'s recorded rate exceeds the maximum that keeps the current slate inside budget.` });
    if (plan.negotiation.latestCounterofferWithinCeiling === false) recommendations.push({ priority: 'budget', artistId: plan.artistId, action: 'counter_within_ceiling_or_reoptimize', detail: `${plan.artistName}'s latest recorded counteroffer exceeds the current slate-preserving ceiling.` });
    if (plan.stage === 'declined' && !plan.fallback?.feasible) recommendations.push({ priority: 'critical', artistId: plan.artistId, action: 'expand_candidate_pool', detail: `No clean replacement for ${plan.artistName} satisfies the unchanged brief.` });
  }
  if (marketBrief?.routeFeasible && !marketBrief.venuePlan) recommendations.push({ priority: 'routing', action: 'qualify_venue_leads', detail: `Verify capacity, availability and commercial terms for ${marketBrief.venueLeadCount} cultural place leads across the exact route.` });
  if (marketBrief?.venuePlan && marketBrief.venuePlan.routeEconomics.fallbackStops) recommendations.push({ priority: 'venue', action: 'source_in_band_rooms', detail: `${marketBrief.venuePlan.routeEconomics.fallbackStops} routed stop${marketBrief.venuePlan.routeEconomics.fallbackStops === 1 ? '' : 's'} use a sourced but out-of-band capacity fallback.` });
  if (marketBrief?.venuePlan?.routeEconomics.unqualifiedStops) recommendations.push({ priority: 'venue', action: 'complete_venue_qualification', detail: `${marketBrief.venuePlan.routeEconomics.unqualifiedStops} routed stop${marketBrief.venuePlan.routeEconomics.unqualifiedStops === 1 ? '' : 's'} still need a sourced venue capacity, cost and availability decision.` });
  if (marketBrief?.audienceActivation) recommendations.push({ priority: 'campaign', action: 'review_activation_signals', detail: `Review ${marketBrief.audienceActivation.tags.length} aggregate slate tags and ${marketBrief.audienceActivation.crossDomain.length} cross-domain evidence groups before approving campaign language.` });
  if (marketBrief?.routeFeasible && !marketBrief.localActivation) recommendations.push({ priority: 'campaign', action: 'build_local_activation', detail: 'Build receipt-linked opener, poster and aftershow plans for the routed markets.' });
  if (marketBrief?.localActivation && marketBrief.localActivation.markets.some(row => row.openerSizeChecksRequired > 0)) recommendations.push({ priority: 'campaign', action: 'verify_opener_size', detail: 'At least one opener lead lacks the returned popularity evidence required by the smaller-act rule.' });

  return {
    version: '1.0', generatedAt: new Date().toISOString(), sourceId: snapshot.id, pipelineRevision: pipeline.revision,
    derivedOnly: true,
    loop: {
      research: { status: 'active', queue: researchQueue.map(plan => ({ artistId: plan.artistId, artistName: plan.artistName, evidenceCoverage: plan.evidenceCoverage })), marketBrief },
      pitching: {
        approved: dealPlans.filter(item => item.stage !== 'research_complete').length,
        awaitingApproval: dealPlans.filter(item => item.stage === 'research_complete').length,
        outreachRecorded: pipeline.analytics.outreached,
        awaitingResponse: dealPlans.filter(item => item.stage === 'sent').length,
        guard: 'No outreach can be recorded until a human approval event exists.'
      },
      analytics: { ...pipeline.analytics, feedback: pipeline.feedback },
      followup: { due: dealPlans.filter(item => item.nextScheduledFollowUp).map(item => ({ artistId: item.artistId, artistName: item.artistName, ...item.nextScheduledFollowUp })), negotiationCeilings: dealPlans.map(item => ({ artistId: item.artistId, artistName: item.artistName, ...item.negotiation })) }
    },
    deals: dealPlans,
    recommendations,
    safeguards: [
      'All fees and availability are buyer-entered unless verified in an external contract system.',
      'Negotiation ceilings preserve this saved slate under its declared budget; they do not estimate artist value.',
      'Fallbacks are deterministic counterfactuals over the saved pool and constraints, not availability promises.',
      'No email, booking, counteroffer or calendar invitation is sent by this report.'
    ]
  };
}
