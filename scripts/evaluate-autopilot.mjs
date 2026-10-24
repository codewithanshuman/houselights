// Reproducible Autopilot evaluation. Makes no provider calls.
// Part A uses saved Qloo evidence; Part B uses SYNTHETIC research outcomes to
// compare research-selection policies with identical tools; Part C injects
// provider failures; Part D replays the recorded provider-backed run.
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'houselights-autopilot-eval-'));
process.env.DATA_DIR = dir;
process.env.QLOO_MODE = 'mock';
const realFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('The Autopilot evaluation must not call any network provider.'); };
let database;
try {
  const { seedPublicCases } = await import('../server/release-seed.mjs');
  const { listJudgeCases } = await import('../server/judge.mjs');
  const { Run } = await import('../server/qloo.mjs');
  const { runAutopilot } = await import('../server/autopilot.mjs');
  const { judgeAutopilotSource } = await import('../server/autopilot-api.mjs');
  const { replayRecordedAutopilot } = await import('../server/autopilot-replay.mjs');
  const { evaluateSelection } = await import('../server/optimizer.mjs');
  database = (await import('../server/database.mjs')).db;
  seedPublicCases(join(repo, 'deploy', 'judge-cases.json'));
  const cases = listJudgeCases();
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  const synthetic = (budget) => { const run = new Run({ budget, mode: 'mock', receiptPrefix: 'a', cacheStore: new Map() }); return { run, research: { call: (...args) => run.call(...args), used: () => run.used } }; };

  // Part A — saved evidence, planning mode.
  const partA = [];
  for (const record of cases) {
    const source = judgeAutopilotSource(record), result = await runAutopilot(source, {});
    const check = ids => evaluateSelection(result.items, result.constraints, ids).feasible;
    const fallbacks = [...result.stress.cancellations ?? [], ...(result.stress.budgetCuts ?? []).map(row => ({ ...row, constraints: { ...result.constraints, budget: row.budget } }))].filter(row => row.feasible);
    const violations = [...result.strategies.list.filter(row => !check(row.selectedIds)).map(row => `strategy ${row.id}`),
      ...fallbacks.filter(row => !evaluateSelection(result.items, row.constraints ?? { ...result.constraints, lockedIds: row.selectedIds.filter(id => id !== row.canceledId).filter(id => !(row.replacementIds ?? []).includes(id)), excludedIds: [...result.constraints.excludedIds, row.canceledId].filter(Boolean) }, row.selectedIds).feasible).map(() => 'fallback')];
    const tiers = Object.fromEntries(['material', 'ranking', 'robustness', 'justification', 'fallback', 'immaterial', 'blocked', 'done'].map(tier => [tier, result.questions.filter(row => row.tier === tier).length]));
    partA.push({ caseId: record.id, title: record.title, savedEvidence: record.snapshot.mock ? 'synthetic' : 'qloo', feasible: result.strategies.status === 'feasible',
      strategies: result.strategies.list.map(row => row.id), questionTiers: tiers, evidenceWithdrawalChangesDecision: result.stress.evidence?.allWithdrawn?.changed ?? null,
      constraintViolations: violations.length, checkedSelections: result.strategies.list.length + fallbacks.length, providerCalls: 0 });
  }

  // Part B — policy comparison with synthetic research outcomes.
  const budgets = [2, 4, 6], seeds = [1, 2, 3, 4, 5], partB = [];
  for (const record of cases) {
    const source = judgeAutopilotSource(record);
    const full = synthetic(64);
    const reference = await runAutopilot(source, {}, { ...full, mode: 'synthetic', policy: 'fixed-order', limits: { maxCalls: 64, maxRounds: 64 } });
    const fullIds = reference.packet.recommendation?.selectedIds ?? [];
    const row = { caseId: record.id, title: record.title, fullInformation: { selectedIds: fullIds, calls: full.run.used }, budgets: {} };
    for (const budget of budgets) {
      const measure = async (policy, seed) => {
        const { run, research } = synthetic(budget);
        const result = await runAutopilot(source, { maxCalls: budget, maxRounds: 16 }, { research, mode: 'synthetic', policy, seed });
        const final = result.packet.recommendation?.selectedIds ?? [];
        const immaterialCalls = result.events.filter(event => event.type === 'action' && event.tier === 'immaterial').length;
        const unjustified = final.flatMap(id => ['local', 'comparison'].filter(kind => { const item = result.items.find(entry => entry.id === id); return !item.evidence[kind] && !result.observations.some(obs => obs.results.some(res => res.questionId === `${kind}:${id}`)); })).length;
        return { agrees: same(final, fullIds), calls: run.used, immaterialCalls, unresearchedBookedGaps: unjustified };
      };
      const value = await measure('value'), fixed = await measure('fixed-order');
      const random = await Promise.all(seeds.map(seed => measure('random', seed)));
      const mean = key => random.reduce((sum, entry) => sum + entry[key], 0) / random.length;
      row.budgets[budget] = { value, fixedOrder: fixed, random: { agreesRate: mean('agrees'), calls: mean('calls'), immaterialCalls: mean('immaterialCalls'), unresearchedBookedGaps: mean('unresearchedBookedGaps') } };
    }
    partB.push(row);
  }
  const aggregate = budget => {
    const rows = partB.map(row => row.budgets[budget]);
    const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);
    return { budget, cases: rows.length,
      value: { decisionAgreement: sum(row => +row.value.agrees), calls: sum(row => row.value.calls), immaterialCalls: sum(row => row.value.immaterialCalls), unresearchedBookedGaps: sum(row => row.value.unresearchedBookedGaps) },
      fixedOrder: { decisionAgreement: sum(row => +row.fixedOrder.agrees), calls: sum(row => row.fixedOrder.calls), immaterialCalls: sum(row => row.fixedOrder.immaterialCalls), unresearchedBookedGaps: sum(row => row.fixedOrder.unresearchedBookedGaps) },
      random: { decisionAgreement: +sum(row => row.random.agreesRate).toFixed(2), calls: +sum(row => row.random.calls).toFixed(2), immaterialCalls: +sum(row => row.random.immaterialCalls).toFixed(2), unresearchedBookedGaps: +sum(row => row.random.unresearchedBookedGaps).toFixed(2) } };
  };

  // Part C — provider failures and missing data.
  const partC = [];
  for (const record of cases) {
    const source = judgeAutopilotSource(record);
    const planning = await runAutopilot(source, {});
    const run = new Run({ budget: 10, mode: 'live', receiptPrefix: 'a', cacheStore: new Map(), execute: async () => { throw new Error('injected transport failure'); } });
    const failed = await runAutopilot(source, { maxCalls: 10 }, { research: { call: (...args) => run.call(...args), used: () => run.used }, mode: 'live' });
    partC.push({ caseId: record.id, title: record.title, stop: failed.stop, calls: run.used, receiptsWithError: failed.receipts.filter(row => row.status === 'error').length,
      evidenceUnchanged: JSON.stringify(failed.items.map(item => item.evidence)) === JSON.stringify(planning.items.map(item => item.evidence)),
      recommendationUnchanged: same(failed.packet.recommendation?.selectedIds ?? [], planning.packet.recommendation?.selectedIds ?? []), openGapsReported: failed.packet.evidenceGaps.length });
  }

  // Part D — the recorded provider-backed run.
  globalThis.fetch = realFetch;
  const recordedPath = join(repo, 'public', 'autopilot-recorded.json');
  const recorded = JSON.parse(readFileSync(recordedPath, 'utf8'));
  const replay = await replayRecordedAutopilot(recorded);
  const partD = { caseId: recorded.caseId, capturedAt: recorded.capturedAt, providerCalls: recorded.providerCalls, statuses: recorded.run.receipts.map(row => `${row.id}:${row.tool}:${row.status}${row.cached ? ':cached' : ''}`),
    actions: recorded.run.events.filter(event => event.type === 'action').map(event => ({ tier: event.tier, tool: event.tool, question: event.text })),
    decisionChanged: recorded.run.packet.research.decisionChanged, verdict: recorded.run.packet.research.verdict, crossCheck: recorded.run.crossCheck, replay };

  const report = { version: '1.0', generatedBy: 'npm run evaluate:autopilot', providerCalls: 0, cases: cases.length,
    notes: ['Part B research outcomes are SYNTHETIC development fixtures. They test the research-selection policy with identical tools and integration, not real audience truth.',
      'Decision agreement is measured against a full-information reference that researches every gap with the same synthetic fixtures.',
      '"Immaterial calls" use the Autopilot materiality test; the value policy excludes them by construction, so that metric is descriptive only. Decision agreement and unresearched booked gaps do not depend on it.',
      'No metric here is ticket demand, attendance, revenue or a human judgment.'],
    partA, partB: { budgets: budgets.map(aggregate), perCase: partB }, partC, partD };
  writeFileSync(join(repo, 'results', 'autopilot-evaluation.json'), JSON.stringify(report, null, 2) + '\n');
  const table = budgets.map(aggregate).map(row => `| ${row.budget} | ${row.value.decisionAgreement}/${row.cases} | ${row.fixedOrder.decisionAgreement}/${row.cases} | ${row.random.decisionAgreement}/${row.cases} | ${row.value.unresearchedBookedGaps} | ${row.fixedOrder.unresearchedBookedGaps} | ${row.random.unresearchedBookedGaps} | ${row.value.calls} | ${row.fixedOrder.calls} | ${row.random.calls} |`).join('\n');
  const md = `# Autopilot evaluation

Generated by \`npm run evaluate:autopilot\`. No provider calls. ${cases.length} published briefs.

## A. Saved Qloo evidence (planning mode)

| Brief | Feasible | Strategies | Decision-material gaps | Evidence withdrawal changes decision | Constraint violations / selections checked |
|---|---|---|---|---|---|
${partA.map(row => `| ${row.title} | ${row.feasible ? 'yes' : 'no'} | ${row.strategies.join(', ') || '—'} | ${row.questionTiers.material} | ${row.evidenceWithdrawalChangesDecision == null ? 'n/a' : row.evidenceWithdrawalChangesDecision ? 'yes' : 'no'} | ${row.constraintViolations} / ${row.checkedSelections} |`).join('\n')}

Saved Qloo evidence changes the optimized decision when withdrawn in ${partA.filter(row => row.evidenceWithdrawalChangesDecision).length} of ${partA.filter(row => row.feasible).length} feasible briefs. ${partA.reduce((sum, row) => sum + row.constraintViolations, 0)} hard-constraint violations across ${partA.reduce((sum, row) => sum + row.checkedSelections, 0)} recommended, alternative and fallback selections.

## B. Research-selection policy (SYNTHETIC outcomes)

Same tools, same evidence integration, same budget. Agreement = final bill equals the full-information bill.

| Calls | Agreement: Autopilot | Fixed order | Random (mean of 5) | Unresearched booked gaps: Autopilot | Fixed | Random | Calls used: Autopilot | Fixed | Random |
|---|---|---|---|---|---|---|---|---|---|
${table}

${report.notes.map(note => `- ${note}`).join('\n')}

## C. Provider failure injection

Every research call failed by injection. Decision-phase stop reasons: ${Object.entries(partC.reduce((counts, row) => ({ ...counts, [row.stop.decision]: (counts[row.stop.decision] ?? 0) + 1 }), {})).map(([reason, count]) => `${reason} ${count}`).join(', ')}. ${partC.filter(row => row.calls > 0 && row.stop.decision === 'sufficient').length} briefs claimed sufficiency after a failed call; ${partC.filter(row => row.evidenceUnchanged).length}/${partC.length} kept evidence unchanged; ${partC.filter(row => row.recommendationUnchanged).length}/${partC.length} kept the saved-evidence recommendation; maximum calls spent before stopping: ${Math.max(...partC.map(row => row.calls))}.

## D. Recorded provider-backed run (${recorded.caseTitle})

Captured ${recorded.capturedAt}; ${recorded.providerCalls} Qloo workflow calls (${partD.statuses.join(', ')}).

${partD.actions.map((row, index) => `${index + 1}. [${row.tier}] ${row.question} → ${row.tool}`).join('\n')}

${partD.verdict}

Offline replay: ${replay.passed ? 'passed' : 'FAILED'} (${replay.checks?.map(row => `${row.name}: ${row.passed ? 'yes' : 'no'}`).join('; ') ?? replay.reason}).
`;
  writeFileSync(join(repo, 'results', 'autopilot-evaluation.md'), md);
  console.log(md);
} finally { database?.close(); rmSync(dir, { recursive: true, force: true }); }
