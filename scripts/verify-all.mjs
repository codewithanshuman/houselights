// Reproduces every claim in docs/claims-audit.md offline (no provider calls, no keys) and
// prints a pass/fail table. A step passes when its command succeeds and the files it
// regenerates are byte-identical to the committed copies.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const hash = file => existsSync(join(repo, file)) ? createHash('sha256').update(readFileSync(join(repo, file))).digest('hex') : null;
const steps = [
  ['Shock study: 3/231 violations on comparable solvable shocks', ['scripts/reproduce-shocks.mjs'], ['results/shocks.json', 'results/shocks.md']],
  ['Evidence withdrawal changes 7 of 9 comparable briefs', ['scripts/evaluate-autopilot.mjs'], ['results/autopilot-evaluation.json', 'results/autopilot-evaluation.md']],
  ['Optimizer vs Qloo top-k (11.7% where bookable; 58% unbookable)', ['scripts/evaluate-rank-vs-optimum.mjs'], ['results/rank-vs-optimum.json', 'results/rank-vs-optimum.md']],
  ['Fee-noise and near-tie band sensitivity', ['scripts/evaluate-sensitivity.mjs'], ['results/sensitivity.json', 'results/sensitivity.md']],
  ['Qloo proof report', ['scripts/reproduce-qloo-proof.mjs'], ['results/qloo-proof.json', 'results/qloo-proof.md']],
  ['Judge stress audit', ['scripts/audit-judge-evaluation.mjs'], ['results/judge-evaluation-audit.json']],
  ['Every pinned Autopilot recording replays exactly', ['scripts/reproduce-autopilot.mjs'], []],
  ['Booking Desk first screen and receipts match the record', ['scripts/build-judge-static.mjs'], ['public/judge-static.json', 'public/desk.html']],
  ['With/without-Qloo comparison file', ['scripts/build-qloo-contribution.mjs'], ['public/qloo-contribution.json']],
  ['README, Devpost and audit numbers match the results', ['scripts/claims.mjs', '--check'], []],
];
const rows = [];
for (const [claim, args, outputs] of steps) {
  const before = outputs.map(hash), started = Date.now();
  const run = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', env: { ...process.env, QLOO_MODE: 'mock', LLM_MODE: 'off' } });
  const changed = outputs.filter((file, i) => hash(file) !== before[i]);
  const ok = run.status === 0 && changed.length === 0;
  rows.push({ claim, ok, seconds: ((Date.now() - started) / 1000).toFixed(1), note: run.status !== 0 ? `exit ${run.status}: ${(run.stderr || run.stdout).trim().split('\n').pop()?.slice(0, 120)}` : changed.length ? `changed: ${changed.join(', ')}` : 'reproduced exactly' });
}
const width = Math.max(...rows.map(row => row.claim.length));
console.log(`${'Claim'.padEnd(width)}  Result  Time   Detail`);
for (const row of rows) console.log(`${row.claim.padEnd(width)}  ${row.ok ? 'PASS  ' : 'FAIL  '}  ${row.seconds.padStart(5)}s  ${row.note}`);
const failed = rows.filter(row => !row.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} claims reproduced.${failed ? ' Regenerated files differ: inspect with git diff.' : ''}`);
process.exit(failed ? 1 : 0);
