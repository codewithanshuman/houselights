import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { lockExperiment, digest, publishedEvidenceAsOf } from '../server/experiments/experiment-schema.mjs';
import { runExperiment } from '../server/experiments/orchestrator.mjs';
import { summarizeExperiments } from '../server/experiments/statistical-analysis.mjs';
import { rankComparability, withAffinityFit, tieSensitivity } from '../server/affinity.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';

const sourceLabel = process.argv[2] ?? 'deploy/judge-cases.json';
const source = resolve(sourceLabel);
const manifest = JSON.parse(readFileSync(source, 'utf8'));
if (manifest.version !== '1.0' || !Array.isArray(manifest.cases) || manifest.cases.length > 20)
  throw new Error('Expected a version 1.0 published-case manifest with at most 20 cases.');
const rows = manifest.cases.map(({ title, snapshot }) => {
  const id = digest({ version: '1.0', title, snapshot }).slice(7, 31);
  const locked = lockExperiment({ ...snapshot, id }, { datasetVersion: 'published-judge-v1', policy: 'original', evidenceAsOf: publishedEvidenceAsOf(snapshot) });
  // Disclosure only: the locked report keeps its original ordinal fit. These
  // fields show comparability and what Qloo's own scores say about near-ties.
  const comparability = rankComparability(snapshot.memo.items);
  const affinity = withAffinityFit(snapshot.memo.items, snapshot.receipts);
  const ties = affinity.basis === 'qloo-affinity' ? tieSensitivity(affinity.items, snapshot.memo.constraints) : null;
  const ordinal = optimizeSlate(snapshot.memo.items, snapshot.memo.constraints), scored = affinity.basis === 'qloo-affinity' ? optimizeSlate(affinity.items, snapshot.memo.constraints) : null;
  const name = id => snapshot.memo.items.find(item => item.id === id)?.name ?? id;
  const disclosure = { rankComparable: comparability.comparable, reason: comparability.reason, fitBasis: affinity.basis,
    nearTies: (ties?.groups ?? []).map(group => ({ names: group.names, spread: Math.round(group.spread * 1e4) / 1e4, changesAffinityBill: group.changesBill })),
    affinityBillDiffers: scored ? [...scored.selectedIds].sort().join() !== [...ordinal.selectedIds].sort().join() : null,
    ordinalBill: ordinal.selectedIds.map(name), affinityBill: scored?.selectedIds.map(name) ?? null };
  return { id, title, report: runExperiment(locked), disclosure };
});
// Comparative statistics use only briefs with a comparable Qloo ranking.
const comparableRows = rows.filter(row => row.disclosure.rankComparable);
const summary = { ...summarizeExperiments(comparableRows.map(row => row.report)), coverage: summarizeExperiments(rows.map(row => row.report)).coverage,
  comparison: { comparableBriefs: comparableRows.length, excluded: rows.filter(row => !row.disclosure.rankComparable).map(row => ({ title: row.title, reason: row.disclosure.reason })) } };
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
  '| Case | City | Candidates | Evidence | Qloo rank comparable | Saved LLM | Full feasible | Near-ties in Qloo affinity (band 0.002) | Bill under affinity scores | Report digest |',
  '| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(row => `| ${row.title.replaceAll('|','/')} | ${row.report.brief.city} | ${row.report.brief.candidateCount} | ${row.report.brief.synthetic ? 'synthetic' : 'saved live'} | ${row.disclosure.rankComparable ? 'yes' : '**no**'} | ${row.report.methods.llm_only.status} | ${row.report.methods.full_houselights.feasible ? 'yes' : 'no'} | ${row.disclosure.nearTies.map(tie => `${tie.names.join(' / ')} (${tie.spread})`).join('; ') || '—'} | ${row.disclosure.affinityBillDiffers == null ? 'n/a (scores incomplete)' : row.disclosure.affinityBillDiffers ? `**differs:** ${row.disclosure.affinityBill.join(' + ')}` : 'same'} | ${row.report.reportDigest} |`),
  '', `Comparisons below use the ${summary.comparison.comparableBriefs} briefs with a comparable Qloo ranking. Excluded: ${summary.comparison.excluded.map(row => row.title).join('; ') || 'none'}. In these, Qloo did not rank every candidate, so no comparable fit exists.`,
  `Locked reports use the original ordinal-rank fit. The affinity columns are a disclosure computed from the saved Qloo scores; they do not alter the locked results.`,
  '', `Saved LLM control failure rate (comparable briefs): ${summary.llmFailureRate.failures}/${summary.llmFailureRate.attempted} available attempts. Repeated attempts on one brief are not independent markets.`,
  'Genuine blinded review judgments: 0 in this manifest. Observed event outcomes: 0 in this manifest.', '',
  'The 16 signal combinations and receipt withdrawals are internal decision diagnostics. They do not measure causal Qloo uplift or audience preference.',
  'The detailed locked inputs, receipts and per-coalition outputs are in `results/qloo-proof.json`.', ''];
writeFileSync('results/qloo-proof.md', lines.join('\n'));
console.log(JSON.stringify({ json: 'results/qloo-proof.json', markdown: 'results/qloo-proof.md', coverage: summary.coverage,
  llmFailureRate: summary.llmFailureRate }, null, 2));
