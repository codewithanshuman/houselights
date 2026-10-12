import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDossier, answerDossierQuestion } from '../server/dossier.mjs';

const candidate = (id, fee, fit, genre, evidence = {}) => ({
  id, name: id.toUpperCase(), fit, rank: Math.round((1 - fit) * 4) + 1, of: 5, found: id === 'd',
  evidence: { rank: true, local: false, comparison: false, trends: false, ...evidence },
  local: evidence.local ? 'yes' : 'no data', momentum: evidence.trends ? 'cooling' : 'unknown',
  terms: { fee, genre, available: fee != null }, receipts: [`r-${id}`], claims: [{ id: `${id}:rank`, text: `Rank evidence [r-${id}].` }]
});
const items = [candidate('a', 60, .95, 'rock', { local: true, comparison: true, trends: true }), candidate('b', 30, .8, 'jazz'), candidate('c', 25, .7, 'folk'), candidate('d', null, .6, '')];
const snapshot = {
  id: 'source1234', mock: true, input: { city: 'London', currency: 'GBP' },
  receipts: items.map(item => ({ id: item.receipts[0], tool: 'rank', status: 'ok', source: 'synthetic', fetchedAt: '2026-10-12T00:00:00Z', digest: `sha256:${item.id}`, summary: 'fixture' })),
  memo: {
    currency: 'GBP', items, constraints: { budget: 100, slots: 2, maxPerGenre: 2, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] },
    slate: { feasible: true, selectedIds: ['a', 'b'], totalFee: 90, remainingBudget: 10, score: 87, confidence: { level: 'supported' }, objectiveBreakdown: { fit: 87 } }
  }
};

test('dossier produces decision, risk, opportunity, geography and markdown modules', () => {
  const dossier = buildDossier(snapshot);
  assert.equal(dossier.selectedArtists.length, 2);
  assert.equal(dossier.compatibilityMatrix.length, 1);
  assert.ok(dossier.riskRegister.some(item => item.type === 'fee_concentration'));
  assert.ok(dossier.opportunities.some(item => item.type === 'discovery_to_qualify'));
  assert.equal(dossier.marketEvidence.city, 'London');
  assert.match(dossier.markdown, /# Houselights decision dossier/);
  assert.ok(!dossier.markdown.includes('ticket sales forecast'));
});

test('report analyst stays inside supported dossier topics and returns receipt IDs', () => {
  const dossier = buildDossier(snapshot);
  const artist = answerDossierQuestion(dossier, 'What evidence do we have for A?');
  assert.equal(artist.grounding, 'saved_dossier_only');
  assert.ok(artist.receiptIds.includes('r-a'));
  const unknown = answerDossierQuestion(dossier, 'What will ticket sales be?');
  assert.match(unknown.answer, /not answerable/);
});
