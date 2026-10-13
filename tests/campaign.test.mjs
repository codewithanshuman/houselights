import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline, applyPipelineEvent } from '../server/pipeline.mjs';
import { buildCampaign } from '../server/campaign.mjs';

const items = [
  { id: 'a', name: 'Alpha', fit: .9, rank: 1, evidence: { rank: true, local: true, comparison: false, trends: false }, terms: { fee: 6000, genre: 'rock', available: true } },
  { id: 'b', name: 'Beta', fit: .8, rank: 2, evidence: { rank: true, local: false, comparison: true, trends: false }, terms: { fee: 3000, genre: 'jazz', available: true } },
  { id: 'c', name: 'Gamma', fit: .7, rank: 3, evidence: { rank: true, local: true, comparison: true, trends: true }, terms: { fee: 2500, genre: 'folk', available: true } }
];
const snapshot = {
  id: 'source', intelligence: {
    markets: [{ name: 'London', marketScore: 78, coverage: 1 }], route: { feasible: true, stops: [{ name: 'London', showDate: '2026-11-20' }] },
    venueScouting: [{ candidates: [{ name: 'Venue' }] }], receipts: [{ id: 'i1' }],
    audienceProfile: {
      enabled: true, tags: [{ name: 'indie' }],
      demographics: [{ artistId: 'a', artistName: 'Alpha', rows: [{ name: 'age 25-34' }], receiptId: 'i2' }],
      crossDomain: [{ targetType: 'brand', rows: [{ name: 'Example Brand' }], receiptId: 'i3' }],
      interpretation: 'Aggregate context only.'
    }
  },
  memo: {
    slate: { feasible: true, selectedIds: ['a', 'b'] }, items,
    constraints: { budget: 10000, slots: 2, maxPerGenre: 2, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] }
  }
};

test('campaign loop joins research, approval, follow-up, analytics, ceilings and fallbacks', () => {
  const at = '2026-10-12T10:00:00.000Z';
  let pipeline = createPipeline(snapshot, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a' }, at);
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, at);
  const campaign = buildCampaign(snapshot, pipeline);
  assert.equal(campaign.derivedOnly, true);
  assert.equal(campaign.loop.pitching.outreachRecorded, 1);
  assert.equal(campaign.loop.pitching.awaitingResponse, 1);
  assert.equal(campaign.loop.followup.due.length, 1);
  assert.equal(campaign.loop.research.marketBrief.topMarkets[0].name, 'London');
  assert.deepEqual(campaign.loop.research.marketBrief.audienceActivation.tags, ['indie']);
  const alpha = campaign.deals.find(deal => deal.artistId === 'a');
  assert.equal(alpha.negotiation.maxRateKeepingCurrentSlateFeasible, 7000);
  assert.equal(alpha.negotiation.headroomFromProposedRate, 1000);
  assert.equal(alpha.nextAction.action, 'follow_up');
  assert.equal(alpha.fallback.feasible, true);
  assert.deepEqual(alpha.fallback.replacements.map(item => item.id), ['c']);
  assert.ok(campaign.recommendations.some(item => item.action === 'qualify_venue_leads'));
  assert.ok(campaign.recommendations.some(item => item.action === 'review_activation_signals'));
});

test('campaign ceilings use current negotiated commitments and flag excessive counteroffers', () => {
  let pipeline = createPipeline(snapshot, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'a' }, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'a' }, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'a', responseType: 'accepted', agreedRate: 6500 }, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'approve_pitch', artistId: 'b' }, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'send_outreach', artistId: 'b' }, '2026-10-12T10:00:00.000Z');
  pipeline = applyPipelineEvent(pipeline, { type: 'record_response', artistId: 'b', responseType: 'negotiating', counterofferRate: 4000 }, '2026-10-12T10:00:00.000Z');
  const campaign = buildCampaign(snapshot, pipeline);
  const beta = campaign.deals.find(deal => deal.artistId === 'b');
  assert.equal(beta.negotiation.maxRateKeepingCurrentSlateFeasible, 3500);
  assert.equal(beta.negotiation.latestCounterofferWithinCeiling, false);
  assert.ok(campaign.recommendations.some(item => item.action === 'counter_within_ceiling_or_reoptimize'));
});
