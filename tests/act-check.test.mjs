import test from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
const { readAct, checkAct, checkActs, summarizeActs } = await import('../server/act-check.mjs');
const { buildMemo } = await import('../server/agent.mjs');
const { Run } = await import('../server/qloo.mjs');

const row = (name, ended, end, extra = {}) => ({ name, score: 100, country: 'US', 'life-span': { ended, end }, ...extra });
const answer = artists => async () => ({ ok: true, json: async () => ({ artists }) });

test('an exact, single match says whether the act has ended', () => {
  assert.deepEqual(readAct([row('Soundgarden', true, '2017')], 'Soundgarden'), { status: 'ended', endedYear: 2017, from: 'US' });
  assert.deepEqual(readAct([row('Pearl Jam', null)], 'pearl jam'), { status: 'active', from: 'US' });
  assert.equal(readAct([row('Sigur Rós', true, '2020')], 'Sigur Ros').status, 'ended', 'accents do not hide a match');
  assert.equal(readAct([row('Someone Else', true, '2017', { aliases: [{ name: 'Old Name' }] })], 'Old Name').status, 'ended');
});

test('a doubtful match never removes an act', () => {
  assert.equal(readAct([row('Soundgarden Tribute', true, '2017')], 'Soundgarden').status, 'unknown', 'a similar name is not a match');
  assert.equal(readAct([{ ...row('Air', true, '2000'), score: 60 }], 'Air').status, 'unknown');
  const shared = readAct([row('Air', true, '1990'), row('Air', null)], 'Air');
  assert.deepEqual(shared, { status: 'unknown', ambiguous: true }, 'two acts share this name and only one ended');
  assert.equal(readAct([], 'Nobody').status, 'unknown');
});

test('an outage is unavailable, is not remembered, and a confirmed answer is', async () => {
  let calls = 0;
  const down = async () => { calls++; throw new Error('offline'); };
  assert.equal((await checkAct('Outage Test', { fetcher: down })).status, 'unavailable');
  await checkAct('Outage Test', { fetcher: down });
  assert.equal(calls, 2);
  assert.equal((await checkAct('Refused Test', { fetcher: async () => ({ ok: false, status: 503 }) })).status, 'unavailable');
  await checkAct('Known Test', { fetcher: answer([row('Known Test', null)]) });
  let asked = 0;
  await checkAct('KNOWN TEST ', { fetcher: async () => { asked++; return answer([])(); } });
  assert.equal(asked, 0);
});

test('the lookup sends only the name and identifies itself', async () => {
  let url, options;
  await checkAct('Request "Test"', { fetcher: async (u, o) => { url = new URL(u); options = o; return answer([])(); } });
  assert.equal(url.hostname, 'musicbrainz.org');
  assert.equal(url.searchParams.get('query'), 'artist:"Request  Test "');
  assert.match(options.headers['user-agent'], /^Houselights/);
});

test('acts past the deadline are unchecked, not ended', async () => {
  const results = await checkActs(['Deadline A', 'Deadline B'], { deadlineMs: 0, fetcher: answer([row('Deadline A', true, '2000')]) });
  assert.deepEqual([...results.values()].map(act => act.status), ['unavailable', 'unavailable']);
  const summary = summarizeActs(new Map([['A', { status: 'active' }], ['B', { status: 'ended' }], ['C', { status: 'unavailable' }]]), [{ name: 'B', endedYear: 2017 }]);
  assert.deepEqual(summary, { source: 'MusicBrainz', checked: 2, total: 3, active: 1, from: {}, removed: [{ name: 'B', endedYear: 2017 }] });
});

test('an ended act never reaches the pool, and a working act takes its place', async () => {
  const brief = { city: 'London', anchors: ['Arlo Parks'], offers: [], constraints: { budget: 20000, slots: 2, maxPerGenre: 2 } };
  const discover = { limit: 6, research: 'value-of-information', terms: () => ({ fee: 1500, available: true, genre: '' }) };
  const memo = extra => buildMemo({ ...brief, discover: { ...discover, ...extra } }, new Run({ budget: 12, cacheStore: new Map() }));
  const open = await memo({});
  const gone = open.items[0].name, kept = open.items[1].name;
  const checked = await memo({ checkActs: async names => new Map(names.map(name => [name, name === gone ? { status: 'ended', endedYear: 2017 } : { status: 'active' }])) });
  assert.ok(checked.items.every(item => item.name !== gone));
  assert.ok(checked.items.some(item => item.name === kept));
  assert.ok(!checked.slate.selectedIds.includes(gone));
  assert.deepEqual(checked.actCheck.removed, [{ name: gone, endedYear: 2017 }]);
});

test('without a lookup a plan runs as before and claims no check', async () => {
  const memo = await buildMemo({ city: 'London', anchors: ['Arlo Parks'], offers: [], constraints: { budget: 20000, slots: 2, maxPerGenre: 2 },
    discover: { limit: 6, terms: () => ({ fee: 1500, available: true, genre: '' }) } }, new Run({ budget: 12, cacheStore: new Map() }));
  assert.equal(memo.actCheck, undefined);
});

test('when no bill of the closest matches fits, the agent searches for acts the budget can reach', async () => {
  const brief = { city: 'London', anchors: ['Arlo Parks'], offers: [], constraints: { budget: 12000, slots: 2, maxPerGenre: 2 } };
  const terms = row => ({ fee: /Rising/.test(row.name) ? 4000 : 25000, available: true, genre: '' });
  const asked = [];
  const memo = await buildMemo({ ...brief, discover: { limit: 6, terms, reachable: limit => { asked.push(limit); return 0.98; } } }, new Run({ budget: 12, cacheStore: new Map() }));
  assert.deepEqual(asked, [6000]);
  assert.ok(memo.slate.feasible, 'a bill now exists');
  assert.ok(memo.slate.selectedIds.every(id => /^mock-r/.test(id)));
  assert.equal(memo.widened.added, 5);
});

test('a wider search keeps only acts confirmed active, and an affordable pool is left alone', async () => {
  const brief = { city: 'London', anchors: ['Arlo Parks'], offers: [], constraints: { budget: 12000, slots: 2, maxPerGenre: 2 } };
  const terms = row => ({ fee: /Rising/.test(row.name) ? 4000 : 25000, available: true, genre: '' });
  const checkActs = async names => new Map(names.map(name => [name, name === 'Mock Rising 1' ? { status: 'ended', endedYear: 2024 } : name === 'Mock Rising 2' ? { status: 'unknown' } : { status: 'active' }]));
  const memo = await buildMemo({ ...brief, discover: { limit: 6, terms, checkActs, reachable: () => 0.98 } }, new Run({ budget: 12, cacheStore: new Map() }));
  const names = memo.items.map(item => item.name);
  assert.ok(!names.includes('Mock Rising 1') && !names.includes('Mock Rising 2'));
  assert.ok(memo.actCheck.removed.some(act => act.name === 'Mock Rising 1'));
  let asked = 0;
  await buildMemo({ ...brief, discover: { limit: 6, terms: () => ({ fee: 1500, available: true, genre: '' }), reachable: () => { asked++; return 0.98; } } }, new Run({ budget: 12, cacheStore: new Map() }));
  assert.equal(asked, 0);
});

test('a fee limit maps to the tier it can afford', async () => {
  const { popularityFor } = await import('../server/fee-tiers.mjs');
  assert.equal(popularityFor(10000), 0.99);
  assert.equal(popularityFor(500000), null, 'every tier fits');
  assert.equal(popularityFor(100), null, 'no tier fits');
});

test('a busy service is asked again, in order, within the deadline', async () => {
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { ok: false, status: 503 } : answer([row('Busy Retry Test', true, '2022')])());
  const results = await checkActs(['Busy Retry Test'], { fetcher: flaky, deadlineMs: 5000 });
  assert.equal(calls, 2);
  assert.deepEqual(results.get('Busy Retry Test'), { status: 'ended', endedYear: 2022, from: 'US' });
});
