import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../server/qloo.mjs';
import { activationWorkflowCount, buildLocalActivation, normalizeActivationInput } from '../server/activation.mjs';

const snapshot = {
  id: 'intel-fixture',
  memo: {
    slate: { feasible: true, selectedIds: ['head', 'support'] },
    items: [{ id: 'head', name: 'Headliner' }, { id: 'support', name: 'Support' }]
  },
  intelligence: { route: { feasible: true, stops: [
    { name: 'London', lat: 51.5074, lon: -.1278, showDate: '2026-11-20' },
    { name: 'Paris', lat: 48.8566, lon: 2.3522, showDate: '2026-11-22' }
  ] } }
};

test('activation input is route-bound and exposes a conservative workflow ceiling', () => {
  const input = normalizeActivationInput(snapshot, { headlinerId: 'head', marketNames: ['London'], maxOpeners: 2 });
  assert.equal(input.rules.hotspotRadiusKm, 2.5);
  assert.equal(activationWorkflowCount(snapshot, input), 7);
  assert.throws(() => normalizeActivationInput(snapshot, { marketNames: ['Berlin'] }), /routed markets/);
  assert.throws(() => normalizeActivationInput(snapshot, { headlinerId: 'unknown' }), /selected artist/);
});

test('local activation binds every operational suggestion to receipts and coordinates', async () => {
  const run = new Run({ mode: 'mock', budget: 20, receiptPrefix: 'l', cacheStore: new Map(), delay: async () => {} });
  const result = await buildLocalActivation(snapshot, { headlinerId: 'head', marketNames: ['London'], maxOpeners: 2 }, run);
  assert.equal(result.markets.length, 1);
  assert.ok(result.markets[0].hotspot);
  assert.equal(result.markets[0].openerDiscovery.candidates.length, 2);
  assert.ok(result.markets[0].openerDiscovery.candidates.every(row => row.status === 'eligible_for_human_review'));
  assert.ok(result.markets[0].openerDiscovery.candidates.every(row => row.sharedThemes.length > 0));
  assert.ok(result.markets[0].posterRun.leads.every(row => Number.isFinite(row.fromHotspotKm)));
  assert.ok(result.markets[0].posterRun.confirmedWithinRadius > 0);
  assert.equal(result.receipts.length, 7);
  assert.ok(result.receipts.every(receipt => receipt.id.startsWith('l')));
});

test('missing popularity and coordinates stay unresolved instead of becoming eligibility or proximity claims', async () => {
  const execute = (tool, args) => {
    if (tool === 'describe') return { status: 'ok', results: [{ name: 'Headliner', entity_id: 'head' }] };
    if (tool === 'where_popular') return { status: 'ok', results: [{ name: args.within, query: { affinity: .8 } }] };
    if (tool === 'recommend' && args.target_type === 'artist') return { status: 'ok', results: [{ name: 'Candidate', entity_id: 'candidate' }] };
    if (tool === 'compare_audiences') return { status: 'ok', results: { shared: [{ name: 'indie' }] } };
    return { status: 'ok', results: [{ name: 'Place', entity_id: 'place' }] };
  };
  const run = new Run({ mode: 'live', execute, budget: 10, cacheStore: new Map(), delay: async () => {} });
  const result = await buildLocalActivation(snapshot, { marketNames: ['London'], maxOpeners: 1 }, run);
  const market = result.markets[0];
  assert.equal(market.hotspot, null);
  assert.equal(market.openerDiscovery.candidates[0].status, 'size_evidence_required');
  assert.equal(market.posterRun.leads[0].proximityStatus, 'coordinates_unavailable');
  assert.equal(market.posterRun.confirmedWithinRadius, 0);
});
