// Offline replay of the recorded Autopilot run. Each research call is answered
// from the recorded receipt for the identical tool and arguments; any deviation
// in the agent's chosen action, decision or packet fails the check.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const path = resolve(process.argv[2] ?? join(repo, 'public', 'autopilot-recorded.json'));
const dir = mkdtempSync(join(tmpdir(), 'houselights-autopilot-replay-'));
process.env.DATA_DIR = dir;
process.env.QLOO_MODE = 'mock';
let database;
try {
  const { replayRecordedAutopilot } = await import('../server/autopilot-replay.mjs');
  const { seedPublicCases } = await import('../server/release-seed.mjs');
  database = (await import('../server/database.mjs')).db;
  seedPublicCases(join(repo, 'deploy', 'judge-cases.json'));
  const report = await replayRecordedAutopilot(JSON.parse(readFileSync(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { database?.close(); rmSync(dir, { recursive: true, force: true }); }
