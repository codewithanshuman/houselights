import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVenuePlan } from '../server/venues.mjs';

const snapshot = {
  id: 'routed', input: { currency: 'GBP' }, memo: {
    currency: 'GBP', slate: { feasible: true, selectedIds: ['a', 'b'] },
    items: [
      { id: 'a', name: 'Alpha', terms: { fee: 6000, available: true } },
      { id: 'b', name: 'Beta', terms: { fee: 3000, available: true } }
    ]
  },
  intelligence: {
    route: { feasible: true, stops: [
      { name: 'London', sequence: 1, showDate: '2026-11-20', from: 'London', fromKm: 0 },
      { name: 'Paris', sequence: 2, showDate: '2026-11-22', from: 'London', fromKm: 344 }
    ] },
    venueScouting: [
      { market: 'London', receiptId: 'i8', candidates: [{ id: 'v1', name: 'Room One' }, { id: 'v2', name: 'Room Two' }] },
      { market: 'Paris', receiptId: 'i9', candidates: [{ id: 'v3', name: 'Petit Room' }] }
    ]
  }
};

test('venue planner applies sourced room-fit rules and deterministic break-even arithmetic', () => {
  const plan = buildVenuePlan(snapshot, {
    expectedCrowd: 200, ticketPrice: 50, variableCostPerAttendee: 5, travelCostPerKm: 1, artistFeeMode: 'whole_route',
    qualifications: [
      { market: 'London', venueId: 'v1', capacity: 300, capacitySource: 'https://example.test/v1', available: true, venueCost: 1000, otherFixedCost: 500 },
      { market: 'London', venueId: 'v2', capacity: 800, capacitySource: 'buyer call', available: true, venueCost: 500 },
      { market: 'Paris', venueId: 'v3', capacity: 40, capacitySource: 'venue sheet', available: true, venueCost: 500 }
    ]
  });
  assert.equal(plan.artistFees.routeArtistFees, 9000);
  assert.deepEqual(plan.artistFees.allocations.map(item => item.amount), [4500, 4500]);
  assert.equal(plan.stops[0].selectedVenue.venueId, 'v1');
  assert.equal(plan.stops[0].qualificationStatus, 'qualified_fit');
  assert.equal(plan.stops[0].economics.declaredFixedCost, 6000);
  assert.equal(plan.stops[0].economics.breakEvenTickets, 134);
  assert.equal(plan.stops[0].economics.breakEvenWithinCapacity, true);
  assert.equal(plan.stops[1].qualificationStatus, 'fallback_out_of_band');
  assert.equal(plan.stops[1].economics.breakEvenWithinCapacity, false);
  assert.equal(plan.routeEconomics.qualifiedStops, 1);
  assert.equal(plan.routeEconomics.fallbackStops, 1);
  assert.match(plan.limitations.join(' '), /not attendance, revenue or profit forecasts/);
});

test('venue planner refuses unsourced facts, unknown leads and impossible unit economics', () => {
  const base = { expectedCrowd: 200, ticketPrice: 50, variableCostPerAttendee: 5, travelCostPerKm: 1, artistFeeMode: 'per_stop' };
  assert.throws(() => buildVenuePlan(snapshot, { ...base, qualifications: [{ market: 'London', venueId: 'unknown', capacity: 200, capacitySource: 'x' }] }), /Qloo place candidate/);
  assert.throws(() => buildVenuePlan(snapshot, { ...base, qualifications: [{ market: 'London', venueId: 'v1', capacity: 200 }] }), /capacitySource/);
  assert.throws(() => buildVenuePlan(snapshot, { ...base, variableCostPerAttendee: 50 }), /lower than ticketPrice/);
});

test('unqualified route stops remain explicit instead of receiving invented room facts', () => {
  const plan = buildVenuePlan(snapshot, { expectedCrowd: 200, ticketPrice: 40, variableCostPerAttendee: 5, travelCostPerKm: 0, artistFeeMode: 'per_stop', qualifications: [] });
  assert.ok(plan.stops.every(stop => stop.qualificationStatus === 'needs_verified_venue' && stop.selectedVenue === null));
  assert.equal(plan.routeEconomics.unqualifiedStops, 2);
});

test('whole-route artist fees reconcile to the cent across uneven stop allocations', () => {
  const threeStops = structuredClone(snapshot);
  threeStops.memo.items[0].terms.fee = 100;
  threeStops.memo.items[1].terms.fee = 0;
  threeStops.intelligence.route.stops.push({ name: 'Berlin', sequence: 3, showDate: '2026-11-24', from: 'Paris', fromKm: 878 });
  threeStops.intelligence.venueScouting.push({ market: 'Berlin', receiptId: 'i10', candidates: [{ id: 'v4', name: 'Berlin Room' }] });
  const plan = buildVenuePlan(threeStops, { expectedCrowd: 200, ticketPrice: 40, variableCostPerAttendee: 5, travelCostPerKm: 0, artistFeeMode: 'whole_route', qualifications: [] });
  assert.deepEqual(plan.artistFees.allocations.map(item => item.amount), [33.33, 33.33, 33.34]);
  assert.equal(plan.artistFees.allocations.reduce((sum, item) => sum + item.amount, 0), 100);
  assert.equal(plan.routeEconomics.routeArtistFees, 100);
});
