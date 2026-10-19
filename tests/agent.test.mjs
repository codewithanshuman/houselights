import test from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MODE = 'mock';
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
