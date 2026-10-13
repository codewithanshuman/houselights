import test from 'node:test';
import assert from 'node:assert/strict';
import { Run, decodeToolResult } from '../server/qloo.mjs';
import { compactEvidence, comparisonOf, idOf, nameOf, normalizeEnvelope, trendOf } from '../server/shape.mjs';
import { mockCall } from '../server/mock.mjs';

const ok = (name = 'Artist') => ({ status: 'ok', summary: 'Returned an artist.', results: [{ name, entity_id: 'artist-1' }] });
const call = run => run.call('describe', { entity: 'Artist', type: 'artist' }, 'Confirm identity');
const makeRun = options => new Run({ mode: 'live', cacheStore: new Map(), execute: () => ok(), ...options });

test('decodes canonical MCP structured content and JSON text fallback', () => {
  assert.equal(decodeToolResult({ structuredContent: ok() }, 'describe').result_count, 1);
  assert.equal(decodeToolResult({ content: [{ type: 'text', text: 'progress' }, { type: 'text', text: JSON.stringify(ok()) }] }, 'describe').results[0].name, 'Artist');
  assert.equal(decodeToolResult({ isError: true, structuredContent: ok() }, 'describe').error.code, 'MCP_ERROR');
  assert.equal(decodeToolResult({ content: [{ type: 'text', text: 'not JSON' }] }, 'describe').error.code, 'INVALID_RESPONSE');
});

test('normalizes official needs_input resolution issues without choosing a candidate', () => {
  const raw = { status: 'needs_input', resolution: { issues: [{ candidates: [
    { entityId: 'artist-a', name: 'Phoenix A' }, { entityId: 'artist-b', name: 'Phoenix B' },
  ] }] }, results: [] };
  const env = normalizeEnvelope(raw, 'describe');
  assert.equal(env.status, 'needs_input');
  assert.equal(env.result_count, 2);
  assert.deepEqual(env.results.map(idOf), ['artist-a', 'artist-b']);
});

test('normalizes official trend series and never invents growth from unknown point schemas', () => {
  const env = normalizeEnvelope({ status: 'ok', series: [{ entity: { entityId: 'artist-a', name: 'Artist A' },
    points: [{ date: '2026-01-01', popularity: 2 }, { date: '2026-02-01', popularity: 9 }] }] }, 'trends');
  assert.equal(nameOf(env.results[0]), 'Artist A');
  assert.equal(idOf(env.results[0]), 'artist-a');
  assert.equal(trendOf(env, 'artist-a').direction, 'unknown');
  assert.equal(trendOf(env, 'missing-id').change, null);
  assert.equal(trendOf({ change: -2 }).direction, 'cooling');
  assert.equal(trendOf({ change: 0 }).direction, 'flat');
  assert.equal(trendOf({ change: Infinity }).direction, 'unknown');
  assert.equal(compactEvidence('trends', env).rows[0].pointCount, 2);
});

test('preserves object comparison as contextual evidence, including repeated normalization', () => {
  const env = normalizeEnvelope({ status: 'ok', results: { shared: [{ name: 'A', affinity: .71 }] } }, 'compare_audiences');
  assert.deepEqual(env.results, []);
  assert.ok(comparisonOf(env).available);
  assert.deepEqual(normalizeEnvelope(env, 'compare_audiences').comparison, env.comparison);
  const evidence = compactEvidence('compare_audiences', env);
  assert.equal(evidence.comparisonAvailable, true);
  assert.deepEqual(evidence.returnedFields, ['shared']);
  assert.match(evidence.interpretation, /does not measure unique or net-new/);
  assert.ok(!Object.hasOwn(evidence, 'netNew'));
  assert.equal(comparisonOf(normalizeEnvelope({ status: 'ok', results: {} }, 'compare_audiences')).available, false);
});

test('retains provider error retry policy but rejects unsupported envelopes', () => {
  const error = decodeToolResult({ isError: true, structuredContent: { status: 'error', error: { code: 'QLOO_AUTH', retryable: false, recovery: 'Configure credentials.' } } }, 'rank');
  assert.equal(error.error.code, 'QLOO_AUTH');
  assert.equal(error.error.retryable, false);
  for (const value of [null, [], {}, { status: 'running' }]) assert.equal(normalizeEnvelope(value, 'rank').error.code, 'INVALID_RESPONSE');
});

test('cache canonicalizes argument keys, preserves fetch time, and does not spend call budget', async () => {
  let time = 1000, count = 0;
  const run = makeRun({ budget: 1, ttl: 100, now: () => time, execute: () => { count++; return ok(); } });
  const first = await call(run);
  first.env.results[0].name = 'Mutated by caller';
  time = 1050;
  const second = await run.call('describe', { type: 'artist', entity: 'Artist' }, 'Read cached identity');
  assert.equal(count, 1);
  assert.equal(run.used, 1);
  assert.equal(second.receipt.cached, true);
  assert.equal(second.receipt.attempts, 0);
  assert.equal(second.env.results[0].name, 'Artist');
  assert.equal(second.receipt.fetchedAt, first.receipt.fetchedAt);
  assert.notEqual(second.receipt.observedAt, first.receipt.observedAt);
  assert.equal(second.receipt.digest, first.receipt.digest);
});

test('expired data is not served after workflow budget exhaustion', async () => {
  let time = 1000;
  const run = makeRun({ budget: 1, ttl: 100, now: () => time });
  await call(run);
  time = 1100;
  const next = await call(run);
  assert.equal(next.env.error.code, 'BUDGET');
  assert.equal(next.receipt.cached, false);
  assert.equal(next.receipt.attempts, 0);
});

test('cache separates live, synthetic and different server credential scopes', async () => {
  const cacheStore = new Map();
  const previous = process.env.QLOO_API_KEY;
  try {
    process.env.QLOO_API_KEY = 'unit-test-credential-a';
    const live = makeRun({ cacheStore, execute: () => ok('Live A') });
    const mock = makeRun({ cacheStore, mode: 'mock', execute: () => ok('Synthetic') });
    await call(live);
    assert.equal((await call(mock)).env.results[0].name, 'Synthetic');
    process.env.QLOO_API_KEY = 'unit-test-credential-b';
    const other = makeRun({ cacheStore, execute: () => ok('Live B') });
    const result = await call(other);
    assert.equal(result.env.results[0].name, 'Live B');
    assert.equal(result.receipt.cached, false);
    assert.ok(!JSON.stringify([...cacheStore.entries()]).includes('unit-test-credential'));
  } finally {
    if (previous === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = previous;
  }
});

test('retryable errors spend the same bounded workflow budget as first attempts', async () => {
  const delays = [];
  const run = makeRun({ budget: 2, execute: () => ({ status: 'error', error: { code: 'QLOO_RATE_LIMIT', retryable: true } }), delay: async ms => { delays.push(ms); } });
  const { env, receipt } = await call(run);
  assert.equal(env.error.code, 'QLOO_RATE_LIMIT');
  assert.equal(run.used, 2);
  assert.equal(receipt.attempts, 2);
  assert.deepEqual(delays, [700]);
  assert.equal(run.cache.size, 0);
});

test('retry attempts stop at three and recoverable success can be cached', async () => {
  let calls = 0;
  const run = makeRun({ budget: 10, execute: () => ++calls < 3 ? { status: 'error', error: { code: 'QLOO_TIMEOUT', retryable: true } } : ok(), delay: async () => {} });
  assert.equal((await call(run)).receipt.attempts, 3);
  assert.equal((await call(run)).receipt.cached, true);
  assert.equal(calls, 3);
  const broken = makeRun({ budget: 10, execute: () => ({ status: 'error', error: { retryable: true } }), delay: async () => {} });
  assert.equal((await call(broken)).receipt.attempts, 3);
});

test('authentication errors, invalid payloads and ambiguity are not retried or cached', async () => {
  for (const raw of [{ status: 'error', error: { code: 'QLOO_AUTH', retryable: false } }, { status: 'needs_input', results: [] }, { unexpected: true }]) {
    const run = makeRun({ execute: () => raw });
    await call(run);
    await call(run);
    assert.equal(run.used, 2);
    assert.equal(run.cache.size, 0);
  }
});

test('bounded timeout aborts an unresponsive workflow and returns an inspectable receipt', async () => {
  let signal;
  const run = makeRun({ timeoutMs: 15, execute: (_, __, options) => { signal = options.signal; return new Promise(() => {}); } });
  const { env, receipt } = await call(run);
  assert.equal(env.error.code, 'TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal(run.used, 1);
  assert.equal(receipt.evidence.error, 'TIMEOUT');
});

test('transport exceptions never echo internal credentials into receipts', async () => {
  const run = makeRun({ execute: () => { throw new Error('secret-key-in-upstream-error'); } });
  const result = await call(run);
  assert.equal(result.env.error.code, 'TRANSPORT');
  assert.ok(!JSON.stringify(result).includes('secret-key-in-upstream-error'));
});

test('receipts bound evidence and retain public provenance without raw requests', async () => {
  const run = makeRun({ execute: () => ({ ...ok(), results: Array.from({ length: 15 }, (_, i) => ({
    name: `Artist ${i}`, entity_id: `a-${i}`, query: { affinity: .5 }, secret: 'private payload',
  })), provenance: { source: 'Qloo API', endpoint: '/v2/insights', documentation: 'https://docs.qloo.com/reference/taste-analysis', requests: [{ headers: 'secret-value' }] } }) });
  const { receipt } = await call(run);
  assert.equal(receipt.source, 'qloo');
  assert.equal(receipt.count, 15);
  assert.equal(receipt.evidence.rows.length, 12);
  assert.equal(receipt.evidence.rows[0].affinity, .5);
  assert.equal(receipt.provenance.endpoint, '/v2/insights');
  assert.ok(!JSON.stringify(receipt).includes('secret'));
  assert.match(receipt.digest, /^sha256:[a-f0-9]{64}$/);
});

test('compact heatmap and place evidence preserves bounded public coordinates', async () => {
  const run = makeRun({ execute: () => ({ ...ok(), results: [{ name: 'Tile', location: { latitude: 51.5, longitude: -.12 },
    query: { affinity: .7, affinity_rank: .9, popularity: .6 } }] }) });
  const { receipt } = await run.call('where_popular', { entity: 'artist-1', within: 'London' }, 'Locate a hotspot');
  assert.deepEqual(receipt.evidence.rows[0], { name: 'Tile', affinity: .7, affinityRank: .9, popularity: .6, lat: 51.5, lon: -.12 });
});

test('receipt offsets prevent collisions when a workflow extends a child snapshot', async () => {
  const run = makeRun({ receiptPrefix: 'i', receiptOffset: 21 });
  assert.equal((await call(run)).receipt.id, 'i22');
});

test('mock identity choices are artists and resolve by stable ID on retry', () => {
  const ambiguous = normalizeEnvelope(mockCall('describe', { entity: 'Phoenix', type: 'artist' }), 'describe');
  assert.equal(ambiguous.status, 'needs_input');
  assert.equal(ambiguous.results.length, 2);
  assert.ok(ambiguous.results.every(row => row.type === 'urn:entity:artist'));
  const choice = ambiguous.results[0];
  const resolved = mockCall('describe', { entity: idOf(choice), type: 'artist' });
  assert.equal(resolved.status, 'ok');
  assert.equal(idOf(resolved.results[0]), idOf(choice));
  assert.equal(nameOf(resolved.results[0]), nameOf(choice));
  assert.equal(mockCall('describe', { entity: 'mock-does-not-exist' }).status, 'empty');
});

test('mock fixture provenance cannot be mislabeled live, including cached replies', async () => {
  const run = makeRun({ execute: mockCall });
  const first = await call(run), second = await call(run);
  assert.equal(first.receipt.source, 'synthetic');
  assert.equal(second.receipt.source, 'synthetic');
  assert.equal(second.receipt.cached, true);
});
