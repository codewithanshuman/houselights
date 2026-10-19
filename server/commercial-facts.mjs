import * as pipelineStore from './pipeline-store.mjs';

// Keep commercial observations separate from outreach and approval state. These
// facts follow a derived plan even though its booking workflow starts afresh.
export function pipelineCommercialFacts(sourceId) {
  const pipeline = pipelineStore.load(sourceId);
  return (pipeline?.deals ?? []).filter(deal => deal.agreedRate != null || deal.response || deal.negotiation?.counteroffers?.length).map(deal => ({
    sourceId, artistId: deal.artistId,
    agreedRate: deal.agreedRate ?? null,
    response: deal.response ? structuredClone(deal.response) : null,
    counteroffers: structuredClone(deal.negotiation?.counteroffers ?? []),
  }));
}

export function mergedCommercialFacts(sourceId, inherited = []) {
  const current = pipelineCommercialFacts(sourceId);
  const currentArtists = new Set(current.map(fact => fact.artistId));
  return [...inherited.filter(fact => !currentArtists.has(fact.artistId)), ...current];
}
