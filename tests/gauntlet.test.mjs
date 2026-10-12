import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGauntlet } from '../server/gauntlet.mjs';

const item = (id, fee, genre, { found = false, fit = .8 } = {}) => ({
  id, name: id, fit, rank: Math.round((1 - fit) * 10), found,
  evidence: { rank: true }, terms: { fee, genre, available: true }, receipts: []
});
const items = [item('alpha', 30, 'electronic'), item('beta', 25, 'jazz'), item('gamma', 20, 'indie'), item('delta', 15, 'folk', { found: true, fit: .7 })];
const source = { budget: 100, slots: 3, discoveryMin: 0, maxPerGenre: 3, riskTolerance: 50, lockedIds: [], excludedIds: [] };

test('gauntlet awards only server-derived missions and exposes the next useful move', () => {
  const result = evaluateGauntlet(items, { ...source, budget: 90, lockedIds: ['alpha'], discoveryMin: 1 }, source);
  assert.equal(result.verified, true);
  assert.equal(result.slate.feasible, true);
  assert.equal(result.missions.find(row => row.id === 'pressure').achieved, true);
  assert.equal(result.missions.find(row => row.id === 'discovery').achieved, true);
  assert.equal(result.missions.find(row => row.id === 'diversity').achieved, true);
  assert.equal(result.missions.find(row => row.id === 'conviction').achieved, true);
  assert.equal(result.missions.find(row => row.id === 'evidence').achieved, true);
  assert.ok(result.xp >= 600);
  assert.equal(result.progressPercent, Math.round(result.xp / result.totalXp * 100));
});

test('infeasible slates cannot earn feasibility-dependent missions', () => {
  const result = evaluateGauntlet(items, { ...source, budget: 10, lockedIds: ['alpha'] }, source);
  assert.equal(result.slate.feasible, false);
  for (const id of ['pressure', 'discovery', 'diversity', 'shock', 'evidence', 'conviction']) {
    assert.equal(result.missions.find(row => row.id === id).achieved, false);
  }
  assert.equal(result.xp, 0);
});

test('quote shock is evaluated against the exact current slate', () => {
  const tight = evaluateGauntlet(items, { ...source, budget: 75 }, source);
  assert.equal(tight.missions.find(row => row.id === 'shock').achieved, false);
  const roomy = evaluateGauntlet(items, { ...source, budget: 100 }, source);
  assert.equal(roomy.missions.find(row => row.id === 'shock').achieved, true);
});
