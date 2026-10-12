import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { optimizeSlate } from '../server/optimizer.mjs';

const clientScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

// Exercise the actual saved-run loader/exporter with a minimal DOM. Layout and
// browser interaction are checked separately; this guards restored data.
function client(saved) {
  const elements = new Map();
  let exported;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', hidden: false, dataset: {}, classList: { toggle() {}, remove() {} },
      addEventListener() {}, setAttribute() {}, removeAttribute() {}, click() {}, insertAdjacentHTML() {}, style: { setProperty() {} }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { head: element('head'), getElementById: element, querySelectorAll: () => [], querySelector: () => element('page-footer'), addEventListener() {}, createElement: () => element('download') },
    window: { location: { pathname: '/' } },
    fetch: async path => ({ ok: true, json: async () => path === '/healthz' ? { mock: true, keyed: false } : saved }),
    AbortSignal, Blob, setTimeout: () => 1, clearTimeout() {},
    URL: { createObjectURL(blob) { exported = blob; return 'blob:test'; }, revokeObjectURL() {} }
  });
  vm.runInContext(`${clientScript}\nglobalThis.clientAPI = { state, loadSaved, exportRun };`, context);
  return { ...context.clientAPI, element, exported: async () => JSON.parse(await exported.text()) };
}

function snapshot({ originalName = 'Phoenix', exampleBookingTerms = true } = {}) {
  const currentTerms = { fee: 1500, genre: 'alternative', available: true };
  const item = { id: 'artist-phoenix', name: 'Phoenix (French band)', originalName, terms: currentTerms, fit: .8, evidence: { rank: true }, receipts: [] };
  const constraints = { budget: 2000, slots: 1 };
  const input = { city: 'London', anchors: ['Radiohead'], offers: ['Phoenix'], currency: 'GBP', exampleBookingTerms };
  return {
    id: 'saved-demo', mock: true, receipts: [],
    input: { ...input, terms: { Phoenix: { fee: 1000, genre: 'indie', available: true } } },
    memo: { input: { ...input }, exampleBookingTerms, currency: 'GBP', mode: 'mock', items: [item], constraints, slate: optimizeSlate([item], constraints) }
  };
}

test('saved-run reload and export preserve current quotes for a resolved alias and example provenance', async () => {
  const saved = snapshot();
  const page = client(saved);
  await page.loadSaved(saved.id);
  assert.equal(page.state.offers[0].name, 'Phoenix');
  assert.equal(page.state.offers[0].fee, 1500, 'current scenario terms take precedence over original input terms');
  assert.equal(page.state.offers[0].genre, 'alternative');
  assert.equal(page.state.offers[0].available, true);
  assert.equal(page.state.picks.Phoenix.id, 'artist-phoenix', 'rebuilding keeps the confirmed artist identity');
  assert.equal(page.state.example, true);
  assert.equal(page.element('example-note').hidden, false);
  page.exportRun();
  const exported = await page.exported();
  assert.equal(exported.exampleBookingTerms, true);
  assert.equal(exported.memo.items[0].terms.fee, 1500);
});

test('older saved runs fall back to original input terms when identity metadata is absent', async () => {
  const saved = snapshot({ exampleBookingTerms: false });
  delete saved.memo.items[0].originalName;
  delete saved.memo.exampleBookingTerms;
  delete saved.memo.input.exampleBookingTerms;
  delete saved.input.exampleBookingTerms;
  const page = client(saved);
  await page.loadSaved(saved.id);
  assert.equal(page.state.offers[0].fee, 1000);
  assert.equal(page.state.offers[0].genre, 'indie');
  assert.equal(page.state.offers[0].available, true);
  assert.equal(page.element('example-note').hidden, true);
});
