// Captures one provider-backed Autopilot run on the published New York brief.
// Requires a configured Qloo key; refuses synthetic mode. Writes only the public
// receipt projection: no credentials, raw provider payloads or private sources.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = resolve(import.meta.dirname, '..');
const caseId = process.argv[2] ?? '8be4d03ef4792ca9f1466983';
const output = resolve(process.argv[3] ?? join(repo, 'public', 'autopilot-recorded.json'));
if (process.env.QLOO_MODE === 'mock' || !process.env.QLOO_API_KEY) { console.error('A live Qloo key is required; synthetic captures are never published as recorded runs.'); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'houselights-autopilot-capture-'));
process.env.DATA_DIR = dir;
try {
  const { seedPublicCases } = await import('../server/release-seed.mjs');
  const { loadJudgeCase } = await import('../server/judge.mjs');
  const { Run, closeQloo } = await import('../server/qloo.mjs');
  const { runAutopilot } = await import('../server/autopilot.mjs');
  const { publicAutopilotRun, judgeAutopilotSource } = await import('../server/autopilot-api.mjs');
  const { db } = await import('../server/database.mjs');
  seedPublicCases(join(repo, 'deploy', 'judge-cases.json'));
  const record = loadJudgeCase(caseId);
  if (!record) throw new Error('The published case was not found in the seed.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
  // An isolated cache guarantees fresh provider calls rather than earlier cached results.
  const run = new Run({ budget: 10, receiptPrefix: 'a', cacheStore: new Map(), deadlineMs: 180000 });
  if (run.mode !== 'live') throw new Error('Run is not live.');
  const startedAt = Date.now();
  const result = await runAutopilot(judgeAutopilotSource(record), { maxCalls: 10 }, { research: { call: (...args) => run.call(...args), used: () => run.used }, mode: 'live',
    emit: event => console.error(`[+${(event.at / 1000).toFixed(1)}s] ${event.type}: ${String(event.text ?? '').slice(0, 160)}`) });
  await closeQloo();
  if (result.receipts.some(receipt => receipt.source !== 'qloo')) throw new Error('A non-Qloo receipt was produced; refusing to publish.');
  const file = { version: '1.0', kind: 'recorded-provider-backed-autopilot-run', caseId: record.id, caseTitle: record.title,
    capturedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(), clockStart: startedAt,
    environment: { node: process.version, commit, dirtyWorkingTree: dirty, qlooHost: new URL(process.env.QLOO_BASE_URL ?? 'https://hackathon.api.qloo.com').host,
      harness: JSON.parse(readFileSync(join(repo, 'node_modules', '@qloo', 'qloo-harness', 'package.json'), 'utf8')).version, llm: 'none (deterministic research policy)' },
    providerCalls: run.used, run: publicAutopilotRun(result),
    disclosure: 'Captured once through the Autopilot research policy with live Qloo calls. The page replays this record; it makes no new provider calls. Receipt digests are application hashes, not provider signatures. Fees and availability are illustrative.' };
  writeFileSync(output, JSON.stringify(file, null, 2) + '\n');
  db.close();
  console.log(JSON.stringify({ output, providerCalls: run.used, receipts: result.receipts.length, statuses: result.receipts.map(row => `${row.id}:${row.tool}:${row.status}`),
    decisionChanged: result.packet.research.decisionChanged, stop: result.stop, digest: result.digest, fileSha256: createHash('sha256').update(readFileSync(output)).digest('hex') }, null, 2));
} finally { rmSync(dir, { recursive: true, force: true }); }
