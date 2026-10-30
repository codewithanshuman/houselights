import test from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
const { distanceKm, locatePlace, nearPlace, summarizePlace, NEAR_KM } = await import('../server/place-check.mjs');
const { buildMemo } = await import('../server/agent.mjs');
const { Run } = await import('../server/qloo.mjs');

const place = { status: 'found', name: 'Akole, Akola, Ahilyanagar District', lat: 19.54, lon: 74.01 };
const tile = km => ({ lat: 19.54 + km / 111.2, lon: 74.01 });
const receipt = kms => ({ tool: 'where_popular', evidence: { rows: kms.map(tile) } });
const answer = rows => async () => ({ ok: true, json: async () => rows });

test('distances are real great-circle kilometres', () => {
  assert.ok(Math.abs(distanceKm(19.08, 72.88, 28.61, 77.21) - 1150) < 15, 'Mumbai to Delhi');
  assert.equal(distanceKm(1, 2, 1, 2), 0);
});

test('a place is confirmed, not found, or the lookup is unavailable, and those stay distinct', async () => {
  const found = await locatePlace('Sangamner test', { fetcher: answer([{ lat: '19.49', lon: '74.25', display_name: 'Sangamner, Ahilyanagar District, Maharashtra, India' }]) });
  assert.deepEqual(found, { status: 'found', name: 'Sangamner, Ahilyanagar District, Maharashtra', lat: 19.49, lon: 74.25 });
  assert.equal((await locatePlace('Tiny Village Nowhere test', { fetcher: answer([]) })).status, 'not-found');
  let calls = 0;
  const down = async () => { calls++; throw new Error('offline'); };
  assert.equal((await locatePlace('Map outage test', { fetcher: down })).status, 'unavailable', 'an outage never rejects a real place');
  assert.equal((await locatePlace('Refused test', { fetcher: async () => ({ ok: false, status: 429 }) })).status, 'unavailable');
  // An outage is not remembered; a confirmed answer is.
  await locatePlace('Map outage test', { fetcher: down });
  assert.equal(calls, 2);
  let asked = 0;
  await locatePlace('SANGAMNER TEST ', { fetcher: async () => { asked++; return answer([])(); } });
  assert.equal(asked, 0, 'the same place is not looked up twice');
});

test('a place name shows each part once', async () => {
  const place = await locatePlace('Pune name test', { fetcher: answer([{ lat: '18.5', lon: '73.8', display_name: 'Pune, Pune City Subdistrict, Pune, Maharashtra, 411001, India' }]) });
  assert.equal(place.name, 'Pune, Maharashtra, India');
});

test('the lookup sends only the place name and identifies itself', async () => {
  let url, options;
  await locatePlace('Hallstatt request test', { fetcher: async (u, o) => { url = new URL(u); options = o; return answer([])(); } });
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Hallstatt request test');
  assert.match(options.headers['user-agent'], /^Houselights/);
});

test('a plan says only what the measured distances support', () => {
  // The distances measured for real on production: Mumbai 4–17 km, Akole 94–320 km, Hallstatt 1–219 km.
  assert.equal(summarizePlace(place, [receipt([4, 15, 17])]).status, 'this-place');
  const far = summarizePlace(place, [receipt([94, 304, 320])]);
  assert.deepEqual([far.status, far.within, far.tiles, far.nearestKm], ['elsewhere', 0, 3, 94]);
  const mixed = summarizePlace(place, [receipt([1, 202, 219])]);
  assert.deepEqual([mixed.status, mixed.within], ['partly', 1]);
  assert.equal(summarizePlace(place, []).status, 'unmeasured');
  assert.equal(summarizePlace({ status: 'unavailable' }, [receipt([1])]).status, 'unavailable');
  assert.equal(nearPlace(place, [tile(NEAR_KM - 2)]), true);
  assert.equal(nearPlace(place, [tile(NEAR_KM + 2)]), false);
  assert.equal(nearPlace(place, [{ name: 'no coordinates' }]), false, 'a tile without coordinates proves nothing');
});

test('a tile far from the place never becomes local evidence, and the bill is decided on that', async () => {
  const brief = { city: 'London', anchors: ['Arlo Parks'], offers: [], constraints: { budget: 20000, slots: 2, maxPerGenre: 2 } };
  const discover = { limit: 6, research: 'value-of-information', terms: () => ({ fee: 1500, available: true, genre: '' }) };
  const memo = extra => buildMemo({ ...brief, discover: { ...discover, ...extra } }, new Run({ budget: 12, cacheStore: new Map() }));
  const open = await memo({});
  const gated = await memo({ nearPlace: () => false });
  assert.ok(open.items.some(item => item.local === 'yes'), 'the fixture does return location rows');
  assert.ok(gated.items.every(item => item.local === 'no data'), 'no act keeps a local claim');
  assert.ok(gated.items.every(item => item.evidence.local === false));
  assert.ok(gated.items.flatMap(item => item.claims ?? []).every(claim => !/results are available/.test(claim.text ?? '')));
});
