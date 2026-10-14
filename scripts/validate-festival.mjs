// A small, explicitly illustrative booking brief for live end-to-end validation.
// Requires a running live Houselights server. Does not contact or book artists.
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.HOUSELIGHTS_URL ?? 'http://127.0.0.1:8080';
const headers = { 'content-type': 'application/json', ...(process.env.ORGANIZER_TOKEN ? { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}` } : {}) };
const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
const health = await (await fetch(base + '/healthz')).json();
if (health.mock || !health.keyed) throw new Error('Start a live server with Qloo configured; no synthetic substitute is accepted.');
console.log('Building an illustrative live-evidence booking brief…');
const response = await post('/api/memo', {
  city: 'London', anchors: 'Radiohead, Beach House', offers: 'The xx, Wolf Alice, Caribou', currency: 'GBP', exampleBookingTerms: true,
  terms: { 'The xx': { fee: 8000, genre: 'indie', available: true }, 'Wolf Alice': { fee: 6000, genre: 'rock', available: true }, Caribou: { fee: 4000, genre: 'electronic', available: true } },
  constraints: { budget: 14000, slots: 2, maxPerGenre: 1, discoveryMin: 0, riskTolerance: 40 }
});
if (!response.ok) throw new Error(`Memo HTTP ${response.status}`);
const events = (await response.text()).split(/\r?\n\r?\n/).filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
const id = events.find(event => event.type === 'saved')?.id;
if (!id) throw new Error('Memo needs identity clarification or failed; inspect the live browser workflow.');
console.log(`Saved live memo ${id}; researching the fixed pool in London…`);
const researchResponse = await post(`/api/gm/${id}/run`, { markets: ['London'], city: 'London', includeExperience: false });
const research = await researchResponse.json();
if (!researchResponse.ok) throw new Error(research.error);
const snapshot = research.snapshot;
const selected = snapshot.memo.slate.selectedIds;
const canceledId = selected[0];
console.log(`Saved GM ${research.id}; checking cancellation recovery…`);
const recoveryResponse = await post(`/api/gm/${research.id}/cancel`, { artistId: canceledId });
const recovery = await recoveryResponse.json();
const survivors = selected.filter(id => id !== canceledId);
const final = recovery.snapshot?.memo.slate;
const report = { at: new Date().toISOString(), exampleBookingTerms: true,
  memoId: id, researchId: research.id, recoveryId: recovery.id ?? null,
  liveOnly: snapshot.mock === false && snapshot.receipts.every(receipt => receipt.source === 'qloo'),
  gmState: snapshot.gm.state, fullPoolRank: snapshot.festivalResearch.markets[0].audience.complete,
  marketDnaComplete: snapshot.festivalResearch.markets.every(market => market.domains.length === 5 && market.unavailable.length === 0),
  selectedPairsInterpretable: snapshot.memo.slate.festival.supportedPairs === snapshot.memo.slate.festival.pairCount,
  contractErrors: snapshot.receipts.filter(receipt => receipt.evidence?.error === 'TOOL_INPUT').map(receipt => receipt.id),
  pairEvidence: snapshot.memo.slate.festival,
  receiptsByStatus: snapshot.receipts.reduce((counts, receipt) => ({ ...counts, [receipt.status]: (counts[receipt.status] ?? 0) + 1 }), {}),
  recovery: { status: recoveryResponse.status, feasible: final?.feasible ?? false,
    survivorsRetained: survivors.every(id => final?.selectedIds.includes(id)),
    canceledExcluded: final ? !final.selectedIds.includes(canceledId) : null,
    totalFee: final?.totalFee ?? null, budget: final?.constraints.budget ?? null,
    diagnostics: recovery.reason ?? recovery.slate?.reasons ?? null },
  limitation: 'Real provider evidence with illustrative fees and availability; no actual booking, promoter evaluation or ticket-demand validation.' };
report.passed = report.liveOnly && report.fullPoolRank && report.marketDnaComplete && report.selectedPairsInterpretable && !report.contractErrors.length && report.recovery.feasible && report.recovery.survivorsRetained && report.recovery.canceledExcluded;
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/live-festival.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
