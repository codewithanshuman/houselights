import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
const testDirectory = mkdtempSync(join(tmpdir(), 'houselights-api-'));
process.env.DATA_DIR = testDirectory;
const { createApp, classifyRequestError } = await import('../server/app.mjs');
const apiStore = await import('../server/store.mjs');
const { db } = await import('../server/database.mjs');
// Cases use independent request budgets; quota enforcement has dedicated production tests.
beforeEach(() => db.prepare('DELETE FROM quotas').run());
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); (await import('../server/database.mjs')).db.close(); rmSync(testDirectory, { recursive: true, force: true }); });
const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health and asset endpoints expose mode without credentials', async () => {
  const health = await (await fetch(url + '/healthz')).json();
  assert.equal(health.mock, true);
  assert.equal(typeof health.keyed, 'boolean');
  assert.equal((await fetch(url)).status, 200);
  assert.match((await fetch(url+'/judge.html')).headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await fetch(url+'/evidence.html')).status,200);
  assert.equal((await fetch(url+'/shocks-summary.json')).status,200);
  const reviews=await (await fetch(url+'/api/evidence/reviews')).json();
  assert.equal(reviews.completedReviewers,0);
  assert.equal((await fetch(url + '/api/memo/not-found')).status, 404);
});
test('request validation stays 4xx while unexpected failures are 500 without leaking details', async () => {
  const invalid = await fetch(url + '/api/optimize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad-json' });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error, 'Invalid request body.');
  assert.match(invalidBody.requestId, /^[0-9a-f-]{36}$/, 'every error carries a request ID');
  assert.equal(invalid.headers.get('x-request-id'), invalidBody.requestId);
  assert.deepEqual(Object.keys(invalidBody).sort(), ['error', 'requestId']);
  assert.deepEqual(classifyRequestError(Object.assign(new Error('bad choice'), { status: 422 })), { status: 422, message: 'bad choice' });
  assert.deepEqual(classifyRequestError(new Error('database credentials or private stack details')), { status: 500, message: 'The request could not be completed.' });
});

test('activation and tour calendar APIs persist an evidence-linked child snapshot', async () => {
  const sourceId = apiStore.save({ mock: true, receipts: [], input: { city: 'London' }, memo: {
    slate: { feasible: true, selectedIds: ['head'] },
    items: [{ id: 'head', name: 'Headliner', terms: { fee: 1000, available: true } }]
  }, intelligence: { route: { feasible: true, stops: [
    { sequence: 1, name: 'London', lat: 51.5074, lon: -.1278, from: 'London', fromKm: 0, travelDays: 0, dayOffBefore: false, showDate: '2026-11-20' }
  ] } } });
  const response = await post(`/api/activation/${sourceId}`, { marketNames: ['London'], maxOpeners: 1 });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.snapshot.parentId, sourceId);
  assert.equal(result.snapshot.localActivation.summary.marketCount, 1);
  assert.ok(result.snapshot.receipts.every((receipt, index, rows) => rows.findIndex(item => item.id === receipt.id) === index));
  const calendar = await fetch(`${url}/api/tour-calendar/${result.id}`);
  assert.equal(calendar.status, 200);
  assert.match(calendar.headers.get('content-type'), /text\/calendar/);
  assert.match(await calendar.text(), /SUMMARY:Show: Headliner — London/);
});

test('SSE runs carry booking terms through optimization and a reloadable receipt snapshot', async () => {
  const response = await post('/api/memo', {
    city: 'London', anchors: 'Radiohead, Beach House', offers: 'The xx, Wolf Alice, Caribou', currency: 'GBP',
    terms: { 'The xx': { fee: 8000, genre: 'indie', available: true }, 'Wolf Alice': { fee: 6000, genre: 'rock', available: true }, Caribou: { fee: 4000, genre: 'electronic', available: true } },
    constraints: { budget: 10000, slots: 2, maxPerGenre: 1, discoveryMin: 0, riskTolerance: 40 }
  });
  assert.equal(response.status, 200);
  const events = (await response.text()).split('\n\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.ok(!events.some(event => event.type === 'error'));
  const memo = events.find(event => event.type === 'memo');
  assert.ok(memo, 'memo event present');
  assert.equal(memo.slate.feasible, true);
  assert.equal(memo.slate.totalFee, 10000);
  assert.equal(memo.currency, 'GBP');
  assert.equal(memo.constraints.riskTolerance, 40);
  assert.equal(memo.items.find(item => item.name === 'The xx').terms.fee, 8000);
  assert.ok(memo.items.filter(item => item.found).every(item => item.terms.fee === null && item.terms.available === false));
  const receipts = events.filter(event => event.type === 'receipt').map(event => event.receipt);
  assert.ok(receipts.length > 5);
  assert.ok(receipts.every(receipt => receipt.source === 'synthetic' && receipt.digest.startsWith('sha256:')));
  const saved = events.find(event => event.type === 'saved');
  const snapshot = await (await fetch(url + '/api/memo/' + saved.id)).json();
  assert.equal(snapshot.mock, true);
  assert.ok(Array.isArray(snapshot.trace)&&snapshot.trace.some(event=>event.type==='receipt'));
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(saved.id).pinned,1);
  assert.deepEqual(snapshot.memo.slate.selectedIds, memo.slate.selectedIds);
  assert.equal(snapshot.input.constraints.budget, 10000);
  const adjusted = await (await post('/api/optimize', { items: memo.items, constraints: { ...memo.constraints, budget: 14000 } })).json();
  assert.equal(adjusted.feasible, true);
  assert.ok(adjusted.totalFee <= 14000);
  const assumptions = Object.fromEntries(memo.items.map(item => [item.id, item.terms]));
  const checkpointResponse = await post('/api/scenario', { sourceId: saved.id, name: 'Larger budget', terms: assumptions, constraints: { ...memo.constraints, budget: 14000 }, items: memo.items.map(item => ({ ...item, fit: 999 })) });
  assert.equal(checkpointResponse.status, 201);
  const checkpoint = await checkpointResponse.json();
  assert.equal(checkpoint.snapshot.parentId, saved.id);
  assert.equal(checkpoint.snapshot.scenarioName, 'Larger budget');
  assert.deepEqual(checkpoint.snapshot.receipts, snapshot.receipts);
  assert.ok(checkpoint.snapshot.memo.items.every(item => item.fit === memo.items.find(original => original.id === item.id).fit), 'saved scenarios use server-held evidence, never client-supplied scores');
  assert.equal(checkpoint.snapshot.memo.constraints.budget, 14000);
  assert.equal(checkpoint.snapshot.trace, undefined, 'A changed scenario must not inherit the original run’s event log');
  assert.deepEqual(apiStore.load(saved.id).trace, snapshot.trace, 'The original research trace remains intact');
  assert.equal((await post('/api/scenario', { sourceId: saved.id, terms: { unknown: { fee: 1 } } })).status, 400);
  const analysisResponse = await post('/api/analyze', { items: memo.items, constraints: memo.constraints });
  assert.equal(analysisResponse.status, 200);
  const analysis = await analysisResponse.json();
  assert.ok(analysis.budgetScenarios.length >= 4);
  assert.ok(analysis.feeScenarios.some(scenario => scenario.increasePercent === 20));
  const gauntletResponse = await post('/api/gauntlet', { sourceId: saved.id, terms: assumptions, constraints: memo.constraints, items: memo.items.map(item => ({ ...item, fit: 999 })) });
  assert.equal(gauntletResponse.status, 200);
  const gauntlet = await gauntletResponse.json();
  assert.equal(gauntlet.verified, true);
  assert.equal(gauntlet.total, 6);
  assert.ok(gauntlet.missions.every(mission => typeof mission.achieved === 'boolean'));
  assert.deepEqual(gauntlet.slate.selectedIds, memo.slate.selectedIds, 'Gauntlet scoring uses server-held evidence, never browser-supplied scores');
  assert.equal((await post('/api/gauntlet', { sourceId: saved.id, terms: { unknown: { fee: 1 } } })).status, 400);
  const contingencyResponse = await post('/api/contingency', { sourceId: saved.id, terms: assumptions, constraints: memo.constraints, items: memo.items.map(item => ({ ...item, fit: 999 })) });
  assert.equal(contingencyResponse.status, 200);
  const contingency = await contingencyResponse.json();
  assert.deepEqual(contingency.baseline.selectedIds, memo.slate.selectedIds, 'contingencies use server-held evidence, never browser-supplied scores');
  assert.equal(contingency.cancellations.length, memo.constraints.slots);
  assert.equal(contingency.resilience.totalScenarios, memo.constraints.slots * 4 + 7);
  assert.ok(contingency.cancellations.every(row => !row.selectedIds.includes(row.canceledId)));
  assert.equal((await post('/api/contingency', { sourceId: saved.id, terms: { unknown: { fee: 1 } } })).status, 400);
  const dossierResponse = await fetch(url + '/api/dossier/' + saved.id);
  assert.equal(dossierResponse.status, 200);
  const dossier = await dossierResponse.json();
  assert.deepEqual(dossier.decision.selectedIds, memo.slate.selectedIds);
  assert.equal(dossier.mode, 'synthetic');
  const answerResponse = await post('/api/dossier/' + saved.id + '/ask', { question: 'What are the budget and fees?' });
  assert.equal(answerResponse.status, 200);
  assert.equal((await answerResponse.json()).grounding, 'saved_dossier_only');
  const reportResponse = await fetch(url + '/api/dossier/' + saved.id + '/report');
  assert.equal(reportResponse.status, 200);
  assert.match(reportResponse.headers.get('content-type'), /text\/html/);
  assert.match(await reportResponse.text(), /Houselights decision dossier/);
  assert.equal((await post('/api/packet/' + saved.id, {event:{date:'2026-11-20'}})).status,409);
  const operational = await (await post(`/api/decision/${saved.id}/proof`, {})).json();
  const review = await (await fetch(url + '/api/decision/' + operational.id)).json();
  const approved = await post(`/api/decision/${operational.id}/transition`, {action:'approve',expectedRevision:0,expectedScopeDigest:review.reviewScopeDigest,reason:'Reviewed the synthetic planning trade-offs.',acknowledgedFindings:operational.proof.findings.filter(f=>f.severity==='review').map(f=>f.id)});
  assert.equal(approved.status,200);
  const packetResponse = await post('/api/packet/' + operational.id, { expectedDecisionRevision:1, event: { name: 'Test Night', date: '2026-11-20', venue: 'Test Room', contactEmail: 'buyer@example.com' } });
  assert.equal(packetResponse.status, 200);
  const packet = await packetResponse.json();
  assert.equal(packet.holdRequests.length, memo.constraints.slots);
  assert.ok(packet.holdRequests.every(item => item.numericGuard.passed && item.status === 'draft_not_sent'));
  assert.match(packet.calendarIcs, /BEGIN:VCALENDAR/);
  const pipelineResponse = await fetch(url + '/api/pipeline/' + operational.id);
  assert.equal(pipelineResponse.status, 200);
  let pipeline = await pipelineResponse.json();
  const pipelineArtist = pipeline.deals[0].artistId;
  pipeline = await (await post('/api/pipeline/' + operational.id + '/events', { type: 'approve_pitch', artistId: pipelineArtist, expectedRevision:0, expectedDecisionRevision:1 })).json();
  assert.equal(pipeline.deals.find(item => item.artistId === pipelineArtist).stage, 'pitch_approved');
  const campaignResponse = await fetch(url + '/api/campaign/' + operational.id);
  assert.equal(campaignResponse.status, 200);
  assert.equal((await campaignResponse.json()).pipelineRevision, pipeline.revision);
  const intelligenceResponse = await post('/api/intelligence/' + saved.id, {
    origin: { name: 'London', lat: 51.5074, lon: -0.1278 },
    markets: [{ name: 'London', lat: 51.5074, lon: -0.1278 }, { name: 'Paris', lat: 48.8566, lon: 2.3522 }, { name: 'Berlin', lat: 52.52, lon: 13.405 }],
    stopCount: 2, startDate: '2026-11-20'
  });
  assert.equal(intelligenceResponse.status, 201);
  const intelligenceSaved = await intelligenceResponse.json();
  assert.equal(intelligenceSaved.snapshot.parentId, saved.id);
  assert.equal(intelligenceSaved.snapshot.intelligence.markets.length, 3);
  assert.equal(intelligenceSaved.snapshot.intelligence.cohesion.pairCount, 1);
  assert.equal(intelligenceSaved.snapshot.intelligence.audienceProfile.enabled, true);
  assert.equal(intelligenceSaved.snapshot.intelligence.audienceProfile.crossDomain.length, 3);
  assert.equal(intelligenceSaved.snapshot.intelligence.venueScouting.length, 2);
  assert.ok(intelligenceSaved.snapshot.intelligence.receipts.every(receipt => receipt.id.startsWith('i')));
  const capacityResponse = await post('/api/venues/' + intelligenceSaved.id + '/capacity-review', {
    venues: intelligenceSaved.snapshot.intelligence.venueScouting.map(group => ({
      market: group.market, venueId: group.candidates[0].id,
      pages: [{ url: 'https://fixture.example/technical', text: `<script>fixture</script> ${group.candidates[0].name}. Capacity: 500.` }]
    }))
  });
  assert.equal(capacityResponse.status, 201);
  const capacitySaved = await capacityResponse.json();
  assert.equal(capacitySaved.snapshot.capacityResearch.summary.consistent, 2);
  const qualifications = intelligenceSaved.snapshot.intelligence.venueScouting.map(group => ({
    market: group.market, venueId: group.candidates[0].id, useCapacityEvidence: true,
    available: true, venueCost: 1000, otherFixedCost: 250
  }));
  const venueResponse = await post('/api/venues/' + capacitySaved.id + '/qualify', {
    expectedCrowd: 400, ticketPrice: 45, variableCostPerAttendee: 5, travelCostPerKm: .5,
    artistFeeMode: 'whole_route', qualifications
  });
  assert.equal(venueResponse.status, 201);
  const venueSaved = await venueResponse.json();
  assert.equal(venueSaved.snapshot.parentId, capacitySaved.id);
  assert.equal(venueSaved.snapshot.venuePlan.routeEconomics.qualifiedStops, 2);
  const routedCampaign = await (await fetch(url + '/api/campaign/' + venueSaved.id)).json();
  assert.equal(routedCampaign.loop.research.marketBrief.routeStops.length, 2);
  assert.equal(routedCampaign.loop.research.marketBrief.venuePlan.routeEconomics.qualifiedStops, 2);
  const routedDossier = await (await fetch(url + '/api/dossier/' + venueSaved.id)).json();
  assert.equal(routedDossier.venuePlan.stops.length, 2);
  assert.ok(routedDossier.venuePlan.stops.every(stop => stop.capacityEvidence.claims.length));
  assert.match(routedDossier.markdown, /Venue capacity evidence/);
  const capacityExportResponse = await fetch(url + '/api/dossier/' + venueSaved.id + '/report');
  assert.equal(capacityExportResponse.status, 200);
  const capacityExport = await capacityExportResponse.text();
  assert.match(capacityExport, /Venue capacity evidence/);
  assert.match(capacityExport, /&lt;script&gt;fixture&lt;\/script&gt;/);
  assert.ok(!capacityExport.includes('<script>fixture</script>'));
  const priorWithActivation = apiStore.save({ ...venueSaved.snapshot, localActivation: { sourceId: venueSaved.id, fixture: true } });
  const revisedVenueResponse = await post('/api/venues/' + priorWithActivation + '/qualify', {
    expectedCrowd: 400, ticketPrice: 45, artistFeeMode: 'whole_route', qualifications
  });
  assert.equal(revisedVenueResponse.status, 201);
  assert.equal((await revisedVenueResponse.json()).snapshot.localActivation, undefined, 'a changed venue invalidates venue-linked activation');
  const refreshedResponse = await post('/api/intelligence/' + priorWithActivation, {
    origin: { name: 'London', lat: 51.5074, lon: -0.1278 },
    markets: [{ name: 'London', lat: 51.5074, lon: -0.1278 }, { name: 'Paris', lat: 48.8566, lon: 2.3522 }], stopCount: 2, startDate: '2026-11-20'
  });
  assert.equal(refreshedResponse.status, 201);
  const refreshed = (await refreshedResponse.json()).snapshot;
  for (const field of ['capacityResearch', 'venuePlan', 'localActivation']) assert.equal(refreshed[field], undefined, `${field} must not survive replaced route evidence`);
  assert.ok(apiStore.load(priorWithActivation).capacityResearch, 'the unchanged parent keeps its review');
  assert.equal((await post('/api/pipeline/' + operational.id + '/events', { type: 'approve_pitch', artistId: 'unknown', expectedRevision:1, expectedDecisionRevision:1 })).status, 400);
});

test('invalid inputs fail early; infeasible optimization is an explained result', async () => {
  assert.equal((await post('/api/memo', {})).status, 400);
  assert.equal((await post('/api/memo', { city: 'Pune', anchors: 'Alpha', offers: 'Beta', constraints: { slots: -1 } })).status, 400);
  assert.equal((await post('/api/optimize', { items: Array(11).fill({}) })).status, 400);
  assert.equal((await post('/api/analyze', { items: [], constraints: { budget: -1 } })).status, 400);
  const response = await post('/api/optimize', { items: [{ id: 'one', name: 'One', fit: .9, evidence: { rank: true }, terms: { fee: 100, available: true } }], constraints: { budget: 50, slots: 1 } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.feasible, false);
  assert.equal(result.diagnostics.relaxations.minimumBudget, 100);
});

test('saved scenarios retain original artist identities and illustrative-term provenance', async () => {
  const response = await post('/api/memo', {
    city: 'London', anchors: ['Radiohead'], offers: ['Phoenix'],
    picks: { Phoenix: { id: 'mock-p1', name: 'Phoenix (French band)' } },
    exampleBookingTerms: true,
    terms: { Phoenix: { fee: 1000, genre: 'indie', available: true } },
    constraints: { budget: 2000, slots: 1 }
  });
  assert.equal(response.status, 200);
  const events = (await response.text()).split('\n\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const saved = events.find(event => event.type === 'saved');
  assert.ok(saved, 'the resolved artist produces a saved run');
  const snapshot = await (await fetch(url + '/api/memo/' + saved.id)).json();
  const artist = snapshot.memo.items.find(item => item.id === 'mock-p1');
  assert.equal(artist.name, 'Phoenix (French band)');
  assert.equal(artist.originalName, 'Phoenix');
  assert.equal(artist.terms.fee, 1000);
  assert.equal(snapshot.input.exampleBookingTerms, true);
  assert.equal(snapshot.memo.input.exampleBookingTerms, true);
  assert.equal(snapshot.memo.exampleBookingTerms, true);

  const revisedTerms = { fee: 1500, genre: 'alternative', available: true };
  const scenarioResponse = await post('/api/scenario', {
    sourceId: saved.id, name: 'Revised quote', terms: { [artist.id]: revisedTerms },
    exampleBookingTerms: false
  });
  assert.equal(scenarioResponse.status, 201);
  const { id } = await scenarioResponse.json();
  const scenario = await (await fetch(url + '/api/memo/' + id)).json();
  assert.equal(scenario.memo.items.find(item => item.id === artist.id).originalName, 'Phoenix');
  assert.deepEqual(scenario.input.terms.Phoenix, revisedTerms);
  assert.deepEqual(scenario.input.terms['Phoenix (French band)'], revisedTerms);
  assert.equal(scenario.input.exampleBookingTerms, true);
  assert.equal(scenario.memo.input.exampleBookingTerms, true);
  assert.equal(scenario.memo.exampleBookingTerms, true, 'scenario requests cannot erase the source provenance');
});
