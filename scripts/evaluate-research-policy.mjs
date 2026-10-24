// Research-selection evaluation under the protocol in
// evals/autopilot-policy-protocol.json. No provider calls: every research
// answer comes from a seeded synthetic ground truth.
//   node scripts/evaluate-research-policy.mjs [--dev] [--limit N]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAutopilot } from '../server/autopilot.mjs';
import { evaluateSelection, optimizeSlate } from '../server/optimizer.mjs';
import { jointMateriality } from '../server/autopilot-research.mjs';

const repo = resolve(import.meta.dirname, '..');
const protocol = JSON.parse(readFileSync(join(repo, 'evals', 'autopilot-policy-protocol.json'), 'utf8'));
const args = process.argv.slice(2), dev = args.includes('--dev'), close = args.includes('--close');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const seeds = dev ? protocol.developmentSeeds : protocol.heldOutSeeds;
globalThis.fetch = () => { throw new Error('The policy evaluation must not call any network provider.'); };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KINDS = ['local', 'comparison', 'trends'];
const same = (a, b) => [...a].sort().join() === [...b].sort().join();

export function scenario(seed) {
  const r = rng(seed), pick = list => list[Math.floor(r() * list.length)];
  const n = 5 + Math.floor(r() * 4), slots = n >= 6 && r() < .4 ? 3 : 2;
  const ids = Array.from({ length: n }, (_, index) => `c${index}`);
  const order = [...ids].sort(() => r() - .5);
  const fitOf = id => n > 1 ? 1 - order.indexOf(id) / (n - 1) : .5;
  const genres = ['soul', 'jazz', 'indie', 'electronic'];
  const truth = { order, local: {}, comparison: {}, trends: {}, rankCallComplete: r() < .85 };
  const rankIncomplete = r() < .15;
  const items = ids.map((id, index) => {
    const found = r() < .2, available = !found && r() < .85;
    truth.local[id] = r() < .55; truth.comparison[id] = r() < .75;
    const t = r(); truth.trends[id] = t < .25 ? 'rising' : t < .5 ? 'cooling' : t < .6 ? 'flat' : null;
    const item = { id, name: `Artist ${index}`, found, terms: { fee: found ? null : 500 * (4 + Math.floor(r() * 16)), available, genre: pick(genres) },
      fit: rankIncomplete ? null : fitOf(id), rank: rankIncomplete ? null : order.indexOf(id) + 1, of: n, local: 'no data', momentum: 'unknown',
      evidence: { rank: !rankIncomplete, local: false, comparison: false, trends: false }, evidenceReceipts: { rank: rankIncomplete ? [] : ['s1'], local: [], comparison: [], trends: [] }, receipts: [] };
    // 35% of positive evidence is already known from earlier research.
    if (truth.local[id] && r() < .35) { item.evidence.local = true; item.local = 'yes'; item.evidenceReceipts.local = ['s1']; }
    if (truth.comparison[id] && r() < .35) { item.evidence.comparison = true; item.evidenceReceipts.comparison = ['s1']; }
    if (truth.trends[id] && r() < .35) { item.evidence.trends = true; item.momentum = truth.trends[id]; item.evidenceReceipts.trends = ['s1']; }
    return item;
  });
  const totals = [];
  const bookable = items.filter(item => item.terms.available);
  const walk = (start, chosen) => { if (chosen.length === slots) { totals.push(chosen.reduce((sum, item) => sum + item.terms.fee, 0)); return; } for (let i = start; i < bookable.length; i++) walk(i + 1, [...chosen, bookable[i]]); };
  walk(0, []);
  totals.sort((a, b) => a - b);
  const budget = totals.length ? totals[Math.min(totals.length - 1, Math.floor(totals.length * (.5 + r() * .45)))] : 10000;
  const constraints = { budget, slots, maxPerGenre: r() < .3 ? Math.max(1, slots - 1) : slots, discoveryMin: 0, riskTolerance: pick([0, 25, 50, 75]), lockedIds: [], excludedIds: [] };
  return { source: { receipts: [{ id: 's1', tool: 'rank', status: 'ok', source: 'synthetic' }], memo: { currency: 'USD', exampleBookingTerms: true, input: { city: 'Synthetic City', anchors: ['Anchor'], anchorIds: ['anchor-1'] }, items, constraints } }, truth };
}

export function truthClient(truth, items) {
  let used = 0;
  return { used: () => used, call: async (tool, callArgs) => {
    used++;
    const id = `t${used}`, evidence = { kind: tool, rows: [] };
    if (tool === 'where_popular') evidence.rows = truth.local[callArgs.entity] ? [{ name: 'tile' }] : [];
    else if (tool === 'compare_audiences') { evidence.comparisonAvailable = truth.comparison[callArgs.group_b[0]] === true; evidence.interpretable = false; evidence.sharedNames = []; }
    else if (tool === 'trends') evidence.rows = callArgs.entities.map(entity => truth.trends[entity] ? { id: entity, change: truth.trends[entity] === 'rising' ? 1 : truth.trends[entity] === 'cooling' ? -1 : 0 } : { id: entity });
    else if (tool === 'rank') {
      const order = callArgs.signal_location ? truth.order : truth.order.map((entry, index, list) => index % 2 === 0 && list[index + 1] ? list[index + 1] : index % 2 === 1 ? list[index - 1] : entry);
      evidence.rows = (callArgs.signal_location && !truth.rankCallComplete ? order.slice(0, -1) : order).map(entry => ({ id: entry }));
    }
    return { receipt: { id, tool, args: callArgs, status: 'ok', source: 'synthetic', cached: false, attempts: 1, evidence } };
  } };
}

export function fullInformation(source, truth) {
  const n = source.memo.items.length;
  const items = source.memo.items.map(item => ({ ...item, fit: 1 - truth.order.indexOf(item.id) / (n - 1), rank: truth.order.indexOf(item.id) + 1,
    evidence: { rank: true, local: item.evidence.local || truth.local[item.id], comparison: item.evidence.comparison || truth.comparison[item.id], trends: item.evidence.trends || !!truth.trends[item.id] },
    local: item.evidence.local || truth.local[item.id] ? 'yes' : 'no data', momentum: truth.trends[item.id] ?? 'unknown' }));
  return { items, slate: optimizeSlate(items, source.memo.constraints) };
}

// Close-call filter: some open, answerable gap could change the bill alone or
// jointly within 4 calls, judged from the starting state only (never the truth).
function decisionRelevant(source) {
  const items = source.memo.items;
  if (!items.every(item => item.evidence.rank)) return false;
  const gaps = items.filter(item => item.terms.available && item.terms.fee != null).flatMap(item => KINDS.filter(kind => !item.evidence[kind]).map(kind => ({ id: `${kind}:${item.id}`, kind, itemId: item.id })));
  return [...jointMateriality(items, source.memo.constraints, gaps, { callsLeft: 4 }).byGap.values()].some(row => row.reachable);
}

function hasInteraction(source) {
  const items = source.memo.items;
  if (!items.every(item => item.evidence.rank)) return false;
  const gaps = items.filter(item => item.terms.available && item.terms.fee != null).flatMap(item => KINDS.filter(kind => !item.evidence[kind]).map(kind => ({ id: `${kind}:${item.id}`, kind, itemId: item.id })));
  const analysis = jointMateriality(items, source.memo.constraints, gaps, { callsLeft: 4 });
  return [...analysis.byGap.values()].some(row => row.material && !row.single);
}

async function measure(source, truth, full, policy, budget, seed = 1) {
  const client = budget ? truthClient(truth, source.memo.items) : null;
  const result = await runAutopilot(source, { maxCalls: budget, maxRounds: 16 }, { research: client, mode: client ? 'synthetic' : 'planning', policy: policy === 'none' ? 'value' : policy, seed });
  const chosen = result.packet.recommendation?.selectedIds ?? [];
  const best = full.slate.feasible ? full.slate.score : 0;
  const scored = chosen.length ? evaluateSelection(full.items, source.memo.constraints, chosen) : null;
  return { agree: same(chosen, full.slate.selectedIds), regret: Math.max(0, Math.round((best - (scored?.feasible ? scored.score : 0)) * 1000) / 1000), calls: client ? client.used() : 0 };
}

async function main() {
  const policies = ['none', 'fixed-order', 'random', 'value-v1', 'value'], budgets = protocol.budgets;
  const scan = close ? (dev ? protocol.closeCallFamily.developmentScan : protocol.closeCallFamily.heldOutScan) : null;
  const accept = Math.min(close ? scan.accept : seeds.to - seeds.from + 1, limit);
  // Scenario selection is sequential and cheap; measurement can be sharded
  // (--shard i/n) and merged (--merge n) without changing which seeds are used.
  const accepted = [];
  let tried = 0;
  for (let seed = close ? scan.fromSeed : seeds.from; accepted.length < accept && tried < 20000; seed++, tried++) {
    const { source, truth } = scenario(seed), full = fullInformation(source, truth);
    if (!optimizeSlate(source.memo.items, source.memo.constraints).feasible && !full.slate.feasible) continue;
    if (close && !decisionRelevant(source)) continue;
    accepted.push(seed);
  }
  const name = `research-policy-${dev ? 'development' : 'heldout'}${close ? '-close' : ''}`;
  const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1].split('/').map(Number) : null;
  const mergeCount = args.includes('--merge') ? Number(args[args.indexOf('--merge') + 1]) : null;
  const shardPath = index => join(repo, 'artifacts', `${name}.shard-${index}.json`);
  let rows = [];
  if (mergeCount) {
    for (let index = 0; index < mergeCount; index++) rows.push(...JSON.parse(readFileSync(shardPath(index), 'utf8')));
    rows.sort((a, b) => a.seed - b.seed);
    if (rows.length !== accepted.length || rows.some((row, index) => row.seed !== accepted[index])) throw new Error('Shards do not cover the accepted scenarios exactly.');
  }
  const mine = mergeCount ? [] : shardArg ? accepted.filter((_, index) => index % shardArg[1] === shardArg[0]) : accepted;
  for (const seed of mine) {
    const { source, truth } = scenario(seed), full = fullInformation(source, truth);
    const row = { seed, interaction: hasInteraction(source), results: {} };
    row.results.none = await measure(source, truth, full, 'none', 0);
    for (const budget of budgets) for (const policy of policies.slice(1)) {
      if (policy === 'random') {
        const runs = await Promise.all([1, 2, 3].map(s => measure(source, truth, full, 'random', budget, s)));
        row.results[`random@${budget}`] = { agree: runs.reduce((sum, run) => sum + run.agree, 0) / runs.length, regret: runs.reduce((sum, run) => sum + run.regret, 0) / runs.length, calls: runs.reduce((sum, run) => sum + run.calls, 0) / runs.length };
      } else row.results[`${policy}@${budget}`] = await measure(source, truth, full, policy, budget);
    }
    rows.push(row);
  }
  if (shardArg) { writeFileSync(shardPath(shardArg[0]), JSON.stringify(rows)); console.log(`shard ${shardArg.join('/')}: ${rows.length} scenarios`); return; }
  const summarize = subset => Object.fromEntries(['none', ...budgets.flatMap(budget => policies.slice(1).map(policy => `${policy}@${budget}`))].map(name => {
    const values = subset.map(row => row.results[name]);
    return [name, { scenarios: values.length, agreement: Math.round(values.reduce((sum, value) => sum + value.agree, 0) * 100 / Math.max(1, values.length)) / 100,
      meanRegret: Math.round(values.reduce((sum, value) => sum + value.regret, 0) * 1000 / Math.max(1, values.length)) / 1000, meanCalls: Math.round(values.reduce((sum, value) => sum + value.calls, 0) * 100 / Math.max(1, values.length)) / 100 }];
  }));
  const report = { protocol: 'evals/autopilot-policy-protocol.json', set: `${dev ? 'development' : 'held-out'}${close ? ' · close calls' : ''}`, seeds: { from: rows[0]?.seed, to: rows.at(-1)?.seed, scanned: tried }, scenarios: rows.length,
    interactionScenarios: rows.filter(row => row.interaction).length, all: summarize(rows), interaction: summarize(rows.filter(row => row.interaction)), providerCalls: 0, rows };
  writeFileSync(join(repo, 'results', `${name}.json`), JSON.stringify(report, null, 2) + '\n');
  const table = summary => budgets.map(budget => `| ${budget} | ${['fixed-order', 'random', 'value-v1', 'value'].map(policy => `${(summary[`${policy}@${budget}`].agreement * 100).toFixed(1)}% / ${summary[`${policy}@${budget}`].meanRegret}`).join(' | ')} | ${['fixed-order', 'random', 'value-v1', 'value'].map(policy => summary[`${policy}@${budget}`].meanCalls).join(' / ')} |`).join('\n');
  const md = `# Research-selection policy evaluation (${report.set})

Protocol: [evals/autopilot-policy-protocol.json](../evals/autopilot-policy-protocol.json). Synthetic ground truth; no provider calls. ${report.scenarios} scenarios (seeds ${report.seeds.from}–${report.seeds.to}); ${report.interactionScenarios} start with at least one jointly-material gap.

No additional research: agreement ${(report.all.none.agreement * 100).toFixed(1)}%, mean regret ${report.all.none.meanRegret} policy points.

## All scenarios — agreement with the full-information bill / mean regret (points)

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
${table(report.all)}

## Interaction subset (${report.interactionScenarios} scenarios)

No additional research: agreement ${(report.interaction.none.agreement * 100).toFixed(1)}%, mean regret ${report.interaction.none.meanRegret}.

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
${table(report.interaction)}

Synthetic outcomes test research selection only. They are not evidence about real Qloo responses, audiences or ticket sales.
`;
  writeFileSync(join(repo, 'results', `${name}.md`), md);
  console.log(md);
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1].endsWith('evaluate-research-policy.mjs')) await main();
