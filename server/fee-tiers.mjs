// Qloo returns no booking fees. A discovered act's fee is an illustrative tier from its Qloo
// popularity percentile, labelled "estimated" wherever it is shown. Not a quote.
export const FEE_TIERS = [[0.9995, 100000], [0.999, 50000], [0.995, 25000], [0.99, 15000], [0.98, 9000], [0.96, 6000], [0.93, 4000], [0.9, 2500], [0, 1500]];
// The popularity an act must stay below for its tier to fit a fee limit, or null when every
// tier fits or none does.
export function popularityFor(feeLimit) {
  const index = FEE_TIERS.findIndex(([, fee]) => fee <= feeLimit);
  return index > 0 ? FEE_TIERS[index - 1][0] : null;
}
export function estimateFee(popularity) {
  if (typeof popularity !== 'number' || !Number.isFinite(popularity) || popularity < 0 || popularity > 1) return null;
  return FEE_TIERS.find(([floor]) => popularity >= floor)[1];
}
// How far an estimated fee could plausibly be from its tier: from the geometric midpoint with
// the tier below to the one with the tier above (the end tiers mirror their only neighbour).
// Returned as multipliers of the tier fee, or null for a fee that is not a tier value.
export function tierRange(fee) {
  const values = FEE_TIERS.map(([, value]) => value).sort((a, b) => a - b), i = values.indexOf(fee);
  if (i < 0) return null;
  const below = i > 0 ? values[i - 1] / values[i] : values[i] / values[i + 1];
  const above = i < values.length - 1 ? values[i + 1] / values[i] : values[i] / values[i - 1];
  return [Math.sqrt(below), Math.sqrt(above)];
}
