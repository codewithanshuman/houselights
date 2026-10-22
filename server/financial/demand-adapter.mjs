import { demandFeatures, predictDemand } from '../demand-model.mjs';
import { simulateAudienceTwin } from '../audience-twin.mjs';

export function prepareLineupDemand(input, selectedIds, modelReport, twin, weightedPrice) {
  const selected = selectedIds.map(id => input.candidates.find(candidate => candidate.id === id));
  if (selected.some(item => !item)) throw new Error('Financial lineup references an unknown artist.');
  const brief = { ...input.brief, ticketPrice: weightedPrice };
  const features = demandFeatures(brief, selected);
  const forecast = predictDemand(modelReport, brief, features);
  const twinScenario = twin ? simulateAudienceTwin(twin, input.brief, selectedIds, { price: weightedPrice }) : null;
  const buyerAssumption = input.assumptions.baseSellThrough;
  const point = forecast?.ticketsSold.point ?? twinScenario?.ticketsSold.point ??
    (buyerAssumption == null ? null : Math.round(input.brief.capacity * buyerAssumption *
      (weightedPrice / input.brief.ticketPrice) ** (input.assumptions.priceElasticity ?? 0)));
  if (point == null) throw new Error('A financial scenario needs a backtested demand model, a compatible audience twin, or explicit base sell-through. A Qloo fit score alone is not paid demand.');
  const source = forecast ? 'backtested_observational_demand' : twinScenario ? 'audience_twin_assumption_scenario' : 'organizer_sell_through_assumption';
  return { source, pointTickets: Math.max(0, Math.min(input.brief.capacity, point)),
    range: forecast?.ticketsSold ?? twinScenario?.ticketsSold ?? null,
    features, model: forecast ? { model: forecast.model, heldOut: forecast.heldOut, coldStartCity: forecast.coldStartCity } : null,
    twin: twinScenario ? { twinId: twin.id, status: twinScenario.status, segmentRows: twinScenario.segments,
      uncertainty: twinScenario.uncertainty, receiptIds: [...new Set(twinScenario.segments.flatMap(segment => segment.receiptIds))] } : null,
    caveat: forecast?.caveat ?? twinScenario?.caveat ?? 'Base sell-through and price elasticity were supplied by the organizer; the outcome distribution is an assumption scenario, not a calibrated sales forecast.' };
}
