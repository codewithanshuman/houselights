import { parentPort, workerData } from 'node:worker_threads';
import { runExperiment } from './orchestrator.mjs';
try { parentPort.postMessage({ result: runExperiment(workerData.locked, { humanReport: workerData.humanReport }) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
