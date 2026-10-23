import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { lockExperiment, digest, publishedEvidenceAsOf } from '../server/experiments/experiment-schema.mjs';
import { runExperiment } from '../server/experiments/orchestrator.mjs';
import { summarizeExperiments } from '../server/experiments/statistical-analysis.mjs';

const sourceLabel = process.argv[2] ?? 'deploy/judge-cases.json';
const source = resolve(sourceLabel);
const manifest = JSON.parse(readFileSync(source, 'utf8'));
if (manifest.version !== '1.0' || !Array.isArray(manifest.cases) || manifest.cases.length > 20)
  throw new Error('Expected a version 1.0 published-case manifest with at most 20 cases.');
const rows = manifest.cases.map(({ title, snapshot }) => {
  const id = digest({ version: '1.0', title, snapshot }).slice(7, 31);
  const locked = lockExperiment({ ...snapshot, id }, { datasetVersion: 'published-judge-v1', policy: 'original', evidenceAsOf: publishedEvidenceAsOf(snapshot) });
  return { id, title, report: runExperiment(locked) };
});
const summary = summarizeExperiments(rows.map(row => row.report));
const output = { version: 'qloo-proof-suite-v1', source: sourceLabel, manifestDigest: digest(manifest),
  records: rows, summary, limitations: [
    'Published records can repeat event briefs and artist pools; independent coverage is the distinct-brief and distinct-pool count.',
    'No reviewer preference or observed sales outcome is supplied by this case manifest.',
    'Published illustrative booking terms cannot validate commercial impact.',
  ] };
mkdirSync('results', { recursive: true });
writeFileSync('results/qloo-proof.json', JSON.stringify(output, null, 2));
const lines = ['# Qloo decision proof — reproducible published-case suite', '',
  `Source: ${sourceLabel}`, `Manifest digest: ${output.manifestDigest}`, '',
  `Published records: **${summary.coverage.publishedRecords}**; distinct briefs: **${summary.coverage.briefs}**; distinct candidate pools: **${summary.coverage.distinctPools}**; cities: **${summary.coverage.cities}**.`,
  `Twelve-distinct-brief target met: **${summary.coverage.meetsTwelveDistinctBriefTarget ? 'yes' : 'no'}**.`, '',
  '| Case | City | Candidates | Evidence | Saved LLM | Full feasible | Report digest |',
  '| --- | --- | ---: | --- | --- | --- | --- |',
  ...rows.map(row => `| ${row.title.replaceAll('|','/')} | ${row.report.brief.city} | ${row.report.brief.candidateCount} | ${row.report.brief.synthetic ? 'synthetic' : 'saved live'} | ${row.report.methods.llm_only.status} | ${row.report.methods.full_houselights.feasible ? 'yes' : 'no'} | ${row.report.reportDigest} |`),
  '', `Saved LLM control failure rate: ${summary.llmFailureRate.failures}/${summary.llmFailureRate.attempted} available attempts. Repeated attempts on one brief are not independent markets.`,
  'Genuine blinded review judgments: 0 in this manifest. Observed event outcomes: 0 in this manifest.', '',
  'The 16 signal combinations and receipt withdrawals are internal decision diagnostics. They do not measure causal Qloo uplift or audience preference.',
  'The detailed locked inputs, receipts and per-coalition outputs are in `results/qloo-proof.json`.', ''];
writeFileSync('results/qloo-proof.md', lines.join('\n'));
console.log(JSON.stringify({ json: 'results/qloo-proof.json', markdown: 'results/qloo-proof.md', coverage: summary.coverage,
  llmFailureRate: summary.llmFailureRate }, null, 2));
