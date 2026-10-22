import { major } from './money.mjs';
const percentile = (sorted, probability) => {
  const location = (sorted.length - 1) * probability, below = Math.floor(location), weight = location - below;
  return sorted[below] * (1 - weight) + sorted[Math.min(sorted.length - 1, below + 1)] * weight;
};
const average = values => values.reduce((total, value) => total + value, 0) / values.length;
export function distribution(values, { money = true, bins = 24 } = {}) {
  if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value))) throw new Error('A non-empty finite sample is required.');
  const sorted = [...values].sort((a, b) => a - b), convert = money ? value => major(Math.round(value)) : value => value;
  const minimum = sorted[0], maximum = sorted.at(-1), width = (maximum - minimum || 1) / bins;
  const counts = Array(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor((value - minimum) / width))]++;
  return { count: values.length, mean: convert(average(values)), median: convert(percentile(sorted, .5)),
    p5: convert(percentile(sorted, .05)), p25: convert(percentile(sorted, .25)), p75: convert(percentile(sorted, .75)),
    p95: convert(percentile(sorted, .95)), minimum: convert(minimum), maximum: convert(maximum),
    histogram: counts.map((count, index) => ({ from: convert(minimum + width * index), to: convert(minimum + width * (index + 1)), count })) };
}
export function riskMetrics(draws, thresholdCents) {
  const profits = draws.map(row => row.profitCents), sorted = [...profits].sort((a, b) => a - b);
  const tailCount = Math.max(1, Math.ceil(.05 * sorted.length));
  const cvarProfitCents = average(sorted.slice(0, tailCount));
  const profit = distribution(profits);
  return { profit, paidTickets: distribution(draws.map(row => row.ticketsSold), { money: false }),
    attendance: distribution(draws.map(row => row.attendance), { money: false }),
    grossRevenue: distribution(draws.map(row => row.grossRevenueCents)),
    costs: distribution(draws.map(row => row.totalCostsCents + row.promoterFeesCents + row.taxCents + row.refundsCents)),
    cashBeforeRevenue: distribution(draws.map(row => row.cashBeforeRevenueCents)),
    breakEvenProbability: profits.filter(value => value >= 0).length / draws.length,
    lossBeyondThresholdProbability: profits.filter(value => value < -thresholdCents).length / draws.length,
    valueAtRisk95: major(Math.max(0, -Math.round(percentile(sorted, .05)))),
    conditionalValueAtRisk95: major(Math.max(0, -Math.round(cvarProfitCents))),
    expectedWorstTailProfit: major(Math.round(cvarProfitCents)),
    eventCancellationRate: draws.filter(row => row.canceled).length / draws.length,
    artistCancellationRate: draws.filter(row => row.artistCanceled).length / draws.length,
    eventBudgetOverrunProbability: draws.filter(row => row.eventBudgetOverrun === true).length / draws.length,
    monteCarloStandardErrorProfit: major(Math.round(Math.sqrt(average(profits.map(value => (value - profit.mean * 100) ** 2)) / draws.length))) };
}
