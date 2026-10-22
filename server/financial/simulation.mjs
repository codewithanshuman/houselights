import { cholesky, correlate } from './correlations.mjs';
import { generator, keyedSeed, normal } from './random.mjs';
import { accountDraw, breakEvenVolume } from './accounting.mjs';
import { riskMetrics } from './risk-metrics.mjs';
import { minor, ratio } from './money.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function marketDraws(config, count = config.simulation.draws) {
  const next = generator(config.simulation.seed), lower = cholesky(config.correlation);
  return Array.from({ length: count }, (_, index) => {
    const factor = correlate(lower, [normal(next), normal(next), normal(next), normal(next)]);
    return { index, factor, eventUniform: next() };
  });
}

function artistRisk(config, artist, draw) {
  const next = generator(keyedSeed(config.simulation.seed, draw.index, artist.id));
  return { canceled: next() < config.booking.artistCancellationProbability,
    escalated: next() < config.booking.feeEscalationProbability };
}

export function simulateLineup(config, lineup, market, assumption, { collect = false } = {}) {
  const fees = lineup.selected.reduce((total, artist) => total + minor(artist.terms.fee, `${artist.name} quote`), 0);
  const results = new Array(market.length);
  for (let i = 0; i < market.length; i++) {
    const draw = market[i], [economic, weather, competition, audience] = draw.factor;
    // Signed shared factors produce coordinated market effects. Each lineup
    // receives the exact same factor vector at a given draw index.
    const demandFactor = clamp(1 + config.volatility.demand * (.38 * economic + .18 * weather + .22 * competition + .42 * audience) -
      config.volatility.competition * Math.max(0, competition) - config.volatility.weather * Math.max(0, weather), 0, 2);
    const segmentRows = lineup.demand.twin?.segmentRows;
    const ticketsSold = segmentRows?.length
      ? clamp(Math.round(segmentRows.reduce((total, segment) => {
        const idiosyncratic = normal(generator(keyedSeed(config.simulation.seed, draw.index, `segment:${segment.id}`)));
        return total + segment.scenarioTickets * assumption.demandMultiplier * clamp(demandFactor + .15 * config.volatility.demand * idiosyncratic, 0, 2);
      }, 0)), 0, config.sellableCapacity)
      : clamp(Math.round(lineup.demand.pointTickets * assumption.demandMultiplier * demandFactor), 0, config.sellableCapacity);
    const canceled = draw.eventUniform < config.booking.eventCancellationProbability;
    let canceledArtistFeeCents = 0, escalationCents = 0, artistCanceled = false, replacementFeeCents = 0;
    for (const artist of lineup.selected) {
      const fee = minor(artist.terms.fee, `${artist.name} quote`), risk = artistRisk(config, artist, draw);
      if (risk.canceled) { artistCanceled = true; canceledArtistFeeCents += fee; replacementFeeCents += config.booking.replacementFeeCents; }
      else if (risk.escalated) escalationCents += ratio(fee, config.booking.feeEscalationRate);
    }
    const costMultiplier = clamp(assumption.costMultiplier * (1 + config.volatility.costs * (.6 * economic + .25 * weather + .15 * competition)), 0, 4);
    results[i] = accountDraw(config, { ticketsSold, selectedFeesCents: fees, costMultiplier, canceled,
      artistCanceled, canceledArtistFeeCents, feeEscalationCents: escalationCents, replacementFeeCents });
    results[i].eventBudgetOverrun = config.policy.maxEventBudgetCents != null &&
      results[i].totalCostsCents + results[i].promoterFeesCents > config.policy.maxEventBudgetCents;
  }
  const metrics = riskMetrics(results, config.lossThresholdCents);
  return { selectedIds: lineup.selectedIds, selectedFee: fees / 100, culturalFit: lineup.culturalFit,
    source: lineup.demand.source, demand: lineup.demand, assumptionSet: assumption.id,
    breakEvenTickets: breakEvenVolume(config, fees, assumption.costMultiplier), metrics,
    ...(collect ? { samples: results } : {}) };
}
