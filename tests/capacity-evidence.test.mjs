import test from 'node:test';
import assert from 'node:assert/strict';
import { capacitiesIn } from '../server/routed/capacity.mjs';
import { reviewCapacity, buildCapacityResearch } from '../server/capacity-evidence.mjs';
import { buildVenuePlan } from '../server/venues.mjs';
import { withoutDerived } from '../server/gm.mjs';

const page = (text, url = 'https://venue.example/technical') => ({ text, url });
const fixture = () => ({ id: 'routed-source', memo: { slate: { selectedIds: ['a'] }, items: [{ id: 'a', terms: { fee: 100 } }] },
  intelligence: { route: { feasible: true, stops: [{ name: 'London', sequence: 1, showDate: '2027-04-01', from: 'London', fromKm: 0 }] },
    venueScouting: [{ market: 'London', receiptId: 'i1', candidates: [{ id: 'venue-1', name: 'Aurora Hall' }] }] } });
const options = qualifications => ({ expectedCrowd: 400, ticketPrice: 20, artistFeeMode: 'per_stop', qualifications });

test('exact Routed parser preserves multilingual capacities and rejects future/side-room phrases', () => {
  assert.deepEqual(capacitiesIn('Capacity of 1,100. Kapazität: 1.200. Capacité de 1 300.').map(hit => hit.value), [1100, 1200, 1300]);
  assert.deepEqual(capacitiesIn('Upstairs capacity 250. Planned capacity 900. Main room capacity 700.').map(hit => hit.value), [700]);
  assert.equal(capacitiesIn('Capacity 12. Capacity 200000.').length, 0);
});

test('capacity review retains quotes and content digests, counts each page once, and does not retain full source text', () => {
  const text = 'Aurora Hall has capacity 600. Capacity: 600.';
  const result = reviewCapacity('Aurora Hall', [page(text), page('Aurora Hall accommodates 600 guests.', 'https://directory.example/aurora')]);
  assert.equal(result.status, 'consistent');
  assert.equal(result.proposedCapacity, 600);
  assert.equal(result.candidates[0].sourceCount, 2);
  assert.ok(result.candidates[0].claims.every(claim => claim.quote.includes('600') && /^sha256:/.test(claim.contentDigest)));
  assert.ok(result.documents.every(document => document.independentRetrieval === false && !Object.hasOwn(document, 'text')));
});

test('all capacity conflicts stay unresolved even with a majority or several layouts on one page', () => {
  const result = reviewCapacity('Aurora Hall', [
    page('Aurora Hall capacity 500.'), page('Aurora Hall capacity 500.', 'https://other.example/room'),
    page('Aurora Hall capacity 900.', 'https://third.example/room'),
  ]);
  assert.equal(result.status, 'conflict');
  assert.equal(result.proposedCapacity, null);
  assert.deepEqual(result.candidates.map(row => row.capacity), [500, 900]);
  assert.equal(reviewCapacity('Aurora Hall', [page('Aurora Hall seated capacity 400; standing capacity 800.')]).status, 'conflict');
});

test('social sources, unrelated venue names, duplicates and unsafe document inputs do not become capacity facts', () => {
  const social = reviewCapacity('Aurora Hall', [page('Aurora Hall capacity 500.', 'https://www.reddit.com/aurora')]);
  assert.equal(social.status, 'unresolved');
  assert.equal(social.documents[0].status, 'excluded_social');
  assert.equal(reviewCapacity('Aurora Hall', [page('Elsewhere Hall capacity 900.')]).status, 'unresolved');
  assert.throws(() => reviewCapacity('Aurora Hall', [page('Aurora Hall capacity 500.'), page('Aurora Hall capacity 700.')]), /Duplicate/);
  for (const bad of [page('x', 'file:///secret'), page('x', 'https://user:password@venue.example'), page('x'.repeat(25001)), page('')]) {
    assert.throws(() => reviewCapacity('Aurora Hall', [bad]));
  }
});

test('saved capacity evidence drives venue economics only through explicit opt-in and records conflict decisions', () => {
  const source = fixture(), before = structuredClone(source);
  const capacityResearch = buildCapacityResearch(source, { venues: [{ market: 'London', venueId: 'venue-1', pages: [page('Aurora Hall capacity 500. Standing capacity 800.')] }] });
  const reviewed = { ...source, id: 'review-child', capacityResearch }, row = { market: 'London', venueId: 'venue-1', useCapacityEvidence: true, available: true };
  assert.throws(() => buildVenuePlan(reviewed, options([row])), /Choose an extracted/);
  assert.throws(() => buildVenuePlan(reviewed, options([{ ...row, capacity: 500 }])), /decision reason/);
  assert.throws(() => buildVenuePlan(reviewed, options([{ ...row, capacity: 999, capacityDecisionReason: 'test' }])), /supported/);
  const plan = buildVenuePlan(reviewed, options([{ ...row, capacity: 500, capacityDecisionReason: 'Use the seated configuration for this event.' }]));
  assert.equal(plan.stops[0].selectedVenue.capacity, 500);
  assert.equal(plan.stops[0].selectedVenue.capacityEvidence.reviewSourceId, 'review-child');
  assert.equal(plan.stops[0].selectedVenue.capacityEvidence.alternatives[0].capacity, 800);
  assert.equal(plan.stops[0].economics.breakEvenWithinCapacity, true);
  assert.deepEqual(source, before);
  assert.equal(withoutDerived(reviewed).capacityResearch, undefined);
});

test('consistent source evidence can supply capacity without fabricating availability or changing manual-input compatibility', () => {
  const source = fixture();
  source.capacityResearch = buildCapacityResearch(source, { venues: [{ market: 'London', venueId: 'venue-1', pages: [page('Aurora Hall capacity 500.')] }] });
  const row = { market: 'London', venueId: 'venue-1', useCapacityEvidence: true };
  const unavailable = buildVenuePlan(source, options([row]));
  assert.equal(unavailable.stops[0].selectedVenue, null);
  assert.equal(unavailable.stops[0].alternatives[0].capacity, 500);
  const manual = buildVenuePlan(source, options([{ market: 'London', venueId: 'venue-1', capacity: 450, capacitySource: 'Buyer supplied event layout', available: true }]));
  assert.equal(manual.stops[0].selectedVenue.capacity, 450);
  assert.equal(manual.stops[0].selectedVenue.capacityEvidence, undefined);
});
