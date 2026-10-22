import { parentPort, workerData } from 'node:worker_threads';
import { evaluateFinancial } from './optimizer.mjs';
import { stressTests } from './stress-tests.mjs';
import { explainFinancial } from './explanations.mjs';

try {
  const { config, prefiltered } = workerData;
  const result = evaluateFinancial(config, prefiltered);
  if (result.status === 'scenario_complete') {
    const keys = new Set(result.assumptionResults[0].rows.map(row => JSON.stringify(row.selectedIds)));
    const finalists = prefiltered.lineups.filter(row => keys.has(JSON.stringify(row.selectedIds)));
    result.stressTestsBySet = Object.fromEntries(config.assumptionSets.map(set => [set.id, stressTests(config, finalists, result, set.id)]));
    result.explanationsBySet = Object.fromEntries(config.assumptionSets.map(set => [set.id, explainFinancial(result, result.stressTestsBySet[set.id], set.id)]));
    result.stressTests = result.stressTestsBySet[config.assumptionSets[0].id];
    result.explanations = result.explanationsBySet[config.assumptionSets[0].id];
  }
  parentPort.postMessage({ result });
} catch (error) { parentPort.postMessage({ error: error.message }); }
