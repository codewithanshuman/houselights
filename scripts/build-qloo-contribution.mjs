// Writes public/qloo-contribution.json: the Booking Desk's matched with/without-Qloo
// result for the recorded case, computed once by the same judgeExperiment the public
// experiment route uses. Serving it statically keeps first-screen page views from
// spending the shared per-minute experiment quota. tests/qloo-contribution.test.mjs
// recomputes it and fails if the file drifts.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
export async function computeQlooContribution() {
  const dir = mkdtempSync(join(tmpdir(), 'houselights-qloo-contribution-'));
  process.env.DATA_DIR = dir;
  try {
    const { seedPublicCases } = await import('../server/release-seed.mjs');
    const { judgeExperiment, loadJudgeCase } = await import('../server/judge.mjs');
    const { db } = await import('../server/database.mjs');
    const casesFile = join(repo, 'deploy', 'judge-cases.json');
    const seed = seedPublicCases(casesFile);
    const caseId = JSON.parse(readFileSync(join(repo, 'public', 'autopilot-recorded.json'), 'utf8')).caseId;
    const record = loadJudgeCase(caseId);
    if (!record) throw new Error(`Recorded case ${caseId} is not in the seeded cases.`);
    const side = qlooOff => {
      const result = judgeExperiment(record, { qlooOff }), memo = result.snapshot.memo, ids = memo.slate.selectedIds ?? [];
      if (result.providerCalls !== 0) throw new Error('The experiment made provider calls.');
      return { selectedIds: ids, names: ids.map(id => memo.items.find(item => item.id === id)?.name ?? id), totalFee: memo.slate.totalFee, feasible: memo.slate.feasible === true };
    };
    const withQloo = side(false), withoutQloo = side(true);
    db.close();
    return { version: '1.0', caseId, casesDigest: seed.digest, method: 'judgeExperiment on the seeded public case with saved Qloo evidence on (qlooOff: false) and withdrawn (qlooOff: true); same pool, fees and budget; 0 provider calls.',
      budget: record.snapshot.memo.constraints.budget, currency: record.snapshot.memo.currency ?? null,
      withQloo, withoutQloo, changed: withQloo.selectedIds.join() !== withoutQloo.selectedIds.join() };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/').replace(/^\//, '')}`) {
  const result = await computeQlooContribution();
  writeFileSync(join(repo, 'public', 'qloo-contribution.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ written: 'public/qloo-contribution.json', changed: result.changed, withQloo: result.withQloo.names, withoutQloo: result.withoutQloo.names }));
}
