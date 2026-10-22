import test from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
const { Run } = await import('../server/qloo.mjs');
const { buildMemo } = await import('../server/agent.mjs');

test('memo respects budget, surfaces ambiguity, links every claim to a receipt', async () => {
  const ev = [], run = new Run({ budget: 30, emit: e => ev.push(e) });
  await buildMemo({ city: 'Pune', anchors: ['Alpha'], offers: ['Beta', 'Phoenix', 'Gamma'] }, run);
  assert.ok(run.used <= 30);
  assert.ok(ev.some(e => e.type === 'needs_input' && e.name === 'Phoenix'));
  const memo = ev.find(e => e.type === 'memo');
  assert.ok(memo.items.length >= 1);
  const ids = new Set(run.receipts.map(r => r.id));
  assert.ok(memo.items.every(i => i.receipts.every(id => ids.has(id))));
});

test('budget exhaustion degrades to an error envelope instead of throwing', async () => {
  const run = new Run({ budget: 0 });
  const { env } = await run.call('describe', { entity: 'Zed' }, 'x');
  assert.equal(env.status, 'error');
});

test('offers resolving to an anchor cannot be ranked or booked, including aliases and explicit picks', async t => {
  const { mockCall } = await import('../server/mock.mjs');
  for (const { label, offer, picks = {} } of [
    { label: 'same name', offer: 'Alpha' },
    { label: 'resolved alias', offer: 'Alpha stage name' },
    { label: 'explicit identity pick', offer: 'Chosen artist', picks: { 'Chosen artist': { id: 'artist-alpha' } } }
  ]) await t.test(label, async () => {
    const run = new Run({ budget: 30, cacheStore: new Map(), execute: (tool, args) => {
      if (tool === 'describe') {
        const anchor = ['Alpha', 'Alpha stage name', 'artist-alpha'].includes(args.entity);
        return { status: 'ok', results: [{ entity_id: anchor ? 'artist-alpha' : 'artist-beta', name: anchor ? 'Alpha' : 'Beta' }] };
      }
      if (tool === 'recommend') return { status: 'empty', results: [] };
      return mockCall(tool, args);
    } });
    const memo = await buildMemo({ city: 'Pune', anchors: ['Alpha'], offers: [offer, 'Beta'], picks,
      terms: { [offer]: { fee: 0, available: true }, Beta: { fee: 100, available: true } },
      constraints: { budget: 100, slots: 1 } }, run);
    const ranking = run.receipts.find(receipt => receipt.tool === 'rank');
    assert.deepEqual(ranking.args.signals, ['artist-alpha'], 'the anchor remains the audience signal');
    assert.deepEqual(ranking.args.options, ['artist-beta'], 'the anchor must not be ranked against itself');
    assert.deepEqual(memo.items.map(item => item.id), ['artist-beta']);
    assert.deepEqual(memo.slate.selectedIds, ['artist-beta'], 'the valid offer remains bookable');
  });
});

test('an anchor-only offer pool cannot produce a self-recommendation through discovery', async () => {
  const { mockCall } = await import('../server/mock.mjs');
  const events = [], run = new Run({ budget: 30, cacheStore: new Map(), emit: event => events.push(event),
    execute: (tool, args) => tool === 'recommend' ? mockCall('describe', { entity: 'Alpha' }) : mockCall(tool, args) });
  const memo = await buildMemo({ city: 'Pune', anchors: ['Alpha'], offers: ['Alpha'],
    terms: { Alpha: { fee: 0, available: true } }, constraints: { budget: 100, slots: 1 } }, run);
  assert.equal(memo, undefined);
  assert.ok(events.some(event => event.type === 'error' && /No candidates/.test(event.text)));
  assert.ok(!run.receipts.some(receipt => receipt.tool === 'rank'), 'no ranking runs without eligible candidates');
});

test('a failed rank cannot become an input-order positive recommendation', async () => {
  const { mockCall } = await import('../server/mock.mjs');
  const run = new Run({ budget: 30, cacheStore: new Map(), execute: (tool, args) => tool === 'rank'
    ? { status: 'error', results: [], summary: 'rank unavailable' } : mockCall(tool, args) });
  const memo = await buildMemo({ city: 'Pune', anchors: ['Alpha'], offers: ['Beta'], terms: { Beta: { fee: 100, available: true } }, constraints: { budget: 200, slots: 1 } }, run);
  assert.ok(memo.items.every(item => item.fit === null && item.rank === null && item.verdict === 'hold'));
  assert.equal(memo.slate.status, 'provisional');
  assert.equal(memo.slate.confidence.level, 'insufficient');
});

test('partial successful rankings cannot inflate fit by dropping unreturned candidates',async()=>{
  const {mockCall}=await import('../server/mock.mjs');
  const run=new Run({budget:30,cacheStore:new Map(),execute:(tool,args)=>{
    const result=mockCall(tool,args);
    return tool==='rank'?{...result,results:result.results.slice(0,1)}:result;
  }});
  const memo=await buildMemo({city:'Pune',anchors:['Alpha'],offers:['Beta','Gamma'],terms:{Beta:{fee:100,available:true},Gamma:{fee:100,available:true}},constraints:{budget:200,slots:1}},run);
  assert.ok(memo.items.length>1);
  assert.ok(memo.items.every(item=>item.fit===null&&!item.evidence.rank&&item.verdict==='hold'));
  assert.equal(memo.quality.ranked,0);
  assert.match(memo.caveats.join(' '),/full-pool fit is unknown/);
});
