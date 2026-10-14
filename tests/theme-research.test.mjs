import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../server/qloo.mjs';
import { prepareThemeResearch, researchThemeSeason } from '../server/theme-research.mjs';

const fixture = () => ({ id: 'theme-source', mock: true, receipts: [{ id: 'g1' }, { id: 'g2' }],
  festivalResearch: { input: { city: 'London' }, experience: [{ target: 'brand', receiptId: 'old-partner', candidates: [{ id: 'shared', name: 'Shared partner' }] }],
    markets: [{ city: 'London', domains: ['movie', 'artist'].map((kind, i) => ({ kind, evidence: `g${i + 1}`, entities: Array.from({ length: 3 }, (_, n) => ({ id: `${kind}-${n}`, name: `${kind} ${n}`, kind })) })) }] } });
const options = { dates: [{ date: '2027-04-01', time: 'night', segment: 'gen_z' }, { date: '2027-04-15', time: 'night', segment: 'young_pros' }], count: 2, referenceLocation: 'United Kingdom', sponsorTags: ['technology'] };
const execute = (tool, args) => ({ status: 'ok', results: tool === 'rank'
  ? (args.demographic === '0-24' || args.signal_location === 'United Kingdom' ? [...args.options].reverse() : args.options).map(id => ({ entity_id: id, name: id }))
  : [{ entity_id: `${args.signals[0]}-${args.target_type}`, name: `Theme-specific ${args.target_type}` }] });
const makeRun = overrides => new Run({ mode: 'mock', execute, budget: 60, receiptPrefix: 'g', receiptOffset: 2, cacheStore: new Map(), ...overrides });

test('season research connects fixed-pool age matrix, reference lift and individually researched partners', async () => {
  const source = fixture(), before = structuredClone(source), run = makeRun();
  const plan = prepareThemeResearch(source, options);
  assert.equal(plan.expectedCalls, 18);
  const result = await researchThemeSeason(source, options, run), season = result.themeSeason;
  assert.deepEqual(source, before);
  assert.equal(result.parentId, source.id);
  assert.equal(season.research.status, 'complete');
  assert.equal(season.research.matrix.length, 2);
  assert.equal(run.receipts.length, plan.expectedCalls);
  assert.equal(new Set(result.receipts.map(receipt => receipt.id)).size, result.receipts.length);
  for (const domain of season.research.matrix) {
    const first = domain.rows[0];
    assert.equal(first.segments.gen_z.utility, 0);
    assert.equal(first.segments.young_pros.utility, 1);
    assert.equal(first.segments.young_pros.buckets.length, 2);
    assert.equal(first.referenceLift.positions, 2);
    assert.ok(run.receipts.filter(receipt => receipt.tool === 'rank' && receipt.args.option_type === domain.kind)
      .every(receipt => JSON.stringify(receipt.args.options) === JSON.stringify(domain.poolIds)));
  }
  for (const night of season.nights) {
    assert.equal(night.tasteFit.measuredWeight, .55);
    assert.equal(night.experience.length, 4);
    assert.ok(!night.evidence.includes('old-partner'));
    assert.ok(night.evidence.every(id => result.receipts.some(receipt => receipt.id === id)));
    for (const kit of night.experience) {
      const receipt = run.receipts.find(receipt => receipt.id === kit.receiptId);
      assert.deepEqual(receipt.args.signals, [night.anchor.id]);
      if (kit.target === 'brand') assert.deepEqual(receipt.args.include_tags, ['technology']);
      if (kit.target === 'place') assert.equal(receipt.args.filter_location, 'London');
    }
  }
});

test('incomplete age rankings have no utility, and missing partners never fall back to shared festival leads', async () => {
  const run = makeRun({ execute: (tool, args) => {
    if (tool === 'recommend') return { status: 'error', results: [] };
    const response = execute(tool, args);
    if (args.demographic === '30-34') { response.results.pop(); response.status = 'partial'; }
    return response;
  } });
  const season = (await researchThemeSeason(fixture(), options, run)).themeSeason;
  assert.equal(season.research.status, 'partial');
  assert.ok(season.research.matrix.every(domain => domain.rows.every(row => row.segments.young_pros.utility === null)));
  assert.ok(season.nights.every(night => night.sponsors.length === 0 && night.playlist.length === 0 && night.mediaPartner === null));
  const young = season.nights.find(night => night.segment === 'young_pros');
  assert.ok(young.tasteFit.estimated.includes('segmentFit'));
});

test('family life-stage remains unsupported and suitability filters remove alcohol leads', async () => {
  const run = makeRun({ execute: (tool, args) => tool === 'rank' ? execute(tool, args) : { status: 'ok', results: [{ entity_id: 'beer', name: 'Beer Brewery' }] } });
  const season = (await researchThemeSeason(fixture(), { dates: [{ date: '2027-04-04', time: 'day', segment: 'families' }], count: 1 }, run)).themeSeason;
  assert.ok(run.receipts.every(receipt => !receipt.args.demographic));
  assert.equal(season.research.matrix[0].rows[0].segments.families.status, 'unsupported');
  assert.equal(season.research.status, 'partial');
  assert.equal(season.nights[0].sponsors.length, 0);
  assert.equal(season.nights[0].tasteFit.measuredWeight, .3);
});

test('preflight rejects over-budget research before making any provider call', async () => {
  let calls = 0;
  const run = makeRun({ budget: 17, execute: () => { calls++; return { status: 'ok', results: [] }; } });
  await assert.rejects(researchThemeSeason(fixture(), options, run), /requires 18 workflows/);
  assert.equal(calls, 0);
  assert.equal(run.receipts.length, 0);
});

test('explicit date overrides reserve themes, include them in capped pools and reject unknown or conflicting IDs', async () => {
  const raw = { ...options, candidateLimit: 2, anchorOverrides: { '2027-04-15': 'movie-2' }, excludedAnchorIds: ['artist-0'] };
  const plan = prepareThemeResearch(fixture(), raw);
  assert.ok(plan.domains.find(domain => domain.kind === 'movie').entities.some(card => card.id === 'movie-2'));
  const season = (await researchThemeSeason(fixture(), raw, makeRun())).themeSeason;
  assert.equal(season.nights[1].anchor.id, 'movie-2');
  assert.equal(season.nights[1].selection.method, 'organizer_override');
  assert.notEqual(season.nights[0].anchor.id, 'movie-2');
  assert.ok(season.nights.every(night => night.anchor.id !== 'artist-0'));
  for (const bad of [
    { anchorOverrides: { '2027-04-02': 'movie-2' } },
    { anchorOverrides: { '2027-04-01': 'unknown' } },
    { anchorOverrides: { '2027-04-01': 'movie-2', '2027-04-15': 'movie-2' } },
    { anchorOverrides: { '2027-04-01': 'movie-2' }, excludedAnchorIds: ['movie-2'] },
    { candidateLimit: 11 }, { sponsorTags: 'technology' }, { referenceLocation: 'London' },
    { excludedAnchorIds: ['unknown'] },
  ]) assert.throws(() => prepareThemeResearch(fixture(), { ...options, ...bad }));
});

test('failed reference rankings cannot create apparent rank lift or influence audience scores', async () => {
  const run = makeRun({ execute: (tool, args) => args.signal_location === 'United Kingdom' ? { status: 'empty', results: [] } : execute(tool, args) });
  const season = (await researchThemeSeason(fixture(), options, run)).themeSeason;
  assert.ok(season.research.matrix.every(domain => domain.rows.every(row => row.referenceLift.positions === null)));
  assert.equal(season.research.status, 'partial');
  assert.ok(season.nights.every(night => night.tasteFit.measuredWeight === .55));
});

test('ambiguous sponsor categories expose bounded explicit choices and are never interpreted as brand leads', async () => {
  const run = makeRun({ execute: (tool, args) => tool === 'recommend' && args.target_type === 'brand' ? {
    status: 'needs_input', resolution: { issues: [{ field: 'include_tags', input_kind: 'tag', input: 'technology', candidates: [
      { id: 'urn:tag:industry:qloo:technology', name: 'Technology' },
      { id: 'urn:tag:keyword:qloo:technology', name: 'Technology' },
      { id: 'not-a-category', name: 'Wrong input kind' },
    ] }] }, results: [],
  } : execute(tool, args) });
  const season = (await researchThemeSeason(fixture(), options, run)).themeSeason;
  for (const night of season.nights) {
    assert.deepEqual(night.sponsors, []);
    const brand = night.experience.find(kit => kit.target === 'brand');
    assert.equal(brand.resolution[0].input, 'technology');
    assert.equal(brand.resolution[0].candidates.length, 2);
    assert.equal(brand.resolution[0].receiptId, brand.receiptId);
  }
});
